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
const EasyAuction = artifacts.require("EasyAuction.sol");
const ERC20 = artifacts.require("ERC20.sol");
const { encodeOrder, queueStartElement, sendTxAndGetReturnValue, closeAuction, } = require("./utilities");
contract("IterableOrderedOrderSet", function () {
    let easyAuction;
    let buyToken;
    let sellToken;
    beforeEach(() => __awaiter(this, void 0, void 0, function* () {
        easyAuction = yield EasyAuction.new();
    }));
    it("e2e - places a lot of buyOrders and calculates the price", () => __awaiter(this, void 0, void 0, function* () {
        buyToken = yield ERC20.new("BT", "BT");
        sellToken = yield ERC20.new("BT", "BT");
        const auctionId = yield sendTxAndGetReturnValue(easyAuction.initiateAuction, buyToken.address, sellToken.address, 60 * 60, (Math.pow(10, 18)).toString(), Math.pow(10, 18));
        const nrTests = 30;
        for (let i = 1; i < nrTests; i++) {
            const buyOrder = encodeOrder(1, i * Math.pow(10, 18), Math.floor(Math.pow(10, 18) / (nrTests - 2)));
            let prevBuyOrder = encodeOrder(1, (i - 1) * Math.pow(10, 18), Math.floor(Math.pow(10, 18) / (nrTests - 2)));
            if (i == 1) {
                prevBuyOrder = queueStartElement;
            }
            yield easyAuction.placeBuyOrders(auctionId, [i * Math.pow(10, 18)], [Math.floor(Math.pow(10, 18) / (nrTests - 2))], [prevBuyOrder]);
        }
        yield closeAuction(easyAuction, auctionId, web3);
        const ans = yield easyAuction.calculatePrice.call(auctionId);
        console.log(ans);
        console.log(ans[0] + "/" + ans[1] + " = " + ans[0].div(ans[1]));
        yield easyAuction.calculatePrice.call(auctionId);
    }));
});
