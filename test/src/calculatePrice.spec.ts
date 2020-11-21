// import {  BigNumber } from "ethers";
// import { ethers } from "hardhat";
// import { expect } from "chai";

// import "mocha";
// function json(obj: unknown): unknown {
//   return JSON.parse(JSON.stringify(obj));
// }

// import {
//   encodeOrder,
//   decodeOrder,
//   Order,
//   findClearingPrice,
// } from "../../src/priceCalculation";

// describe("Encoding Orders", () => {
//   describe("decodeOrders", () => {
//     it("checks that decoding reverts encoding", () => {
//       const order: Order = {
//         userId: BigNumber.from(1),
//         sellAmount: ethers.utils.parseEther("1"),
//         buyAmount: ethers.utils.parseEther("1"),
//       };
//       expect(json(order)).deep.eq(json(decodeOrder(encodeOrder(order))));
//     });
//   });
// });

// describe("Calculate Prices", () => {
//   describe("2 different scenario for the clearing price", () => {
//     it("one sell order is clearing order", () => {
//       const initialOrder = {
//         userId: BigNumber.from(1),
//         sellAmount: BigNumber.from(10).mul(ethers.utils.parseEther("1")),
//         buyAmount: BigNumber.from(2000).mul(ethers.utils.parseEther("1")),
//       };
//       const sellOrders: Order[] = [
//         {
//           userId: BigNumber.from(1),
//           sellAmount: BigNumber.from(1000).mul(ethers.utils.parseEther("1")),
//           buyAmount: BigNumber.from(4).mul(ethers.utils.parseEther("1")),
//         },
//         {
//           userId: BigNumber.from(1),
//           sellAmount: BigNumber.from(1500).mul(ethers.utils.parseEther("1")),
//           buyAmount: BigNumber.from(135).mul(BigNumber.from(10).pow(BigNumber.from(17))),
//         },
//       ];
//       const calculatedPrice = findClearingPrice(sellOrders, initialOrder);
//       const expectedPrice = {
//         priceNumerator: sellOrders[1].sellAmount,
//         priceDenominator: sellOrders[1].buyAmount,
//       };
//       expect(json(expectedPrice)).deep.eq(json(calculatedPrice));
//     });
//     it("initalOrder is clearing order", () => {
//       const initialOrder = {
//         userId: BigNumber.from(1),
//         sellAmount: BigNumber.from(10).mul(ethers.utils.parseEther("1")),
//         buyAmount: BigNumber.from(2000).mul(ethers.utils.parseEther("1")),
//       };
//       const sellOrders: Order[] = [
//         {
//           userId: BigNumber.from(1),
//           sellAmount: BigNumber.from(1000).mul(ethers.utils.parseEther("1")),
//           buyAmount: BigNumber.from(4).mul(ethers.utils.parseEther("1")),
//         },
//         {
//           userId: BigNumber.from(1),
//           sellAmount: BigNumber.from(1000).mul(ethers.utils.parseEther("1")),
//           buyAmount: BigNumber.from(45).mul(BigNumber.from(10).pow(BigNumber.from(17))),
//         },
//       ];
//       const calculatedPrice = findClearingPrice(sellOrders, initialOrder);
//       const expectedPrice = {
//         priceNumerator: initialOrder.buyAmount,
//         priceDenominator: initialOrder.sellAmount,
//       };
//       expect(json(expectedPrice)).deep.eq(json(calculatedPrice));
//     });
//   });
// });
