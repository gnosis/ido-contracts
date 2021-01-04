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

    function insertWithHighSuccessRate(
        Data storage self,
        bytes32 elementToInsert,
        bytes32 elementBeforeNewOne,
        bytes32 secondElementBeforeNewOne
    ) internal returns (bool success) {
        success = insert(self, elementToInsert, elementBeforeNewOne);
        if (!success) {
            success = insert(self, elementToInsert, secondElementBeforeNewOne);
        }
    }

    function insert(
        Data storage self,
        bytes32 elementToInsert,
        bytes32 elementBeforeNewOne
    ) internal returns (bool) {
        (, , uint96 denominator) = decodeOrder(elementToInsert);
        require(denominator != uint96(0), "Inserting zero is not supported");
        require(
            !(elementToInsert == QUEUE_START || elementToInsert == QUEUE_END),
            "Inserting element is not valid"
        );
        if (contains(self, elementToInsert)) {
            return false;
        }
        if (
            !(elementBeforeNewOne == QUEUE_START ||
                contains(self, elementBeforeNewOne))
        ) {
            return false;
        }
        if (self.size == 0) {
            self.nextMap[QUEUE_START] = elementToInsert;
            self.nextMap[elementToInsert] = QUEUE_END;
        } else {
            if (!elementBeforeNewOne.smallerThan(elementToInsert)) {
                return false;
            }

            bytes32 previous;
            bytes32 current = elementBeforeNewOne;
            // elementBeforeNewOne can be any element smaller than the element
            // to insert. We want to keep the elements sorted after inserting
            // elementToInsert.
            do {
                previous = current;
                current = self.nextMap[current];
            } while (current.smallerThan(elementToInsert));
            // Note: previous < elementToInsert < current
            self.nextMap[previous] = elementToInsert;
            self.nextMap[elementToInsert] = current;
        }
        self.size++;
        return true;
    }

    function removeWithHighSuccessRate(
        Data storage self,
        bytes32 elementToRemove,
        bytes32 elementBeforeRemoval,
        bytes32 secondElementBeforeRemoval
    ) internal returns (bool success) {
        success = remove(self, elementToRemove, elementBeforeRemoval);
        if (!success) {
            success = remove(self, elementToRemove, secondElementBeforeRemoval);
        }
    }

    function remove(
        Data storage self,
        bytes32 elementToRemove,
        bytes32 elementBeforeRemoval
    ) internal returns (bool) {
        if (
            !contains(self, elementToRemove) ||
            (elementBeforeRemoval != QUEUE_START &&
                !contains(self, elementBeforeRemoval))
        ) {
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
        // Note: converting to uint discards the binary digits that do not fit
        // the type.
        userId = uint64(uint256(_orderData) >> 192);
        buyAmount = uint96(uint256(_orderData) >> 96);
        sellAmount = uint96(uint256(_orderData));
    }

    function encodeOrder(
        uint64 userId,
        uint96 buyAmount,
        uint96 sellAmount
    ) internal pure returns (bytes32) {
        return
            bytes32(
                (uint256(userId) << 192) +
                    (uint256(buyAmount) << 96) +
                    uint256(sellAmount)
            );
    }
}
