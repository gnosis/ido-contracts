// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity >=0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";

library IterableOrderedOrderSet {
    using SafeMath for uint96;
    using IterableOrderedOrderSet for bytes32;

    // represents smallest possible value for an order under comparison of fn smallerThan()
    bytes32 internal constant QUEUE_START =
        0x0000000000000000000000000000000000000000000000000000000000000001;
    // represents highest possible value for an order under comparison of fn smallerThan()
    bytes32 internal constant QUEUE_END =
        0xffffffffffffffffffffffffffffffffffffffff000000000000000000000001;

    struct Data {
        mapping(bytes32 => bytes32) nextMap;
        uint256 size;
    }

    struct Order {
        uint64 owner;
        uint96 buyAmount;
        uint96 sellAmount;
    }

    function insert(
        Data storage self,
        bytes32 elementToInsert,
        bytes32 elementBeforeNewOne
    ) internal returns (bool) {
        (, , uint96 denominator) = decodeOrder(elementToInsert);
        require(denominator != uint96(0), "Inserting zero is not supported");

        if (contains(self, elementToInsert)) {
            return false;
        }
        bool foundposition = false;
        if (self.size == 0) {
            self.nextMap[QUEUE_START] = elementToInsert;
            self.nextMap[elementToInsert] = QUEUE_END;
        } else {
            require(
                elementBeforeNewOne == QUEUE_START ||
                    contains(self, elementBeforeNewOne),
                "elementBeforeNewOne must be valid order"
            );
            bytes32 elementBeforeNewOneIteration = elementBeforeNewOne;
            while (!foundposition) {
                if (elementBeforeNewOneIteration.smallerThan(elementToInsert)) {
                    if (
                        !self.nextMap[elementBeforeNewOneIteration].smallerThan(
                            elementToInsert
                        )
                    ) {
                        // Since we have:
                        // elementBeforeNewOneIteration<elementToInsert)<self.nextMap[elementBeforeNewOneIteration]
                        // the right place was found and the element gets inserted
                        bytes32 tmp =
                            self.nextMap[elementBeforeNewOneIteration];
                        self.nextMap[
                            elementBeforeNewOneIteration
                        ] = elementToInsert;
                        self.nextMap[elementToInsert] = tmp;
                        foundposition = true;
                    } else {
                        // Getting next order after the current elementBeforeNewOne.
                        // This can naturally occur, if new orders were inserted
                        // between time of on-chain execution and order sending
                        elementBeforeNewOneIteration = self.nextMap[
                            elementBeforeNewOneIteration
                        ];
                    }
                } else {
                    // elementBeforeNewOne was biggerThan elementToInsert
                    return false;
                }
            }
        }
        self.size++;
        return true;
    }

    function remove(
        Data storage self,
        bytes32 elementToRemove,
        bytes32 elementBeforeRemoval
    ) internal returns (bool) {
        if (!contains(self, elementToRemove)) {
            return false;
        }
        bytes32 elementBeforeRemovalIteration = elementBeforeRemoval;
        while (self.nextMap[elementBeforeRemovalIteration] != elementToRemove) {
            if (elementBeforeRemovalIteration == QUEUE_END) {
                return false;
            }
            elementBeforeRemovalIteration = self.nextMap[
                elementBeforeRemovalIteration
            ];
        }
        self.nextMap[elementBeforeRemovalIteration] = self.nextMap[
            elementToRemove
        ];
        self.nextMap[elementToRemove] = bytes32(0);
        self.size--;
        return true;
    }

    function contains(Data storage self, bytes32 value)
        internal
        view
        returns (bool)
    {
        if (value == QUEUE_START || value == QUEUE_END) {
            return false;
        }
        return self.nextMap[value] != bytes32(0);
    }

    // @dev orders are ordered by
    // 1. their price - buyAmount/sellAmount and
    // 2. their userId,
    function smallerThan(bytes32 orderLeft, bytes32 orderRight)
        internal
        pure
        returns (bool)
    {
        (
            uint64 userIdLeft,
            uint96 priceNumeratorLeft,
            uint96 priceDenominatorLeft
        ) = decodeOrder(orderLeft);
        (
            uint64 userIdRight,
            uint96 priceNumeratorRight,
            uint96 priceDenominatorRight
        ) = decodeOrder(orderRight);

        if (
            priceNumeratorLeft.mul(priceDenominatorRight) <
            priceNumeratorRight.mul(priceDenominatorLeft)
        ) return true;
        if (
            priceNumeratorLeft.mul(priceDenominatorRight) >
            priceNumeratorRight.mul(priceDenominatorLeft)
        ) return false;

        require(
            userIdLeft != userIdRight,
            "user is not allowed to place same order twice"
        );
        if (userIdLeft < userIdRight) {
            return true;
        }
        return false;
    }

    function first(Data storage self) internal view returns (bytes32) {
        require(self.size > 0, "Trying to get first from empty set");
        return self.nextMap[QUEUE_START];
    }

    function next(Data storage self, bytes32 value)
        internal
        view
        returns (bytes32)
    {
        require(
            value != QUEUE_END,
            "Trying to get next of non-existent element"
        );
        require(
            self.nextMap[value] != bytes32(0),
            "Trying to get next of last element"
        );
        return self.nextMap[value];
    }

    function decodeOrder(bytes32 _orderData)
        internal
        pure
        returns (
            uint64 userId,
            uint96 buyAmount,
            uint96 sellAmount
        )
    {
        userId = uint64(uint256(_orderData) / 2**192);
        buyAmount = uint96((uint256(_orderData) % 2**192) / 2**96);
        sellAmount = uint96((uint256(_orderData) % 2**96));
    }

    function encodeOrder(
        uint64 userId,
        uint96 buyAmount,
        uint96 sellAmount
    ) internal pure returns (bytes32) {
        return
            bytes32(
                uint256(userId) *
                    2**192 +
                    uint256(buyAmount) *
                    2**96 +
                    uint256(sellAmount)
            );
    }
}
