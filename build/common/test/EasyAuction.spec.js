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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const EasyAuction = artifacts.require("EasyAuction.sol");
const ERC20 = artifacts.require("ERC20Mintable.sol");
const bn_js_1 = __importDefault(require("bn.js"));
const truffle_assertions_1 = __importDefault(require("truffle-assertions"));
function toAuctionDataResult(result) {
    return {
        sellToken: result[0],
        buyToken: result[1],
        auctionEndDate: result[2],
        sellOrder: result[3],
        clearingPriceOrder: result[4],
        volumeClearingPriceOrder: result[5],
    };
}
const { encodeOrder, queueStartElement, sendTxAndGetReturnValue, closeAuction, } = require("./utilities");
contract("IterableOrderedOrderSet", (accounts) => __awaiter(void 0, void 0, void 0, function* () {
    const [user_1, user_2, user_3] = accounts;
    let easyAuction;
    let buyToken;
    let sellToken;
    beforeEach(() => __awaiter(void 0, void 0, void 0, function* () {
        easyAuction = yield EasyAuction.new();
    }));
    describe("initiate Auction", () => __awaiter(void 0, void 0, void 0, function* () {
        it("initiateAuction stores the parameters correctly", () => __awaiter(void 0, void 0, void 0, function* () {
            buyToken = yield ERC20.new("BT", "BT");
            yield buyToken.mint(user_1, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            yield buyToken.approve(easyAuction.address, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            sellToken = yield ERC20.new("BT", "BT");
            yield sellToken.mint(user_1, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            yield sellToken.approve(easyAuction.address, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            const auctionId = yield sendTxAndGetReturnValue(easyAuction.initiateAuction, sellToken.address, buyToken.address, 60 * 60, new bn_js_1.default(10).pow(new bn_js_1.default(18)), new bn_js_1.default(10).pow(new bn_js_1.default(18)));
            const auctionData = toAuctionDataResult(yield easyAuction.auctionData(auctionId));
            assert.equal(auctionData.sellToken, sellToken.address);
            assert.equal(auctionData.buyToken, buyToken.address);
            assert.equal(auctionData.sellOrder, encodeOrder(0, new bn_js_1.default(10).pow(new bn_js_1.default(18)), new bn_js_1.default(10).pow(new bn_js_1.default(18))));
            //Todo assert.equal(auctionData.auctionEndDate);
            assert.equal(auctionData.clearingPriceOrder, encodeOrder(0, 0, 0));
            assert.equal(auctionData.volumeClearingPriceOrder.toNumber(), 0);
            assert.equal((yield sellToken.balanceOf.call(easyAuction.address)).toString(), new bn_js_1.default(10).pow(new bn_js_1.default(18)).toString());
        }));
    }));
    describe("getUserId", () => __awaiter(void 0, void 0, void 0, function* () {
        it("creates new userIds", () => __awaiter(void 0, void 0, void 0, function* () {
            const userId_1 = yield sendTxAndGetReturnValue(easyAuction.getUserId, user_1, {
                from: user_1,
            });
            const userId_2 = yield sendTxAndGetReturnValue(easyAuction.getUserId, user_2, {
                from: user_2,
            });
            const userId_3 = yield sendTxAndGetReturnValue(easyAuction.getUserId, user_1, {
                from: user_3,
            });
            assert.equal(userId_1, 0);
            assert.equal(userId_2, 1);
            assert.equal(userId_3, 0);
        }));
    }));
    describe("placeOrders", () => __awaiter(void 0, void 0, void 0, function* () {
        it("one can not place orders, if auction is not yet initiated", () => __awaiter(void 0, void 0, void 0, function* () {
            yield truffle_assertions_1.default.reverts(easyAuction.placeBuyOrders(0, [new bn_js_1.default(10).pow(new bn_js_1.default(18))], [new bn_js_1.default(10).pow(new bn_js_1.default(18)).add(new bn_js_1.default(1))], [queueStartElement]), "Auction no longer in order placement phase");
        }));
        it("one can not place orders, if auction is over", () => __awaiter(void 0, void 0, void 0, function* () {
            buyToken = yield ERC20.new("BT", "BT");
            yield buyToken.mint(user_1, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            yield buyToken.approve(easyAuction.address, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            sellToken = yield ERC20.new("BT", "BT");
            yield sellToken.mint(user_1, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            yield sellToken.approve(easyAuction.address, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            const auctionId = yield sendTxAndGetReturnValue(easyAuction.initiateAuction, sellToken.address, buyToken.address, 60 * 60, new bn_js_1.default(10).pow(new bn_js_1.default(18)), new bn_js_1.default(10).pow(new bn_js_1.default(18)));
            yield closeAuction(easyAuction, auctionId);
            yield truffle_assertions_1.default.reverts(easyAuction.placeBuyOrders(0, [new bn_js_1.default(10).pow(new bn_js_1.default(18))], [new bn_js_1.default(10).pow(new bn_js_1.default(18)).add(new bn_js_1.default(1))], [queueStartElement]), "Auction no longer in order placement phase");
        }));
        it("one can not place orders, with a worser or same rate", () => __awaiter(void 0, void 0, void 0, function* () {
            buyToken = yield ERC20.new("BT", "BT");
            yield buyToken.mint(user_1, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            yield buyToken.approve(easyAuction.address, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            sellToken = yield ERC20.new("BT", "BT");
            yield sellToken.mint(user_1, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            yield sellToken.approve(easyAuction.address, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            const auctionId = yield sendTxAndGetReturnValue(easyAuction.initiateAuction, sellToken.address, buyToken.address, 60 * 60, new bn_js_1.default(10).pow(new bn_js_1.default(18)), new bn_js_1.default(10).pow(new bn_js_1.default(18)));
            yield truffle_assertions_1.default.reverts(easyAuction.placeBuyOrders(auctionId, [new bn_js_1.default(10).pow(new bn_js_1.default(18)).add(new bn_js_1.default(1))], [new bn_js_1.default(10).pow(new bn_js_1.default(18))], [queueStartElement]), "limit price not better than mimimal offer");
            yield truffle_assertions_1.default.reverts(easyAuction.placeBuyOrders(auctionId, [new bn_js_1.default(10).pow(new bn_js_1.default(18))], [new bn_js_1.default(10).pow(new bn_js_1.default(18))], [queueStartElement]), "limit price not better than mimimal offer");
        }));
        it("places a new order and checks that tokens were transferred", () => __awaiter(void 0, void 0, void 0, function* () {
            buyToken = yield ERC20.new("BT", "BT");
            yield buyToken.mint(user_1, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            yield buyToken.approve(easyAuction.address, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            sellToken = yield ERC20.new("BT", "BT");
            yield sellToken.mint(user_1, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            yield sellToken.approve(easyAuction.address, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            const auctionId = yield sendTxAndGetReturnValue(easyAuction.initiateAuction, sellToken.address, buyToken.address, 60 * 60, new bn_js_1.default(10).pow(new bn_js_1.default(18)), new bn_js_1.default(10).pow(new bn_js_1.default(18)));
            const balanceBeforeOrderPlacement = yield buyToken.balanceOf(user_1);
            const sellAmount = new bn_js_1.default(10).pow(new bn_js_1.default(18)).add(new bn_js_1.default(1));
            const buyAmount = new bn_js_1.default(10).pow(new bn_js_1.default(18));
            yield easyAuction.placeBuyOrders(auctionId, [buyAmount, buyAmount], [sellAmount, sellAmount.add(new bn_js_1.default(1))], [queueStartElement, queueStartElement]);
            assert.equal((yield buyToken.balanceOf(easyAuction.address)).toString(), buyAmount.add(buyAmount).toString());
            assert.equal((yield buyToken.balanceOf(user_1)).toString(), balanceBeforeOrderPlacement.sub(buyAmount).sub(buyAmount).toString());
        }));
        it("fails, if transfers are failing", () => __awaiter(void 0, void 0, void 0, function* () {
            buyToken = yield ERC20.new("BT", "BT");
            yield buyToken.mint(user_1, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            yield buyToken.approve(easyAuction.address, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            sellToken = yield ERC20.new("BT", "BT");
            yield sellToken.mint(user_1, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            yield sellToken.approve(easyAuction.address, new bn_js_1.default(10).pow(new bn_js_1.default(30)));
            const auctionId = yield sendTxAndGetReturnValue(easyAuction.initiateAuction, sellToken.address, buyToken.address, 60 * 60, new bn_js_1.default(10).pow(new bn_js_1.default(18)), new bn_js_1.default(10).pow(new bn_js_1.default(18)));
            const balanceBeforeOrderPlacement = yield buyToken.balanceOf(user_1);
            const sellAmount = new bn_js_1.default(10).pow(new bn_js_1.default(18)).add(new bn_js_1.default(1));
            const buyAmount = new bn_js_1.default(10).pow(new bn_js_1.default(18));
            yield buyToken.approve(easyAuction.address, new bn_js_1.default(0));
            yield truffle_assertions_1.default.reverts(easyAuction.placeBuyOrders(auctionId, [buyAmount, buyAmount], [sellAmount, sellAmount.add(new bn_js_1.default(1))], [queueStartElement, queueStartElement]), "transfer failed");
        }));
    }));
}));
