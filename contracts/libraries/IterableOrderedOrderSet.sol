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

    /// The struct is used to implement a modified version of a doubly linked
    /// list with sorted elements. The list starts from QUEUE_START to
    /// QUEUE_END, and each node keeps track of its predecessor and successor.
    /// Nodes can be added or removed.
    ///
    /// `next` and `prev` have a different role. The list is supposed to be
    /// traversed with `next`. If `next` is empty, the node is not part of the
    /// list. However, `prev` might be set for elements that are not in the
    /// list, which is why it should not be used for traversing. Having a `prev`
    /// set for elements not in the list is used to keep track of the history of
    /// the position in the list of a removed element.
    struct Data {
        mapping(bytes32 => bytes32) nextMap;
        mapping(bytes32 => bytes32) prevMap;
    }

    struct Order {
        uint64 owner;
        uint96 buyAmount;
        uint96 sellAmount;
    }

    function initializeEmptyList(Data storage self) internal {
        self.nextMap[QUEUE_START] = QUEUE_END;
        self.prevMap[QUEUE_END] = QUEUE_START;
    }

    function isEmpty(Data storage self) internal view returns (bool) {
        return self.nextMap[QUEUE_START] == QUEUE_END;
    }

    function insert(
        Data storage self,
        bytes32 elementToInsert,
        bytes32 elementBeforeNewOne
    ) internal returns (bool) {
        (, , uint96 denominator) = decodeOrder(elementToInsert);
        require(denominator != uint96(0), "Inserting zero is not supported");
        require(
            elementToInsert != QUEUE_START && elementToInsert != QUEUE_END,
            "Inserting element is not valid"
        );
        if (contains(self, elementToInsert)) {
            return false;
        }
        if (
            elementBeforeNewOne != QUEUE_START &&
            self.prevMap[elementBeforeNewOne] == bytes32(0)
        ) {
            return false;
        }
        if (!elementBeforeNewOne.smallerThan(elementToInsert)) {
            return false;
        }

        // `elementBeforeNewOne` might have been removed during the time it
        // took to the transaction calling this function to be mined, so
        // the new order cannot be appended directly to this. We follow the
        // history of previous links backwards until we find an element in
        // the list from which to start our search.
        // Note that following the link backwards returns elements that are
        // before `elementBeforeNewOne` in sorted order.
        while (self.nextMap[elementBeforeNewOne] == bytes32(0)) {
            elementBeforeNewOne = self.prevMap[elementBeforeNewOne];
        }

        // `elementBeforeNewOne` belongs now to the linked list. We search the
        // largest entry that is smaller than the element to insert.
        bytes32 previous;
        bytes32 current = elementBeforeNewOne;
        do {
            previous = current;
            current = self.nextMap[current];
        } while (current.smallerThan(elementToInsert));
        // Note: previous < elementToInsert < current
        self.nextMap[previous] = elementToInsert;
        self.prevMap[current] = elementToInsert;
        self.prevMap[elementToInsert] = previous;
        self.nextMap[elementToInsert] = current;

        return true;
    }

    /// The element is removed from the linked list, but the node retains
    /// information on which predecessor it had, so that a node in the chain
    /// can be reached by following the predecessor chain of deleted elements.
    function removeKeepHistory(Data storage self, bytes32 elementToRemove)
        internal
        returns (bool)
    {
        if (!contains(self, elementToRemove)) {
            return false;
        }
        bytes32 previousElement = self.prevMap[elementToRemove];
        bytes32 nextElement = self.nextMap[elementToRemove];
        self.nextMap[previousElement] = nextElement;
        self.prevMap[nextElement] = previousElement;
        self.nextMap[elementToRemove] = bytes32(0);
        return true;
    }

    /// Remove an element from the chain, clearing all related storage.
    /// Note that no elements should be inserted using as a reference point a
    /// node deleted after calling `remove`, since an element in the `prev`
    /// chain might be missing.
    function remove(Data storage self, bytes32 elementToRemove)
        internal
        returns (bool)
    {
        bool result = removeKeepHistory(self, elementToRemove);
        if (result) {
            self.prevMap[elementToRemove] = bytes32(0);
        }
        return result;
    }

    function contains(Data storage self, bytes32 value)
        internal
        view
        returns (bool)
    {
        if (value == QUEUE_START) {
            return false;
        }
        // Note: QUEUE_END is not contained in the list since it has no
        // successor.
        return self.nextMap[value] != bytes32(0);
    }

    // @dev orders are ordered by
    // 1. their price - buyAmount/sellAmount
    // 2. by the sellAmount
    // 3. their userId,
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

        if (priceNumeratorLeft < priceNumeratorRight) return true;
        if (priceNumeratorLeft > priceNumeratorRight) return false;
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
        require(!isEmpty(self), "Trying to get first from empty set");
        return self.nextMap[QUEUE_START];
    }

    function next(Data storage self, bytes32 value)
        internal
        view
        returns (bytes32)
    {
        require(value != QUEUE_END, "Trying to get next of last element");
        bytes32 nextElement = self.nextMap[value];
        require(
            nextElement != bytes32(0),
            "Trying to get next of non-existent element"
        );
        return nextElement;
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
