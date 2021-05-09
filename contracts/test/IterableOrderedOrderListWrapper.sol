// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity ^0.6.0;
import "../libraries/IterableOrderedOrderList.sol";

contract IterableOrderedOrderListWrapper {
    using IterableOrderedOrderList for IterableOrderedOrderList.Data;

    IterableOrderedOrderList.Data internal data;

    function initializeEmptyList() public {
        data.initializeEmptyList();
    }

    function insert(bytes32 value) public returns (bool) {
        return data.insert(value, IterableOrderedOrderList.QUEUE_START);
    }

    function insertAt(bytes32 value, bytes32 at) public returns (bool) {
        return data.insert(value, at);
    }

    function remove(bytes32 value) public returns (bool) {
        return data.remove(value);
    }

    function contains(bytes32 value) public view returns (bool) {
        return data.contains(value);
    }

    function isEmpty() public view returns (bool) {
        return data.isEmpty();
    }

    function first() public view returns (bytes32) {
        return data.first();
    }

    function next(bytes32 value) public view returns (bytes32) {
        return data.next(value);
    }

    function nextMap(bytes32 value) public view returns (bytes32) {
        return data.nextMap[value];
    }

    function decodeOrder(bytes32 value)
        public
        pure
        returns (
            uint64,
            uint96,
            uint96
        )
    {
        return IterableOrderedOrderList.decodeOrder(value);
    }

    function encodeOrder(
        uint64 userId,
        uint96 sellAmount,
        uint96 buyAmount
    ) public pure returns (bytes32) {
        return
            IterableOrderedOrderList.encodeOrder(userId, sellAmount, buyAmount);
    }

    function smallerThan(bytes32 orderLeft, bytes32 orderRight)
        public
        pure
        returns (bool)
    {
        return IterableOrderedOrderList.smallerThan(orderLeft, orderRight);
    }
}
