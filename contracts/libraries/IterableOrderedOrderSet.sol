pragma solidity >=0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";


library IterableOrderedOrderSet {
  using SafeMath for uint96;
  using IterableOrderedOrderSet for bytes32;
  uint96 private constant MIN_RATE = uint96(0);
  uint96 private constant MAX_RATE = uint96(-1);

  // getValue(QUEUE_START) returns 0
  bytes32 internal constant QUEUE_START = 0xffffffffffffffffffffffffffffffffffffffff000000000000000000000001;
  // getValue(QUEUE_END) returns MaxValue in uint64
  bytes32 internal constant QUEUE_END = 0x0000000000000000000000000000000000000000000000000000000000000001;

  struct Data {
    mapping(bytes32 => bytes32) nextMap;
    uint256 size;
  }

  struct Order {
    uint64 owner;
    uint96 sellAmount;
    uint96 buyAmount;
  }

  function insert(
    Data storage self,
    bytes32 elementToInsert,
    bytes32 elmentBeforeNewOne
  ) internal returns (bool) {
    (, , uint96 denominator) = decodeOrder(elementToInsert);
    require(denominator != uint96(0), "Inserting uint96(0) is not supported");

    if (contains(self, elementToInsert)) {
      return false;
    }
    bool foundposition = false;
    if (self.size == 0) {
      self.nextMap[QUEUE_START] = elementToInsert;
      self.nextMap[elementToInsert] = QUEUE_END;
    } else {
      bytes32 elmentBeforeNewOneNext = elmentBeforeNewOne;
      while (!foundposition) {
        if (elmentBeforeNewOneNext.biggerThan(elementToInsert)) {
          if (
            !self.nextMap[elmentBeforeNewOneNext].biggerThan(elementToInsert)
          ) {
            bytes32 tmp = self.nextMap[elmentBeforeNewOneNext];
            self.nextMap[elmentBeforeNewOneNext] = elementToInsert;
            self.nextMap[elementToInsert] = tmp;
            foundposition = true;
          } else {
            elmentBeforeNewOneNext = self.nextMap[elmentBeforeNewOneNext];
          }
        } else {
          return false; // elmentBeforeNewOne was incorrect
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
    bytes32 elementBeforeRemovalNext = elementBeforeRemoval;
    while (self.nextMap[elementBeforeRemovalNext] != elementToRemove) {
      if (elementBeforeRemovalNext == QUEUE_END) {
        return false;
      }
      elementBeforeRemovalNext = self.nextMap[elementBeforeRemovalNext];
    }
    self.nextMap[elementBeforeRemovalNext] = self.nextMap[elementToRemove];
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

  function biggerThan(bytes32 orderLeft, bytes32 orderRight)
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
      priceNumeratorLeft.mul(priceDenominatorRight) >
      priceNumeratorRight.mul(priceDenominatorLeft)
    ) return true;
    if (
      priceNumeratorLeft.mul(priceDenominatorRight) <
      priceNumeratorRight.mul(priceDenominatorLeft)
    ) return false;

    require(
      userIdLeft != userIdRight,
      "user is not allowed to place same order twice"
    );
    if (userIdLeft > userIdRight) {
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
    require(value != QUEUE_END, "Trying to get next of non-existent element");
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
      uint96 sellAmount,
      uint96 buyAmount
    )
  {
    userId = uint64(uint256(_orderData) / 2**192);
    sellAmount = uint96((uint256(_orderData) % 2**192) / 2**94);
    buyAmount = uint96((uint256(_orderData) % 2**96));
  }

  function encodeOrder(
    uint64 userId,
    uint96 sellAmount,
    uint96 buyAmount
  ) internal pure returns (bytes32) {
    return
      bytes32(
        uint256(userId) *
          2**192 +
          uint256(sellAmount) *
          2**96 +
          uint256(buyAmount)
      );
  }
}
