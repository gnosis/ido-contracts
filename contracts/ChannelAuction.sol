pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./libraries/IterableOrderedOrderList.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./libraries/IdToAddressBiMap.sol";
import "./libraries/SafeCast.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ChannelAuction is Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint64;
    using SafeMath for uint96;
    using SafeMath for uint256;
    using SafeCast for uint256;
    using IterableOrderedOrderList for IterableOrderedOrderList.Data;
    using IterableOrderedOrderList for bytes32;
    using IdToAddressBiMap for IdToAddressBiMap.Data;

    modifier atStageOrderPlacement(uint256 auctionId) {
        {
            uint256 auctionStartDate = auctionData[auctionId].auctionStartDate;
            require(
                block.timestamp > auctionStartDate,
                "not yet in order placement phase"
            );
            require(
                block.timestamp <
                    auctionStartDate.add(auctionData[auctionId].maxDuration),
                "auction finished or not yet started"
            );
            require(
                bytes32(0) == auctionData[auctionId].clearingPriceOrder,
                "no longer in order placement phase"
            );
        }
        _;
    }

    modifier atStagePriceCalculation(uint256 auctionId) {
        require(
            auctionData[auctionId].clearingPriceOrder == bytes32(0),
            "Auction already finished"
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

    event NewSellOrder(
        uint256 indexed auctionId,
        uint64 indexed userId,
        uint96 buyAmount,
        uint96 sellAmount
    );
    event ClaimedFromOrder(
        uint256 indexed auctionId,
        uint64 indexed userId,
        uint96 buyAmount,
        uint96 sellAmount
    );
    event NewUser(uint64 indexed userId, address indexed userAddress);
    event NewAuction(
        uint256 indexed auctionId,
        IERC20 indexed _auctioningToken,
        IERC20 indexed _biddingToken,
        uint64 userId,
        uint96 auctionStartDate,
        uint96 _auctionedSellAmount,
        uint96 _auctioneerBuyAmountMinimum,
        uint96 _auctioneerBuyAmountMaximum,
        uint96 minimumBiddingAmountPerOrder,
        uint96 maxDuration
    );
    event AuctionCleared(
        uint256 indexed auctionId,
        uint96 soldAuctioningTokens,
        uint96 soldBiddingTokens,
        bytes32 clearingPriceOrder
    );
    event UserRegistration(address indexed user, uint64 userId);

    struct AuctionData {
        IERC20 auctioningToken;
        IERC20 biddingToken;
        uint96 auctionStartDate;
        bytes32 initialAuctionOrder;
        uint96 minimumBiddingAmountPerOrder;
        bytes32 clearingPriceOrder;
        uint96 volumeClearingPriceOrder;
        uint96 maxDuration;
        uint96 auctioneerBuyAmountMaximum;
        bytes32 interimOrder;
        uint96 volumeInterimOrder;
    }
    mapping(uint256 => IterableOrderedOrderList.Data) internal sellOrders;
    mapping(uint256 => AuctionData) public auctionData;

    IdToAddressBiMap.Data private registeredUsers;
    uint64 public numUsers;
    uint256 public auctionCounter;

    constructor() public Ownable() {}

    uint256 public feeNumerator = 0;
    uint256 public constant FEE_DENOMINATOR = 1000;
    uint64 public feeReceiverUserId = 1;

    function setFeeParameters(
        uint256 newFeeNumerator,
        address newfeeReceiverAddress
    ) public onlyOwner() {
        require(
            newFeeNumerator <= 5,
            "Fee is not allowed to be set higher than 0.5%"
        );
        // caution: for currently running auctions, the feeReceiverUserId is changing as well.
        feeReceiverUserId = getUserId(newfeeReceiverAddress);
        feeNumerator = newFeeNumerator;
    }

    // @dev: function to intiate a new auction
    // Warning: In case the auction is expected to raise more than
    // 2^96 units of the biddingToken, don't start the auction, as
    // it will not be settlable. This corresponds to about 79
    // billion DAI.
    //
    // Prices between biddingToken and auctioningToken are expressed by a
    // fraction whose components are stored as uint96.
    function initiateAuction(
        IERC20 _auctioningToken,
        IERC20 _biddingToken,
        uint96 _auctionedSellAmount,
        uint96 _auctioneerBuyAmountMinimum,
        uint96 _auctioneerBuyAmountMaximum,
        uint96 _auctionStartDate,
        uint96 _minimumBiddingAmountPerOrder,
        uint96 _maxDuration
    ) public returns (uint256) {
        // withdraws sellAmount + fees
        _auctioningToken.safeTransferFrom(
            msg.sender,
            address(this),
            _auctionedSellAmount //[0]
        );
        if (feeNumerator > 0) {
            _auctioningToken.safeTransferFrom(
                msg.sender,
                address(this),
                _auctionedSellAmount.mul(feeNumerator).div(FEE_DENOMINATOR) //[1]
            );
        }
        require(_auctionedSellAmount > 0, "cannot auction zero tokens");
        require(
            _auctioneerBuyAmountMinimum > 0,
            "_auctioneerBuyAmountMinimum must be positive"
        );
        require(
            _auctioneerBuyAmountMaximum > _auctioneerBuyAmountMinimum,
            "_auctioneerBuyAmountMaximum must be higher than _auctioneerBuyAmountMinimum"
        );
        require(
            _minimumBiddingAmountPerOrder > 0,
            "minimumBiddingAmountPerOrder is not allowed to be zero"
        );
        require(
            _auctionStartDate + _maxDuration >= now,
            "time periods are not configured correctly"
        );
        auctionCounter = auctionCounter.add(1);
        sellOrders[auctionCounter].initializeEmptyList();
        uint64 userId = getUserId(msg.sender);
        auctionData[auctionCounter] = AuctionData(
            _auctioningToken,
            _biddingToken,
            _auctionStartDate,
            IterableOrderedOrderList.encodeOrder(
                userId,
                _auctioneerBuyAmountMinimum,
                _auctionedSellAmount
            ),
            _minimumBiddingAmountPerOrder,
            bytes32(0),
            0,
            _maxDuration,
            _auctioneerBuyAmountMaximum,
            bytes32(0),
            0
        );
        emit NewAuction(
            auctionCounter,
            _auctioningToken,
            _biddingToken,
            userId,
            _auctionStartDate,
            _auctionedSellAmount,
            _auctioneerBuyAmountMinimum,
            _auctioneerBuyAmountMaximum,
            _minimumBiddingAmountPerOrder,
            _maxDuration
        );
        return auctionCounter;
    }

    function placeSellOrders(
        uint256 auctionId,
        uint96 _minBuyAmounts,
        uint96 _sellAmounts,
        bytes32 _prevSellOrders
    ) external atStageOrderPlacement(auctionId) {
        _placeSellOrders(
            auctionId,
            _minBuyAmounts,
            _sellAmounts,
            _prevSellOrders,
            msg.sender
        );
    }

    function placeSellOrdersOnBehalf(
        uint256 auctionId,
        uint96 _minBuyAmounts,
        uint96 _sellAmounts,
        bytes32 _prevSellOrders,
        address orderSubmitter
    ) external atStageOrderPlacement(auctionId) {
        _placeSellOrders(
            auctionId,
            _minBuyAmounts,
            _sellAmounts,
            _prevSellOrders,
            orderSubmitter
        );
    }

    function _placeSellOrders(
        uint256 auctionId,
        uint96 _minBuyAmount,
        uint96 _sellAmount,
        bytes32 _prevSellOrder,
        address orderSubmitter
    ) internal {
        require(_minBuyAmount > 0, "_minBuyAmounts must be greater than 0");
        uint256 currentMinBuyAmountFromAuctioneer = 0;
        (
            ,
            uint96 buyAmountOfInitialAuctionOrder,
            uint96 sellAmountOfInitialAuctionOrder
        ) = auctionData[auctionId].initialAuctionOrder.decodeOrder();
        {
            uint96 auctioneerBuyAmountMaximum =
                auctionData[auctionId].auctioneerBuyAmountMaximum;
            currentMinBuyAmountFromAuctioneer = getCurrentMinBuyAmountFromAuctioneer(
                buyAmountOfInitialAuctionOrder,
                auctioneerBuyAmountMaximum,
                block
                    .timestamp
                    .sub(auctionData[auctionId].auctionStartDate)
                    .toUint96(),
                auctionData[auctionId].maxDuration
            );
        }
        uint96 minBuyAmount = _minBuyAmount;
        {
            require(
                _minBuyAmount.mul(buyAmountOfInitialAuctionOrder) <
                    sellAmountOfInitialAuctionOrder.mul(_sellAmount),
                "limit price not better than mimimal offer"
            );
            if (
                _minBuyAmount.mul(currentMinBuyAmountFromAuctioneer) <
                sellAmountOfInitialAuctionOrder.mul(_sellAmount)
            ) {
                minBuyAmount = _sellAmount
                    .mul(currentMinBuyAmountFromAuctioneer)
                    .div(sellAmountOfInitialAuctionOrder)
                    .toUint96();
            }
        }
        uint64 userId = getUserId(orderSubmitter);
        // orders should have a minimum bid size in order to limit the gas
        // required to compute the final price of the auction.
        require(
            _sellAmount > auctionData[auctionId].minimumBiddingAmountPerOrder,
            "order too small"
        );
        require(
            sellOrders[auctionId].insert(
                IterableOrderedOrderList.encodeOrder(
                    userId,
                    minBuyAmount,
                    _sellAmount
                ),
                _prevSellOrder
            ),
            "could not insert order"
        );
        auctionData[auctionId].biddingToken.safeTransferFrom(
            msg.sender,
            address(this),
            _sellAmount
        ); //[1]
        emit NewSellOrder(auctionId, userId, minBuyAmount, _sellAmount);
    }

    function settleAuctionWithAdditionalOrder(
        uint256 auctionId,
        uint96 _minBuyAmount,
        uint96 _sellAmount,
        bytes32 _prevSellOrder
    ) public atStagePriceCalculation(auctionId) {
        //claculate the maximal outstanding volume and adjust sell amount
        _placeSellOrders(
            auctionId,
            _minBuyAmount,
            _sellAmount,
            _prevSellOrder,
            msg.sender
        );
        settleAuction(auctionId);
        bytes32[] memory claimOrder = new bytes32[](1);
        claimOrder[0] = IterableOrderedOrderList.encodeOrder(
            getUserId(msg.sender),
            _minBuyAmount,
            _sellAmount
        );
        claimFromParticipantOrder(auctionId, claimOrder);
    }

    function getCurrentMinBuyAmountFromAuctioneer(
        uint96 buyAmountMinimum,
        uint96 buyAmountMaximum,
        uint96 passedTime,
        uint96 maxDuration
    ) public pure returns (uint96) {
        if (passedTime > maxDuration) {
            return buyAmountMinimum;
        } else {
            return
                buyAmountMaximum
                    .sub(
                    (buyAmountMaximum.sub(buyAmountMinimum))
                        .mul(passedTime)
                        .div(maxDuration)
                )
                    .toUint96();
        }
    }

    // @dev function settling the auction and calculating the price
    function settleAuction(uint256 auctionId)
        public
        atStagePriceCalculation(auctionId)
        returns (bytes32 clearingOrder)
    {
        (uint64 auctioneerId, , uint96 fullAuctionedAmount) =
            auctionData[auctionId].initialAuctionOrder.decodeOrder();

        uint96 minAuctionedBuyAmount = 0;
        {
            (, uint96 auctioneerBuyAmountMinimum, ) =
                auctionData[auctionId].initialAuctionOrder.decodeOrder();
            minAuctionedBuyAmount = getCurrentMinBuyAmountFromAuctioneer(
                auctioneerBuyAmountMinimum,
                auctionData[auctionId].auctioneerBuyAmountMaximum,
                block
                    .timestamp
                    .sub(auctionData[auctionId].auctionStartDate)
                    .toUint96(),
                auctionData[auctionId].maxDuration
            );
        }
        uint256 currentBidSum = 0;
        bytes32 currentOrder = IterableOrderedOrderList.QUEUE_START;
        uint256 buyAmountOfIter;
        uint256 sellAmountOfIter;
        uint96 fillVolumeOfAuctioneerOrder = fullAuctionedAmount;
        // Sum order up, until fullAuctionedAmount is fully bought or queue end is reached
        do {
            bytes32 nextOrder = sellOrders[auctionId].next(currentOrder);
            if (nextOrder == IterableOrderedOrderList.QUEUE_END) {
                if (
                    now >
                    auctionData[auctionId].auctionStartDate.add(
                        auctionData[auctionId].maxDuration
                    )
                ) break;
                // fractional fillements are accepted, as price won't decrease more
                else {
                    // fractional fillments are not accepted, as prices will continue to decrease
                    revert("Auction can not yet be settled");
                }
            }
            currentOrder = nextOrder;
            (, buyAmountOfIter, sellAmountOfIter) = currentOrder.decodeOrder();
            currentBidSum = currentBidSum.add(sellAmountOfIter);
        } while (
            currentBidSum.mul(buyAmountOfIter) <
                fullAuctionedAmount.mul(sellAmountOfIter)
        );

        if (
            currentBidSum > 0 &&
            currentBidSum.mul(buyAmountOfIter) >=
            fullAuctionedAmount.mul(sellAmountOfIter)
        ) {
            // All considered/summed orders are sufficient to close the auction fully
            // at price between current and previous orders.
            uint256 uncoveredBids =
                currentBidSum.sub(
                    fullAuctionedAmount.mul(sellAmountOfIter).div(
                        buyAmountOfIter
                    )
                );

            if (sellAmountOfIter >= uncoveredBids) {
                //[13]
                // Auction fully filled via partial match of currentOrder
                uint256 sellAmountClearingOrder =
                    sellAmountOfIter.sub(uncoveredBids);
                auctionData[auctionId]
                    .volumeClearingPriceOrder = sellAmountClearingOrder
                    .toUint96();
                currentBidSum = currentBidSum.sub(uncoveredBids);
                clearingOrder = currentOrder;
            } else {
                //[14]
                // Auction fully filled via price strictly between currentOrder and the order
                // immediately before. For a proof, see the security-considerations.md
                currentBidSum = currentBidSum.sub(sellAmountOfIter);
                clearingOrder = IterableOrderedOrderList.encodeOrder(
                    0,
                    fullAuctionedAmount,
                    currentBidSum.toUint96()
                );
            }
        } else {
            // All considered/summed orders are not sufficient to close the auction fully at price of last order //[18]
            // Either a higher price must be used or auction is only partially filled

            if (currentBidSum > minAuctionedBuyAmount) {
                //[15]
                // Price higher than last order would fill the auction
                clearingOrder = IterableOrderedOrderList.encodeOrder(
                    0,
                    fullAuctionedAmount,
                    currentBidSum.toUint96()
                );
            } else {
                //[16]
                // Even at the initial auction price, the auction is partially filled
                clearingOrder = IterableOrderedOrderList.encodeOrder(
                    0,
                    fullAuctionedAmount,
                    minAuctionedBuyAmount
                );
                fillVolumeOfAuctioneerOrder = currentBidSum
                    .mul(fullAuctionedAmount)
                    .div(minAuctionedBuyAmount)
                    .toUint96();
            }
        }
        auctionData[auctionId].clearingPriceOrder = clearingOrder;
        processAuctioneerFunds(
            auctionId,
            fillVolumeOfAuctioneerOrder,
            auctioneerId,
            fullAuctionedAmount
        );
        emit AuctionCleared(
            auctionId,
            fillVolumeOfAuctioneerOrder,
            uint96(currentBidSum),
            clearingOrder
        );
    }

    function claimFromParticipantOrder(
        uint256 auctionId,
        bytes32[] memory orders
    )
        public
        atStageFinished(auctionId)
        returns (
            uint256 sumAuctioningTokenAmount,
            uint256 sumBiddingTokenAmount
        )
    {
        for (uint256 i = 0; i < orders.length; i++) {
            // Note: we don't need to keep any information about the node since
            // no new elements need to be inserted.
            require(
                sellOrders[auctionId].remove(orders[i]),
                "order is no longer claimable"
            );
        }
        AuctionData memory auction = auctionData[auctionId];
        (, uint96 priceNumerator, uint96 priceDenominator) =
            auction.clearingPriceOrder.decodeOrder();
        (uint64 userId, , ) = orders[0].decodeOrder();
        for (uint256 i = 0; i < orders.length; i++) {
            (uint64 userIdOrder, uint96 buyAmount, uint96 sellAmount) =
                orders[i].decodeOrder();
            require(
                userIdOrder == userId,
                "only allowed to claim for same user"
            );
            //[23]
            if (orders[i] == auction.clearingPriceOrder) {
                //[25]
                sumAuctioningTokenAmount = sumAuctioningTokenAmount.add(
                    auction.volumeClearingPriceOrder.mul(priceNumerator).div(
                        priceDenominator
                    )
                );
                sumBiddingTokenAmount = sumBiddingTokenAmount.add(
                    sellAmount.sub(auction.volumeClearingPriceOrder)
                );
            } else {
                if (orders[i].smallerThan(auction.clearingPriceOrder)) {
                    //[17]
                    sumAuctioningTokenAmount = sumAuctioningTokenAmount.add(
                        sellAmount.mul(priceNumerator).div(priceDenominator)
                    );
                } else {
                    //[24]
                    sumBiddingTokenAmount = sumBiddingTokenAmount.add(
                        sellAmount
                    );
                }
            }
            emit ClaimedFromOrder(auctionId, userId, buyAmount, sellAmount);
        }
        sendOutTokens(
            auctionId,
            sumAuctioningTokenAmount,
            sumBiddingTokenAmount,
            userId
        ); //[3]
    }

    function processAuctioneerFunds(
        uint256 auctionId,
        uint256 fillVolumeOfAuctioneerOrder,
        uint64 auctioneerId,
        uint96 fullAuctionedAmount
    ) internal {
        //[11]
        (, uint96 priceNumerator, uint96 priceDenominator) =
            auctionData[auctionId].clearingPriceOrder.decodeOrder();
        uint256 unsettledAuctionTokens =
            fullAuctionedAmount.sub(fillVolumeOfAuctioneerOrder);
        uint256 auctioningTokenAmount = unsettledAuctionTokens;
        uint256 biddingTokenAmount =
            fillVolumeOfAuctioneerOrder.mul(priceDenominator).div(
                priceNumerator
            );
        sendOutTokens(
            auctionId,
            auctioningTokenAmount,
            biddingTokenAmount,
            auctioneerId
        ); //[5]
    }

    function sendOutTokens(
        uint256 auctionId,
        uint256 auctioningTokenAmount,
        uint256 biddingTokenAmount,
        uint64 userId
    ) internal {
        address userAddress = registeredUsers.getAddressAt(userId);
        if (auctioningTokenAmount > 0) {
            auctionData[auctionId].auctioningToken.safeTransfer(
                userAddress,
                auctioningTokenAmount
            );
        }
        if (biddingTokenAmount > 0) {
            auctionData[auctionId].biddingToken.safeTransfer(
                userAddress,
                biddingTokenAmount
            );
        }
    }

    function registerUser(address user) public returns (uint64 userId) {
        numUsers = numUsers.add(1).toUint64();
        require(
            registeredUsers.insert(numUsers, user),
            "User already registered"
        );
        userId = numUsers;
        emit UserRegistration(user, userId);
    }

    function getUserId(address user) public returns (uint64 userId) {
        if (registeredUsers.hasAddress(user)) {
            userId = registeredUsers.getId(user);
        } else {
            userId = registerUser(user);
            emit NewUser(userId, user);
        }
    }

    function getSecondsRemainingUntilLastPossibleClose(uint256 auctionId)
        public
        view
        returns (uint256)
    {
        uint256 auctionEndDate =
            auctionData[auctionId].auctionStartDate.add(
                auctionData[auctionId].maxDuration
            );
        if (auctionEndDate < block.timestamp) {
            return 0;
        }
        return auctionEndDate.sub(block.timestamp);
    }

    function containsOrder(uint256 auctionId, bytes32 order)
        public
        view
        returns (bool)
    {
        return sellOrders[auctionId].contains(order);
    }
}
