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
export async function waitForNSeconds(seconds, web3Provider = web3) {
    await send("evm_increaseTime", [seconds], web3Provider);
    await send("evm_mine", [], web3Provider);
}
export async function closeAuction(instance, auctionId, web3Provider = web3) {
    const time_remaining = (await instance.getSecondsRemainingInBatch(auctionId)).toNumber();
    await waitForNSeconds(time_remaining + 1, web3Provider);
}
export async function sendTxAndGetReturnValue(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
method, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
...args) {
    const result = await method.call(...args);
    await method.sendTransaction(...args);
    return result;
}
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
