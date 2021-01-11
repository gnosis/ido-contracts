// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./libraries/IterableOrderedOrderSet.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./libraries/IdToAddressBiMap.sol";
import "./libraries/SafeCast.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

contract EasyAuction is Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint64;
    using SafeMath for uint96;
    using SafeMath for uint256;
    using SafeCast for uint256;
    using IterableOrderedOrderSet for IterableOrderedOrderSet.Data;
    using IterableOrderedOrderSet for bytes32;
    using IdToAddressBiMap for IdToAddressBiMap.Data;

    modifier atStageOrderPlacement(uint256 auctionId) {
        require(
            block.timestamp < auctionData[auctionId].auctionEndDate,
            "no longer in order placement phase"
        );
        _;
    }

    modifier atStageOrderPlacementAndCancelation(uint256 auctionId) {
        require(
            block.timestamp < auctionData[auctionId].auctionEndDate &&
                block.timestamp <
                auctionData[auctionId].orderCancellationEndDate,
            "no longer in order placement and cancelation phase"
        );
        _;
    }

    modifier atStageSolutionSubmission(uint256 auctionId) {
        {
            uint256 auctionEndDate = auctionData[auctionId].auctionEndDate;
            require(
                auctionEndDate != 0 &&
                    block.timestamp > auctionEndDate &&
                    auctionData[auctionId].clearingPriceOrder == bytes32(0),
                "Auction not in solution submission phase"
            );
        }
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
    event CancellationSellOrder(
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
        uint256 orderCancellationEndDate,
        uint256 auctionEndDate,
        uint96 _auctionedSellAmount,
        uint96 _minBuyAmount,
        uint256 minimumBiddingAmountPerOrder,
        uint256 minFundingThreshold
    );
    event AuctionCleared(
        uint256 indexed auctionId,
        uint96 priceNumerator,
        uint96 priceDenominator
    );
    event UserRegistration(address indexed user, uint64 userId);

    struct AuctionData {
        IERC20 auctioningToken;
        IERC20 biddingToken;
        uint256 orderCancellationEndDate;
        uint256 auctionEndDate;
        bytes32 initialAuctionOrder;
        uint256 minimumBiddingAmountPerOrder;
        uint256 interimSumBidAmount;
        bytes32 interimOrder;
        bytes32 clearingPriceOrder;
        uint96 volumeClearingPriceOrder;
        uint256 feeNumerator;
        uint256 minFundingThreshold;
        bool minFundingThresholdNotReached;
    }
    mapping(uint256 => IterableOrderedOrderSet.Data) internal sellOrders;
    mapping(uint256 => AuctionData) public auctionData;
    IdToAddressBiMap.Data private registeredUsers;
    uint64 public numUsers;
    uint256 public auctionCounter;

    constructor() public Ownable() {}

    uint256 public feeNumerator = 0;
    uint256 public constant FEE_DENOMINATOR = 1000;
    uint64 public feeReceiverUserId = 0;

    function setFeeParameters(
        uint256 newFeeNumerator,
        address newfeeReceiverAddress
    ) public onlyOwner() {
        require(
            newFeeNumerator <= 15,
            "Fee is not allowed to be set higher than 1.5%"
        );
        // caution: for currently running auctions, the feeReceiverUserId is changing as well.
        feeReceiverUserId = getUserId(newfeeReceiverAddress);
        feeNumerator = newFeeNumerator;
    }

    function initiateAuction(
        IERC20 _auctioningToken,
        IERC20 _biddingToken,
        uint256 orderCancelationPeriodDuration,
        uint256 duration,
        uint96 _auctionedSellAmount,
        uint96 _minBuyAmount,
        uint256 minimumBiddingAmountPerOrder,
        uint256 minFundingThreshold
    ) public returns (uint256) {
        uint64 userId = getUserId(msg.sender);

        // withdraws sellAmount + fees
        _auctioningToken.safeTransferFrom(
            msg.sender,
            address(this),
            _auctionedSellAmount.mul(FEE_DENOMINATOR.add(feeNumerator)).div(
                FEE_DENOMINATOR
            )
        );
        require(_auctionedSellAmount > 0, "cannot auction zero tokens");
        require(_minBuyAmount > 0, "tokens cannot be auctioned for free");
        require(
            minimumBiddingAmountPerOrder > 0,
            "minimumBiddingAmountPerOrder is not allowed to be zero"
        );
        auctionCounter++;
        sellOrders[auctionCounter].initializeEmptyList();

        uint256 orderCancellationEndDate =
            block.timestamp + orderCancelationPeriodDuration;
        uint256 auctionEndDate = block.timestamp + duration;
        auctionData[auctionCounter] = AuctionData(
            _auctioningToken,
            _biddingToken,
            orderCancellationEndDate,
            auctionEndDate,
            IterableOrderedOrderSet.encodeOrder(
                userId,
                _minBuyAmount,
                _auctionedSellAmount
            ),
            minimumBiddingAmountPerOrder,
            0,
            IterableOrderedOrderSet.QUEUE_START,
            bytes32(0),
            0,
            feeNumerator,
            minFundingThreshold,
            false
        );
        emit NewAuction(
            auctionCounter,
            _auctioningToken,
            _biddingToken,
            orderCancellationEndDate,
            auctionEndDate,
            _auctionedSellAmount,
            _minBuyAmount,
            minimumBiddingAmountPerOrder,
            minFundingThreshold
        );
        return auctionCounter;
    }

    function placeSellOrders(
        uint256 auctionId,
        uint96[] memory _minBuyAmounts,
        uint96[] memory _sellAmounts,
        bytes32[] memory _prevSellOrders
    ) public atStageOrderPlacement(auctionId) returns (uint64 userId) {
        {
            // Run verifications of all orders
            (
                ,
                uint96 buyAmountOfInitialAuctionOrder,
                uint96 sellAmountOfInitialAuctionOrder
            ) = auctionData[auctionId].initialAuctionOrder.decodeOrder();
            for (uint256 i = 0; i < _minBuyAmounts.length; i++) {
                require(
                    _minBuyAmounts[i].mul(buyAmountOfInitialAuctionOrder) <
                        sellAmountOfInitialAuctionOrder.mul(_sellAmounts[i]),
                    "limit price not better than mimimal offer"
                );
                // orders should have a minimum bid size in order to limit the gas
                // required to compute the final price of the auction.
                require(
                    _sellAmounts[i] >
                        auctionData[auctionId].minimumBiddingAmountPerOrder,
                    "order too small"
                );
            }
        }
        uint256 sumOfSellAmounts = 0;
        userId = getUserId(msg.sender);
        for (uint256 i = 0; i < _minBuyAmounts.length; i++) {
            bool success =
                sellOrders[auctionId].insert(
                    IterableOrderedOrderSet.encodeOrder(
                        userId,
                        _minBuyAmounts[i],
                        _sellAmounts[i]
                    ),
                    _prevSellOrders[i]
                );
            if (success) {
                sumOfSellAmounts = sumOfSellAmounts.add(_sellAmounts[i]);
                emit NewSellOrder(
                    auctionId,
                    userId,
                    _minBuyAmounts[i],
                    _sellAmounts[i]
                );
            }
        }
        auctionData[auctionId].biddingToken.safeTransferFrom(
            msg.sender,
            address(this),
            sumOfSellAmounts
        );
    }

    function cancelSellOrders(uint256 auctionId, bytes32[] memory _sellOrders)
        public
        atStageOrderPlacementAndCancelation(auctionId)
    {
        uint64 userId = getUserId(msg.sender);
        uint256 claimableAmount = 0;
        for (uint256 i = 0; i < _sellOrders.length; i++) {
            // Note: we keep the back pointer of the deleted element so that
            // it can be used as a reference point to insert a new node.
            bool success =
                sellOrders[auctionId].removeKeepHistory(_sellOrders[i]);
            if (success) {
                (
                    uint64 userIdOfIter,
                    uint96 buyAmountOfIter,
                    uint96 sellAmountOfIter
                ) = _sellOrders[i].decodeOrder();
                require(
                    userIdOfIter == userId,
                    "Only the user can cancel his orders"
                );
                claimableAmount = claimableAmount.add(sellAmountOfIter);
                emit CancellationSellOrder(
                    auctionId,
                    userId,
                    buyAmountOfIter,
                    sellAmountOfIter
                );
            }
        }
        auctionData[auctionId].biddingToken.safeTransfer(
            msg.sender,
            claimableAmount
        );
    }

    function precalculateSellAmountSum(
        uint256 auctionId,
        uint256 iterationSteps
    ) public atStageSolutionSubmission(auctionId) {
        (, , uint96 auctioneerSellAmount) =
            auctionData[auctionId].initialAuctionOrder.decodeOrder();
        uint256 sumBidAmount = auctionData[auctionId].interimSumBidAmount;
        bytes32 iterOrder = auctionData[auctionId].interimOrder;

        for (uint256 i = 0; i < iterationSteps; i++) {
            iterOrder = sellOrders[auctionId].next(iterOrder);
            (, , uint96 sellAmountOfIter) = iterOrder.decodeOrder();
            sumBidAmount = sumBidAmount.add(sellAmountOfIter);
        }
        require(
            iterOrder != IterableOrderedOrderSet.QUEUE_END,
            "surpassed end of order list"
        );

        require(
            iterOrder != IterableOrderedOrderSet.QUEUE_END,
            "reached end of order list"
        );

        require(
            iterOrder != IterableOrderedOrderSet.QUEUE_END,
            "reached end of order list"
        );

        // it is checked that not too many iteration steps were taken:
        // require that the sum of SellAmounts times the price of the last order
        // is not more than initially sold amount
        (, uint96 buyAmountOfIter, uint96 sellAmountOfIter) =
            iterOrder.decodeOrder();
        require(
            sumBidAmount.mul(buyAmountOfIter) <
                auctioneerSellAmount.mul(sellAmountOfIter),
            "too many orders summed up"
        );

        auctionData[auctionId].interimSumBidAmount = sumBidAmount;
        auctionData[auctionId].interimOrder = iterOrder;
    }

    // @dev function settling the auction and calculating the price
    function settleAuction(uint256 auctionId, bytes32 price)
        public
        atStageSolutionSubmission(auctionId)
    {
        bytes32 initialAuctionOrder =
            auctionData[auctionId].initialAuctionOrder;
        (, , uint96 fullAuctionedAmount) = initialAuctionOrder.decodeOrder();

        uint256 currentBidSum = auctionData[auctionId].interimSumBidAmount;
        bytes32 currentOrder = auctionData[auctionId].interimOrder;
        bytes32 previousOrder;
        uint256 buyAmountOfIter;
        uint256 sellAmountOfIter;
        // Sum order up, until fullAuctionedAmount is fully bought or queue end is reached
        do {
            bytes32 nextOrder = sellOrders[auctionId].next(currentOrder);
            if (nextOrder == IterableOrderedOrderSet.QUEUE_END) {
                break;
            }
            previousOrder = currentOrder;
            currentOrder = nextOrder;
            (, buyAmountOfIter, sellAmountOfIter) = currentOrder.decodeOrder();
            currentBidSum = currentBidSum.add(sellAmountOfIter);
        } while (
            (currentBidSum.mul(buyAmountOfIter) <=
                fullAuctionedAmount.mul(sellAmountOfIter))
        );

        (, buyAmountOfIter, sellAmountOfIter) = currentOrder.decodeOrder();
        if (
            currentBidSum > 0 &&
            currentBidSum.mul(buyAmountOfIter) >=
            fullAuctionedAmount.mul(sellAmountOfIter)
        ) {
            // Cases: All considered/summed orders are sufficient to close the auction fully at price of last order
            // Case 1,2,5,7:
            // uint256 uncoveredAuctionSellVolume =
            //     currentBidSum.mul(buyAmountOfIter).div(sellAmountOfIter).sub(
            //         fullAuctionedAmount
            //     );
            // uint256 uncoveredSellVolumeOfIter =
            //     uncoveredAuctionSellVolume.mul(sellAmountOfIter).div(
            //         buyAmountOfIter
            //     );
            uint256 uncoveredSellVolumeOfIter =
                (
                    currentBidSum
                        .mul(buyAmountOfIter)
                        .div(sellAmountOfIter)
                        .sub(fullAuctionedAmount)
                )
                    .mul(sellAmountOfIter)
                    .div(buyAmountOfIter);

            if (sellAmountOfIter > uncoveredSellVolumeOfIter) {
                // Case 1: Auction fully filled via partial match of iterOrder
                uint256 sellAmountClearingOrder =
                    sellAmountOfIter.sub(uncoveredSellVolumeOfIter);
                auctionData[auctionId]
                    .volumeClearingPriceOrder = sellAmountClearingOrder
                    .toUint96();
                currentBidSum = currentBidSum.sub(uncoveredSellVolumeOfIter);
                auctionData[auctionId].clearingPriceOrder = currentOrder;
            } else {
                // Case 2,7: Auction fully filled via price between iterOrder and previousOrder
                (
                    ,
                    uint96 previousOrderBuyAmount,
                    uint96 previousOrderSellAmount
                ) = previousOrder.decodeOrder();
                if (
                    previousOrderSellAmount.mul(fullAuctionedAmount) ==
                    previousOrderBuyAmount.mul(
                        currentBidSum.sub(sellAmountOfIter)
                    )
                ) {
                    // Case 7: price equals exactly previous order
                    auctionData[auctionId].clearingPriceOrder = previousOrder;
                    auctionData[auctionId]
                        .volumeClearingPriceOrder = previousOrderSellAmount;
                } else {
                    // Case 2:
                    auctionData[auctionId]
                        .clearingPriceOrder = IterableOrderedOrderSet
                        .encodeOrder(
                        uint64(-1),
                        fullAuctionedAmount,
                        currentBidSum.sub(sellAmountOfIter).toUint96()
                    );
                }
            }
        } else {
            // Cases: All considered/summed orders are not sufficient to close the auction fully at price of last order
            // Either a higher price must be used or auction is only partially filled
            // Case 3,4,5,6,8,9:
            (uint64 auctioneerUserId, uint96 minAuctionedBuyAmount, ) =
                initialAuctionOrder.decodeOrder();

            if (currentBidSum >= minAuctionedBuyAmount) {
                // Case 3,5,6,9: Last order fully filled the auction
                if (
                    fullAuctionedAmount.mul(sellAmountOfIter) >
                    currentBidSum.mul(buyAmountOfIter)
                ) {
                    // Price higher than or equal to last order
                    // Case: 3,9,6
                    if (currentBidSum == minAuctionedBuyAmount) {
                        // Price equal to last order would fill the auction
                        // But we use min initalOrder price as clearing price
                        // Case 6
                        auctionData[auctionId]
                            .clearingPriceOrder = IterableOrderedOrderSet
                            .encodeOrder(
                            auctioneerUserId,
                            fullAuctionedAmount,
                            minAuctionedBuyAmount
                        );
                        auctionData[auctionId]
                            .volumeClearingPriceOrder = fullAuctionedAmount;
                    } else {
                        // Price higher than last order would fill the auction
                        // Case: 3,9,
                        auctionData[auctionId]
                            .clearingPriceOrder = IterableOrderedOrderSet
                            .encodeOrder(
                            0,
                            fullAuctionedAmount,
                            currentBidSum.toUint96()
                        );
                    }
                } else {
                    // Last order fully filled
                    // Case 5
                    console.log("should not be here");
                    auctionData[auctionId].clearingPriceOrder = currentOrder;
                    auctionData[auctionId]
                        .volumeClearingPriceOrder = sellAmountOfIter.toUint96();
                }
            } else {
                // Case 4,8: Auction partially filled
                auctionData[auctionId]
                    .clearingPriceOrder = IterableOrderedOrderSet.encodeOrder(
                    auctioneerUserId,
                    fullAuctionedAmount,
                    minAuctionedBuyAmount
                );
                auctionData[auctionId].volumeClearingPriceOrder = currentBidSum
                    .mul(fullAuctionedAmount)
                    .div(minAuctionedBuyAmount)
                    .toUint96();
            }
        }
        if (auctionData[auctionId].minFundingThreshold > currentBidSum) {
            auctionData[auctionId].minFundingThresholdNotReached = true;
        } else {
            if (auctionData[auctionId].feeNumerator > 0) {
                claimFees(auctionId);
            }
        }
        claimAuctioneerFunds(auctionId);
        {
            (, uint96 priceNumerator, uint96 priceDenominator) =
                auctionData[auctionId].clearingPriceOrder.decodeOrder();
            emit AuctionCleared(auctionId, priceNumerator, priceDenominator);
        }
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
        bool minFundingThresholdNotReached =
            auctionData[auctionId].minFundingThresholdNotReached;
        for (uint256 i = 0; i < orders.length; i++) {
            (uint64 userIdOrder, uint96 buyAmount, uint96 sellAmount) =
                orders[i].decodeOrder();
            require(
                userIdOrder == userId,
                "only allowed to claim for same user"
            );
            if (minFundingThresholdNotReached) {
                sumBiddingTokenAmount = sumBiddingTokenAmount.add(sellAmount);
            } else {
                if (orders[i] == auction.clearingPriceOrder) {
                    sumAuctioningTokenAmount = sumAuctioningTokenAmount.add(
                        auction
                            .volumeClearingPriceOrder
                            .mul(priceNumerator)
                            .div(priceDenominator)
                    );
                    sumBiddingTokenAmount = sumBiddingTokenAmount.add(
                        sellAmount.sub(auction.volumeClearingPriceOrder)
                    );
                } else {
                    if (orders[i].smallerThan(auction.clearingPriceOrder)) {
                        sumAuctioningTokenAmount = sumAuctioningTokenAmount.add(
                            sellAmount.mul(priceNumerator).div(priceDenominator)
                        );
                    } else {
                        sumBiddingTokenAmount = sumBiddingTokenAmount.add(
                            sellAmount
                        );
                    }
                }
            }
            emit ClaimedFromOrder(auctionId, userId, buyAmount, sellAmount);
        }
        sendOutTokens(
            auctionId,
            sumAuctioningTokenAmount,
            sumBiddingTokenAmount,
            userId
        );
    }

    function claimAuctioneerFunds(uint256 auctionId)
        internal
        returns (uint256 auctioningTokenAmount, uint256 biddingTokenAmount)
    {
        (uint64 auctioneerId, uint96 buyAmount, uint96 sellAmount) =
            auctionData[auctionId].initialAuctionOrder.decodeOrder();
        if (auctionData[auctionId].minFundingThresholdNotReached) {
            sendOutTokens(auctionId, sellAmount, 0, auctioneerId);
        } else {
            auctionData[auctionId].initialAuctionOrder = bytes32(0);
            (
                uint64 priceUserId,
                uint96 priceNumerator,
                uint96 priceDenominator
            ) = auctionData[auctionId].clearingPriceOrder.decodeOrder();
            if (
                priceNumerator.mul(buyAmount) ==
                priceDenominator.mul(sellAmount) &&
                priceUserId == auctioneerId
            ) {
                // In this case we have a partial match of the initialSellOrder
                auctioningTokenAmount = sellAmount.sub(
                    auctionData[auctionId].volumeClearingPriceOrder
                );
                biddingTokenAmount = auctionData[auctionId]
                    .volumeClearingPriceOrder
                    .mul(priceDenominator)
                    .div(priceNumerator);
            } else {
                biddingTokenAmount = sellAmount.mul(priceDenominator).div(
                    priceNumerator
                );
            }
            sendOutTokens(
                auctionId,
                auctioningTokenAmount,
                biddingTokenAmount,
                auctioneerId
            );
        }
    }

    function claimFees(uint256 auctionId) internal {
        (uint64 auctioneerId, uint96 buyAmount, uint96 sellAmount) =
            auctionData[auctionId].initialAuctionOrder.decodeOrder();
        (, uint96 priceNumerator, uint96 priceDenominator) =
            auctionData[auctionId].clearingPriceOrder.decodeOrder();
        uint256 feeAmount =
            sellAmount.mul(auctionData[auctionId].feeNumerator).div(
                FEE_DENOMINATOR
            );
        if (priceNumerator.mul(buyAmount) == priceDenominator.mul(sellAmount)) {
            // In this case we have a partial match of the initialSellOrder
            uint256 auctioningTokenAmount =
                sellAmount.sub(auctionData[auctionId].volumeClearingPriceOrder);
            sendOutTokens(
                auctionId,
                feeAmount.mul(auctioningTokenAmount).div(sellAmount),
                0,
                feeReceiverUserId
            );
            sendOutTokens(
                auctionId,
                feeAmount.mul(sellAmount.sub(auctioningTokenAmount)).div(
                    sellAmount
                ),
                0,
                auctioneerId
            );
        } else {
            sendOutTokens(auctionId, feeAmount, 0, feeReceiverUserId);
        }
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
        require(
            registeredUsers.insert(numUsers, user),
            "User already registered"
        );
        userId = numUsers;
        numUsers = numUsers.add(1).toUint64();
        require(
            numUsers < uint64(-1) - 1,
            "too many users for save representation of settled order"
        );
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

    function containsOrder(uint256 auctionId, bytes32 order)
        public
        view
        returns (bool)
    {
        return sellOrders[auctionId].contains(order);
    }
}
