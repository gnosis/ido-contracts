"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const IterableOrderedOrderSet = artifacts.require("libraries/IterableOrderedOrderSet.sol");
const IterableOrderedOrderSetWrapper = artifacts.require("test/IterableOrderedOrderSetWrapper.sol");
const truffleAssert = require("truffle-assertions");
const { queueLastElement, queueStartElement, encodeOrder, } = require("./utilities");
const BYTES32_ZERO = encodeOrder(0, 0, 0);
const BYTES32_ONE = encodeOrder(1, 1, 1);
const BYTES32_ONE_DIFFERENT = encodeOrder(1, 2, 2);
const BYTES32_TWO = encodeOrder(1, 8, 4);
const BYTES32_THREE = encodeOrder(1, 6, 2);
function getSetContent(set) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = [];
        if (!(yield set.isEmpty())) {
            const last_element = queueLastElement;
            let current = yield set.first();
            while (current != last_element) {
                result.push(current);
                current = yield set.next(current);
            }
        }
        return result;
    });
}
contract("IterableOrderedOrderSet", function () {
    beforeEach(() => __awaiter(this, void 0, void 0, function* () { }));
    it("should contain the added values", () => __awaiter(this, void 0, void 0, function* () {
        const set = yield IterableOrderedOrderSetWrapper.new();
        assert.deepEqual(yield getSetContent(set), []);
        assert.equal(yield set.contains(BYTES32_ONE), false, "The element should not be there");
        const bool = yield set.insert.call(BYTES32_ONE);
        assert.equal(bool, true, "The element could not be inserted");
        yield set.insert(BYTES32_ONE);
        assert.equal(yield set.contains(BYTES32_ONE), true, "The element should be there");
        assert.deepEqual(yield getSetContent(set), [BYTES32_ONE]);
    }));
    it("should insert the same value only once", () => __awaiter(this, void 0, void 0, function* () {
        const set = yield IterableOrderedOrderSetWrapper.new();
        assert.equal(yield set.insert.call(BYTES32_ONE), true, "First insert should insert");
        yield set.insert(BYTES32_ONE);
        assert.deepEqual(yield getSetContent(set), [BYTES32_ONE]);
        assert.equal(yield set.insert.call(BYTES32_ONE), false, "Second insert should do nothing");
        yield set.insert(BYTES32_ONE);
        assert.deepEqual(yield getSetContent(set), [BYTES32_ONE]);
    }));
    it("should return first", () => __awaiter(this, void 0, void 0, function* () {
        const set = yield IterableOrderedOrderSetWrapper.new();
        yield set.insert(BYTES32_ONE);
        assert.equal(yield set.first(), BYTES32_ONE);
    }));
    it("should allow to iterate over content", () => __awaiter(this, void 0, void 0, function* () {
        const set = yield IterableOrderedOrderSetWrapper.new();
        yield set.insert(BYTES32_ONE);
        yield set.insert(BYTES32_TWO);
        yield set.insert(BYTES32_THREE);
        const first = yield set.first();
        const second = yield set.next(first);
        const third = yield set.next(second);
        assert.equal(third, BYTES32_ONE);
        assert.equal(second, BYTES32_TWO);
        assert.equal(first, BYTES32_THREE);
    }));
    it("should not allow to insert same limit price with same user", () => __awaiter(this, void 0, void 0, function* () {
        const set = yield IterableOrderedOrderSetWrapper.new();
        yield set.insert(BYTES32_ONE);
        yield truffleAssert.reverts(set.insert(BYTES32_ONE_DIFFERENT), "user is not allowed to place same order twice");
    }));
    it("should allow to insert element at certain element", () => __awaiter(this, void 0, void 0, function* () {
        const set = yield IterableOrderedOrderSetWrapper.new();
        yield set.insert(BYTES32_ONE);
        yield set.insert(BYTES32_THREE);
        assert.equal(yield set.insertAt.call(BYTES32_TWO, BYTES32_THREE), true);
        assert.equal(yield set.insertAt.call(BYTES32_TWO, BYTES32_ONE), false);
    }));
    it("should insert element according to rate", () => __awaiter(this, void 0, void 0, function* () {
        const set = yield IterableOrderedOrderSetWrapper.new();
        yield set.insert(BYTES32_THREE);
        yield set.insert(BYTES32_ONE);
        yield set.insert(BYTES32_TWO);
        const first = yield set.first();
        const second = yield set.next(first);
        const third = yield set.next(second);
        assert.equal(third, BYTES32_ONE);
        assert.equal(second, BYTES32_TWO);
        assert.equal(first, BYTES32_THREE);
    }));
    it("doesn't allow to insert a number with denominator == 0", () => __awaiter(this, void 0, void 0, function* () {
        const set = yield IterableOrderedOrderSetWrapper.new();
        yield truffleAssert.reverts(set.insert(BYTES32_ZERO), "Inserting uint96(0) is not supported");
    }));
    it("cannot get first of empty list", () => __awaiter(this, void 0, void 0, function* () {
        const set = yield IterableOrderedOrderSetWrapper.new();
        yield truffleAssert.reverts(set.first(), "Trying to get first from empty set");
    }));
    it("cannot get next of non-existent element", () => __awaiter(this, void 0, void 0, function* () {
        const set = yield IterableOrderedOrderSetWrapper.new();
        yield set.insert(BYTES32_ONE);
        yield truffleAssert.reverts(set.next(BYTES32_TWO));
    }));
    it("should remove element", () => __awaiter(this, void 0, void 0, function* () {
        const set = yield IterableOrderedOrderSetWrapper.new();
        yield set.insert(BYTES32_THREE);
        yield set.insert(BYTES32_ONE);
        yield set.insert(BYTES32_TWO);
        yield set.remove(BYTES32_TWO);
        const first = yield set.first();
        const second = yield set.next(first);
        assert.equal(second, BYTES32_ONE);
        assert.equal(first, BYTES32_THREE);
    }));
    it("returns the correct size of queue", () => __awaiter(this, void 0, void 0, function* () {
        const set = yield IterableOrderedOrderSetWrapper.new();
        yield set.insert(BYTES32_THREE);
        assert.equal(yield set.size.call(), 1);
        yield set.insert(BYTES32_ONE);
        assert.equal(yield set.size.call(), 2);
        yield set.insert(BYTES32_TWO);
        assert.equal(yield set.size.call(), 3);
        yield set.remove(BYTES32_TWO);
        assert.equal(yield set.size.call(), 2);
        yield set.remove(BYTES32_THREE);
        assert.equal(yield set.size.call(), 1);
        yield set.remove(BYTES32_ONE);
        assert.equal(yield set.size.call(), 0);
    }));
    it("should allow to remove element behind certain element", () => __awaiter(this, void 0, void 0, function* () {
        const set = yield IterableOrderedOrderSetWrapper.new();
        yield set.insert(BYTES32_ONE);
        yield set.insert(BYTES32_TWO);
        yield set.insert(BYTES32_THREE);
        assert.equal(yield set.removeAt.call(BYTES32_TWO, BYTES32_THREE), true);
        assert.equal(yield set.removeAt.call(BYTES32_TWO, BYTES32_ONE), false);
    }));
    it("cannot contain queue start element or queue end element", () => __awaiter(this, void 0, void 0, function* () {
        const set = yield IterableOrderedOrderSetWrapper.new();
        assert.equal(yield set.contains.call(queueLastElement), false);
        assert.equal(yield set.contains.call(queueStartElement), false);
    }));
    it("cannot contain queue start element or queue end element", () => __awaiter(this, void 0, void 0, function* () {
        const set = yield IterableOrderedOrderSetWrapper.new();
        assert.equal(yield set.contains.call(queueLastElement), false);
        assert.equal(yield set.contains.call(queueStartElement), false);
    }));
    it("does not allow to remove element not contained", () => __awaiter(this, void 0, void 0, function* () {
        const set = yield IterableOrderedOrderSetWrapper.new();
        yield set.insert(BYTES32_ONE);
        yield set.insert(BYTES32_TWO);
        assert.equal(yield set.remove.call(BYTES32_THREE), false);
    }));
    it("can add element BYTES32_ONE => rate of startingElement ==0", () => __awaiter(this, void 0, void 0, function* () {
        const set = yield IterableOrderedOrderSetWrapper.new();
        assert.equal(yield set.insert.call(BYTES32_ONE), true);
    }));
    it("encodeOrder reverses decodeOrder", () => __awaiter(this, void 0, void 0, function* () {
        const set = yield IterableOrderedOrderSetWrapper.new();
        const ans = yield set.decodeOrder(BYTES32_ONE);
        assert.equal(yield set.encodeOrder.call(ans[0], ans[1], ans[2]), BYTES32_ONE);
    }));
});
