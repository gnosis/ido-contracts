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
exports.sendTxAndGetReturnValue = exports.closeAuction = exports.waitForNSeconds = void 0;
const queueStartElement = "0xffffffffffffffffffffffffffffffffffffffff000000000000000000000001";
const queueLastElement = "0x0000000000000000000000000000000000000000000000000000000000000001";
const encodeOrder = function (userId, sellAmount, buyAmount) {
    return ("0x" +
        userId.toString(16).padStart(16, "0") +
        sellAmount.toString(16).padStart(24, "0") +
        buyAmount.toString(16).padStart(24, "0"));
};
const jsonrpc = "2.0";
const id = 0;
const send = function (method, params, web3Provider) {
    return new Promise(function (resolve, reject) {
        web3Provider.currentProvider.send({ id, jsonrpc, method, params }, (error, result) => {
            if (error) {
                reject(error);
            }
            else {
                resolve(result);
            }
        });
    });
};
function waitForNSeconds(seconds, web3Provider = web3) {
    return __awaiter(this, void 0, void 0, function* () {
        yield send("evm_increaseTime", [seconds], web3Provider);
        yield send("evm_mine", [], web3Provider);
    });
}
exports.waitForNSeconds = waitForNSeconds;
function closeAuction(instance, auctionId, web3Provider = web3) {
    return __awaiter(this, void 0, void 0, function* () {
        const time_remaining = (yield instance.getSecondsRemainingInBatch(auctionId)).toNumber();
        yield waitForNSeconds(time_remaining + 1, web3Provider);
    });
}
exports.closeAuction = closeAuction;
function sendTxAndGetReturnValue(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
method, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
...args) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield method.call(...args);
        yield method.sendTransaction(...args);
        return result;
    });
}
exports.sendTxAndGetReturnValue = sendTxAndGetReturnValue;
// import { EasyAuctionInstance } from "../types/truffle-typings";
// const getAllOrders = async function (
//   easyAuction: EasyAuctionInstance
// ): Promise<Order[]> {
//   const events = (
//     await easyAuction.getPastEvents("NewBuyOrder", {
//       fromBlock: 0,
//       toBlock: "latest",
//     })
//   ).returnValues;
//   return events.map((object) => {
//     userId: object.returnValues.userId;
//     sellAmount: object.returnValues.sellAmount;
//     buyAmount: object.returnValues.buyAmount;
//   });
// };
// const placeBuyOrderWithOptimalProceedingElement = function (
//   easyAuction: EasyAuctionInstance,
//   sellAmount: number,
//   buyAmount: number
// ): void {
//   const orders = getAllOrders(easyAuction);
// };
module.exports = {
    encodeOrder,
    //placeBuyOrderWithOptimalProceedingElement,
    sendTxAndGetReturnValue,
    queueStartElement,
    queueLastElement,
    closeAuction,
};
