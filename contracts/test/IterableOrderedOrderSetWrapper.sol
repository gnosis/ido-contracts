// SPDX-License-Identifier: LGPL-3.0-or-newer
pragma solidity ^0.6.0;
import "../libraries/IterableOrderedOrderSet.sol";

contract IterableOrderedOrderSetWrapper {
    using IterableOrderedOrderSet for IterableOrderedOrderSet.Data;

    IterableOrderedOrderSet.Data public data;

    function insert(bytes32 value) public returns (bool) {
        return data.insert(value, IterableOrderedOrderSet.QUEUE_START);
    }

    function insertAt(bytes32 value, bytes32 at) public returns (bool) {
        return data.insert(value, at);
    }

    function remove(bytes32 value) public returns (bool) {
        return data.remove(value, IterableOrderedOrderSet.QUEUE_START);
    }

    function removeAt(bytes32 value, bytes32 at) public returns (bool) {
        return data.remove(value, at);
    }

    function contains(bytes32 value) public view returns (bool) {
        return data.contains(value);
    }

    function isEmpty() public view returns (bool) {
        return data.size == 0;
    }

    function size() public view returns (uint256) {
        return data.size;
    }

    function first() public view returns (bytes32) {
        return data.first();
    }

    function next(bytes32 value) public view returns (bytes32) {
        return data.next(value);
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
        return IterableOrderedOrderSet.decodeOrder(value);
    }

    function encodeOrder(
        uint64 userId,
        uint96 sellAmount,
        uint96 buyAmount
    ) public pure returns (bytes32) {
        return
            IterableOrderedOrderSet.encodeOrder(userId, sellAmount, buyAmount);
    }

    function smallerThan(bytes32 orderLeft, bytes32 orderRight)
        public
        pure
        returns (bool)
    {
        return IterableOrderedOrderSet.smallerThan(orderLeft, orderRight);
    }
}
