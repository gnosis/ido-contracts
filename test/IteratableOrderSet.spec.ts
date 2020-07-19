const IterableOrderedOrderSet = artifacts.require(
  "libraries/IterableOrderedOrderSet.sol",
);
const IterableOrderedOrderSetWrapper = artifacts.require(
  "test/IterableOrderedOrderSetWrapper.sol",
);
const truffleAssert = require("truffle-assertions");

import { IterableOrderedOrderSetWrapperInstance } from "../types/truffle-typings";

const {
  queueLastElement,
  queueStartElement,
  encodeOrder,
} = require("../src/priceCalculation");

const BYTES32_ZERO = encodeOrder(0, 0, 0);
const BYTES32_ONE = encodeOrder(1, 1, 1);
const BYTES32_ONE_DIFFERENT = encodeOrder(1, 2, 2);
const BYTES32_TWO = encodeOrder(1, 8, 4);
const BYTES32_THREE = encodeOrder(1, 6, 2);

async function getSetContent(set: IterableOrderedOrderSetWrapperInstance) {
  const result = [];
  if (!(await set.isEmpty())) {
    const last_element = queueLastElement;
    let current = await set.first();
    while (current != last_element) {
      result.push(current);
      current = await set.next(current);
    }
  }
  return result;
}

contract("IterableOrderedOrderSet", function () {
  beforeEach(async () => {});

  it("should contain the added values", async () => {
    const set = await IterableOrderedOrderSetWrapper.new();
    assert.deepEqual(await getSetContent(set), []);
    assert.equal(
      await set.contains(BYTES32_ONE),
      false,
      "The element should not be there",
    );
    const bool = await set.insert.call(BYTES32_ONE);
    assert.equal(bool, true, "The element could not be inserted");
    await set.insert(BYTES32_ONE);
    assert.equal(
      await set.contains(BYTES32_ONE),
      true,
      "The element should be there",
    );
    assert.deepEqual(await getSetContent(set), [BYTES32_ONE]);
  });

  it("should insert the same value only once", async () => {
    const set = await IterableOrderedOrderSetWrapper.new();

    assert.equal(
      await set.insert.call(BYTES32_ONE),
      true,
      "First insert should insert",
    );
    await set.insert(BYTES32_ONE);
    assert.deepEqual(await getSetContent(set), [BYTES32_ONE]);

    assert.equal(
      await set.insert.call(BYTES32_ONE),
      false,
      "Second insert should do nothing",
    );
    await set.insert(BYTES32_ONE);
    assert.deepEqual(await getSetContent(set), [BYTES32_ONE]);
  });

  it("should return first", async () => {
    const set = await IterableOrderedOrderSetWrapper.new();

    await set.insert(BYTES32_ONE);
    assert.equal(await set.first(), BYTES32_ONE);
  });

  it("should allow to iterate over content", async () => {
    const set = await IterableOrderedOrderSetWrapper.new();

    await set.insert(BYTES32_ONE);
    await set.insert(BYTES32_TWO);
    await set.insert(BYTES32_THREE);

    const first = await set.first();
    const second = await set.next(first);
    const third = await set.next(second);

    assert.equal(third, BYTES32_ONE);
    assert.equal(second, BYTES32_TWO);
    assert.equal(first, BYTES32_THREE);
  });
  it("should not allow to insert same limit price with same user", async () => {
    const set = await IterableOrderedOrderSetWrapper.new();

    await set.insert(BYTES32_ONE);
    await truffleAssert.reverts(
      set.insert(BYTES32_ONE_DIFFERENT),
      "user is not allowed to place same order twice",
    );
  });

  it("should allow to insert element at certain element", async () => {
    const set = await IterableOrderedOrderSetWrapper.new();

    await set.insert(BYTES32_ONE);
    await set.insert(BYTES32_THREE);

    assert.equal(await set.insertAt.call(BYTES32_TWO, BYTES32_THREE), true);
    assert.equal(await set.insertAt.call(BYTES32_TWO, BYTES32_ONE), false);
  });

  it("should insert element according to rate", async () => {
    const set = await IterableOrderedOrderSetWrapper.new();

    await set.insert(BYTES32_THREE);
    await set.insert(BYTES32_ONE);
    await set.insert(BYTES32_TWO);

    const first = await set.first();
    const second = await set.next(first);
    const third = await set.next(second);

    assert.equal(third, BYTES32_ONE);
    assert.equal(second, BYTES32_TWO);
    assert.equal(first, BYTES32_THREE);
  });

  it("doesn't allow to insert a number with denominator == 0", async () => {
    const set = await IterableOrderedOrderSetWrapper.new();
    await truffleAssert.reverts(
      set.insert(BYTES32_ZERO),
      "Inserting uint96(0) is not supported",
    );
  });

  it("cannot get first of empty list", async () => {
    const set = await IterableOrderedOrderSetWrapper.new();
    await truffleAssert.reverts(
      set.first(),
      "Trying to get first from empty set",
    );
  });

  it("cannot get next of non-existent element", async () => {
    const set = await IterableOrderedOrderSetWrapper.new();

    await set.insert(BYTES32_ONE);
    await truffleAssert.reverts(set.next(BYTES32_TWO));
  });

  it("should remove element", async () => {
    const set = await IterableOrderedOrderSetWrapper.new();

    await set.insert(BYTES32_THREE);
    await set.insert(BYTES32_ONE);
    await set.insert(BYTES32_TWO);

    await set.remove(BYTES32_TWO);

    const first = await set.first();
    const second = await set.next(first);

    assert.equal(second, BYTES32_ONE);
    assert.equal(first, BYTES32_THREE);
  });

  it("returns the correct size of queue", async () => {
    const set = await IterableOrderedOrderSetWrapper.new();

    await set.insert(BYTES32_THREE);
    assert.equal(await set.size.call(), 1);
    await set.insert(BYTES32_ONE);
    assert.equal(await set.size.call(), 2);

    await set.insert(BYTES32_TWO);
    assert.equal(await set.size.call(), 3);

    await set.remove(BYTES32_TWO);
    assert.equal(await set.size.call(), 2);

    await set.remove(BYTES32_THREE);
    assert.equal(await set.size.call(), 1);

    await set.remove(BYTES32_ONE);
    assert.equal(await set.size.call(), 0);
  });

  it("should allow to remove element behind certain element", async () => {
    const set = await IterableOrderedOrderSetWrapper.new();

    await set.insert(BYTES32_ONE);
    await set.insert(BYTES32_TWO);
    await set.insert(BYTES32_THREE);

    assert.equal(await set.removeAt.call(BYTES32_TWO, BYTES32_THREE), true);
    assert.equal(await set.removeAt.call(BYTES32_TWO, BYTES32_ONE), false);
  });

  it("cannot contain queue start element or queue end element", async () => {
    const set = await IterableOrderedOrderSetWrapper.new();

    assert.equal(await set.contains.call(queueLastElement), false);
    assert.equal(await set.contains.call(queueStartElement), false);
  });

  it("cannot contain queue start element or queue end element", async () => {
    const set = await IterableOrderedOrderSetWrapper.new();

    assert.equal(await set.contains.call(queueLastElement), false);
    assert.equal(await set.contains.call(queueStartElement), false);
  });

  it("does not allow to remove element not contained", async () => {
    const set = await IterableOrderedOrderSetWrapper.new();

    await set.insert(BYTES32_ONE);
    await set.insert(BYTES32_TWO);

    assert.equal(await set.remove.call(BYTES32_THREE), false);
  });

  it("can add element BYTES32_ONE => rate of startingElement ==0", async () => {
    const set = await IterableOrderedOrderSetWrapper.new();

    assert.equal(await set.insert.call(BYTES32_ONE), true);
  });

  it("encodeOrder reverses decodeOrder", async () => {
    const set = await IterableOrderedOrderSetWrapper.new();
    const ans = await set.decodeOrder(BYTES32_ONE);
    assert.equal(
      await set.encodeOrder.call(ans[0], ans[1], ans[2]),
      BYTES32_ONE,
    );
  });
});
