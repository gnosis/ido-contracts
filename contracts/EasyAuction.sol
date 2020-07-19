pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./libraries/IterableOrderedOrderSet.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./libraries/IdToAddressBiMap.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";


contract EasyAuction {
  using SafeMath for uint64;
  using SafeMath for uint96;
  using SafeMath for uint256;
  using SafeCast for uint256;
  using IterableOrderedOrderSet for IterableOrderedOrderSet.Data;
  using IterableOrderedOrderSet for bytes32;
  using IdToAddressBiMap for IdToAddressBiMap.Data;

  modifier atStageOrderplacement(uint256 auctionId) {
    require(
      block.timestamp < auctionData[auctionId].auctionEndDate,
      "Auction no longer in order placement phase"
    );
    _;
  }

  modifier atStageSolutionSubmission(uint256 auctionId) {
    require(
      block.timestamp > auctionData[auctionId].auctionEndDate &&
        auctionData[auctionId].clearingPriceOrder == bytes32(0),
      "Auction not in solution submission phase"
    );
    _;
  }

  modifier atStageFinished(uint256 auctionId) {
    require(
      auctionData[auctionId].clearingPriceOrder != bytes32(0),
      "Auction not yet finished"
    );
    _;
  }

  event NewSellOrders(
    uint256 indexed auctionId,
    uint64 indexed userId,
    uint96[] sellAmount,
    uint96[] buyAmount
  );
  event CancellationSellOrders(
    uint256 indexed auctionId,
    uint64 indexed userId,
    uint96 sellAmount,
    uint96 buyAmount
  );
  event NewAuction(
    uint256 auctionId,
    ERC20 indexed _sellToken,
    ERC20 indexed _buyToken
  );
  event UserRegistration(address user, uint64 userId);

  struct AuctionData {
    ERC20 sellToken;
    ERC20 buyToken;
    uint256 auctionEndDate;
    bytes32 initialAuctionOrder;
    bytes32 clearingPriceOrder;
    uint96 volumeClearingPriceOrder;
    uint96 rewardFactor;
  }
  mapping(uint256 => IterableOrderedOrderSet.Data) public sellOrders;
  mapping(uint256 => AuctionData) public auctionData;
  IdToAddressBiMap.Data private registeredUsers;
  uint64 public numUsers;
  uint256 public auctionCounter;

  function initiateAuction(
    ERC20 _sellToken,
    ERC20 _buyToken,
    uint256 duration,
    uint96 _sellAmount,
    uint96 _buyAmount
  ) public returns (uint256) {
    uint64 userId = getUserId(msg.sender);
    require(
      _sellToken.transferFrom(msg.sender, address(this), _sellAmount),
      "transfer was not successful"
    );
    auctionCounter++;
    auctionData[auctionCounter] = AuctionData(
      _sellToken,
      _buyToken,
      block.timestamp + duration,
      IterableOrderedOrderSet.encodeOrder(userId, _buyAmount, _sellAmount),
      bytes32(0),
      0,
      0
    );
    emit NewAuction(auctionCounter, _sellToken, _buyToken);
    return auctionCounter;
  }

  function placeSellOrders(
    uint256 auctionId,
    uint96[] memory _buyAmount,
    uint96[] memory _sellAmount,
    bytes32[] memory _prevSellOrders
  ) public atStageOrderplacement(auctionId) {
    (
      ,
      uint96 buyAmountOfInitialAuctionOrder,
      uint96 sellAmountOfInitialAuctionOrder
    ) = auctionData[auctionId].initialAuctionOrder.decodeOrder();
    uint256 sumOfSellAmounts = 0;
    uint64 userId = getUserId(msg.sender);
    for (uint256 i = 0; i < _buyAmount.length; i++) {
      sumOfSellAmounts = sumOfSellAmounts.add(_sellAmount[i]);
      require(
        _buyAmount[i].mul(buyAmountOfInitialAuctionOrder) >
          sellAmountOfInitialAuctionOrder.mul(_sellAmount[i]),
        "limit price not better than mimimal offer"
      );
      // small orders can not be allowed to quarantee price calculation
      require(
        _buyAmount[i] > sellAmountOfInitialAuctionOrder / 5000,
        "order too small"
      );
      sellOrders[auctionId].insert(
        IterableOrderedOrderSet.encodeOrder(
          userId,
          _buyAmount[i],
          _sellAmount[i]
        ),
        _prevSellOrders[i]
      );
    }
    emit NewSellOrders(auctionId, userId, _buyAmount, _sellAmount);
    require(
      auctionData[auctionId].buyToken.transferFrom(
        msg.sender,
        address(this),
        sumOfSellAmounts
      ),
      "transfer was not successful"
    );
  }

  function cancelSellOrders(
    uint256 auctionId,
    bytes32[] memory _sellOrders,
    bytes32[] memory _prevSellOrders
  ) public atStageOrderplacement(auctionId) {
    uint64 userId = getUserId(msg.sender);
    uint256 claimableAmount = 0;
    for (uint256 i = 0; i < _sellOrders.length; i++) {
      (
        uint64 userIdOfIter,
        uint96 buyAmountOfIter,
        uint96 sellAmountOfIter
      ) = _sellOrders[i].decodeOrder();
      require(userIdOfIter == userId, "Only the user can cancel his orders");
      if (sellOrders[auctionId].remove(_sellOrders[i], _prevSellOrders[i])) {
        claimableAmount = claimableAmount.add(buyAmountOfIter);
        emit CancellationSellOrders(
          auctionId,
          userId,
          buyAmountOfIter,
          sellAmountOfIter
        );
      }
    }
    require(
      auctionData[auctionId].buyToken.transfer(msg.sender, claimableAmount),
      "transfer was not successful"
    );
  }

  function calculatePrice(
    uint256 auctionId,
    uint96 priceNumerator,
    uint96 priceDenominator
  ) public atStageSolutionSubmission(auctionId) {
    (, , uint96 sellAmount) = auctionData[auctionId]
      .initialAuctionOrder
      .decodeOrder();

    bool buyAmountExceedsSellAmount = true;
    uint96 sumBuyAmount = 0;
    if (sellOrders[auctionId].size > 0) {
      // Search for single partically filled order or last fully filled order:
      bytes32 iterOrder = IterableOrderedOrderSet.QUEUE_START;
      while (sumBuyAmount < sellAmount) {
        iterOrder = sellOrders[auctionId].next(iterOrder);
        if (iterOrder == IterableOrderedOrderSet.QUEUE_END) {
          buyAmountExceedsSellAmount = false;
          break;
        }
        (, , uint96 sellAmountOfIter) = iterOrder.decodeOrder();
        sumBuyAmount = uint96(
          sumBuyAmount.add(sellAmountOfIter).mul(priceNumerator).div(
            priceDenominator
          )
        );
      }
      if (buyAmountExceedsSellAmount) {
        bytes32 clearingPriceOrder = iterOrder;

        auctionData[auctionId].volumeClearingPriceOrder = uint96(
          priceNumerator.sub(sumBuyAmount.sub(sellAmount))
        );
        auctionData[auctionId].clearingPriceOrder = clearingPriceOrder;
      }
    } else {
      buyAmountExceedsSellAmount = false;
    }
    if (!buyAmountExceedsSellAmount) {
      bytes32 clearingPriceOrder = auctionData[auctionId].initialAuctionOrder;
      auctionData[auctionId].volumeClearingPriceOrder = uint96(sumBuyAmount);
      auctionData[auctionId].clearingPriceOrder = clearingPriceOrder;
    }
    (
      ,
      uint96 priceNumeratorOfCleanringOrder,
      uint96 priceDenominatorOfCleanringOrder
    ) = auctionData[auctionId].clearingPriceOrder.decodeOrder();
    require(
      priceNumeratorOfCleanringOrder == priceNumerator &&
        priceDenominatorOfCleanringOrder == priceDenominator,
      "Price was supplied incorrect"
    );
    uint256 submissionTime = block.timestamp.sub(
      auctionData[auctionId].auctionEndDate
    );
    auctionData[auctionId].rewardFactor = uint96(
      Math.min(
        uint256(100000000).div(submissionTime.mul(submissionTime).add(1)),
        10
      )
    );
    claimSellerFunds(auctionId, false);
  }

  function claimFromBuyOrder(uint256 auctionId, bytes32[] memory orders)
    public
    atStageFinished(auctionId)
    returns (uint256 sellTokenAmount, uint256 buyTokenAmount)
  {
    AuctionData memory auction = auctionData[auctionId];
    (, uint96 priceDenominator, uint96 priceNumerator) = auction
      .clearingPriceOrder
      .decodeOrder();
    for (uint256 i = 0; i < orders.length; i++) {
      (uint64 userId, uint96 buyAmount, uint96 sellAmount) = orders[i]
        .decodeOrder();
      if (orders[i] == auction.clearingPriceOrder) {
        sellTokenAmount = auction
          .volumeClearingPriceOrder
          .mul(priceNumerator)
          .div(priceDenominator);
        buyTokenAmount = buyAmount.mul(buyAmount).div(sellAmount).sub(
          auction.volumeClearingPriceOrder
        );
      } else {
        if (orders[i].biggerThan(auction.clearingPriceOrder)) {
          sellTokenAmount = buyAmount.mul(priceNumerator).div(priceDenominator);
        } else {
          buyTokenAmount = buyAmount;
        }
      }
      sendOutTokens(auctionId, sellTokenAmount, buyTokenAmount, userId);
    }
  }

  function claimFromSellOrder(uint256 auctionId)
    public
    atStageFinished(auctionId)
    returns (uint256 sellTokenAmount, uint256 buyTokenAmount)
  {
    return claimSellerFunds(auctionId, true);
  }

  function claimSellerFunds(uint256 auctionId, bool isOriginalSeller)
    internal
    returns (uint256 sellTokenAmount, uint256 buyTokenAmount)
  {
    (
      uint64 userId,
      uint96 buyAmount,
      uint96 sellAmount
    ) = auctionData[auctionId].initialAuctionOrder.decodeOrder();
    if (
      auctionData[auctionId].initialAuctionOrder ==
      auctionData[auctionId].clearingPriceOrder
    ) {
      sellTokenAmount = sellAmount.sub(
        auctionData[auctionId].volumeClearingPriceOrder
      );
      buyTokenAmount = auctionData[auctionId]
        .volumeClearingPriceOrder
        .mul(buyAmount)
        .div(sellAmount);
    } else {
      (
        ,
        uint96 priceNumerator,
        uint96 priceDenominator
      ) = IterableOrderedOrderSet.decodeOrder(
        auctionData[auctionId].clearingPriceOrder
      );
      buyTokenAmount = sellAmount.mul(priceNumerator).div(priceDenominator);
    }
    uint96 rewardFactor = auctionData[auctionId].rewardFactor;
    if (isOriginalSeller) {
      sendOutTokens(
        auctionId,
        sellTokenAmount.mul(rewardFactor.sub(1)).div(rewardFactor),
        buyTokenAmount.mul(rewardFactor.sub(1)).div(rewardFactor),
        userId
      );
    } else {
      sendOutTokens(
        auctionId,
        sellTokenAmount.div(rewardFactor),
        buyTokenAmount.div(rewardFactor),
        getUserId(msg.sender)
      );
    }
  }

  function sendOutTokens(
    uint256 auctionId,
    uint256 sellTokenAmount,
    uint256 buyTokenAmount,
    uint64 userId
  ) internal {
    address userAddress = registeredUsers.getAddressAt(userId);
    require(
      auctionData[auctionId].sellToken.transfer(userAddress, sellTokenAmount),
      "Claim transfer for sellToken failed"
    );
    require(
      auctionData[auctionId].buyToken.transfer(userAddress, buyTokenAmount),
      "Claim transfer for buyToken failed"
    );
  }

  function registerUser(address user) public returns (uint64 userId) {
    require(registeredUsers.insert(numUsers, user), "User already registered");
    userId = numUsers;
    numUsers = numUsers.add(1).toUint64();
    emit UserRegistration(user, userId);
  }

  function getUserId(address user) public returns (uint64 userId) {
    if (registeredUsers.hasAddress(user)) {
      return registeredUsers.getId(user);
    } else {
      return registerUser(user);
    }
  }

  function getSecondsRemainingInBatch(uint256 auctionId)
    public
    view
    returns (uint256)
  {
    if (auctionData[auctionId].auctionEndDate < block.timestamp) {
      return 0;
    }
    return auctionData[auctionId].auctionEndDate.sub(block.timestamp);
  }
}
