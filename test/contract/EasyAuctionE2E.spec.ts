// const EasyAuction = artifacts.require("EasyAuction.sol");
// const ERC20 = artifacts.require("ERC20Mintable.sol");
// import BN from "bn.js";

// const { encodeOrder, closeAuction } = require("./utilities");
// const {
//   toPrice,
//   Price,
//   queueStartElement,
//   sendTxAndGetReturnValue,
// } = require("../../src/priceCalculation");

// contract("IterableOrderedOrderSet", async (accounts) => {
//   const [user_1] = accounts;

//   let easyAuction = await EasyAuction.new();
//   let buyToken;
//   let sellToken;
//   beforeEach(async () => {
//     easyAuction = await EasyAuction.new();
//   });

//   it("e2e - places a lot of sellOrders, such that the second last order is the clearingOrder and calculates the price to test gas usage of calculatePrice", async () => {
//     buyToken = await ERC20.new("BT", "BT");
//     await buyToken.mint(user_1, BigNumber.from(10).pow(BigNumber.from(30)));
//     await buyToken.approve(easyAuction.address, BigNumber.from(10).pow(BigNumber.from(30)));

//     sellToken = await ERC20.new("BT", "BT");
//     await sellToken.mint(user_1, BigNumber.from(10).pow(BigNumber.from(30)));
//     await sellToken.approve(easyAuction.address, BigNumber.from(10).pow(BigNumber.from(30)));
//     const nrTests = 6; // increase here for better gas estimations, nrTests-2 must be a divisor of 10**18
//     const auctionId = await sendTxAndGetReturnValue(
//       easyAuction.initiateAuction,
//       buyToken.address,
//       sellToken.address,
//       60 * 60,
//       ethers.utils.parseEther("1"),
//       ethers.utils.parseEther("1"),
//     );
//     for (let i = 2; i < nrTests; i++) {
//       const prevBuyOrder = queueStartElement;
//       await easyAuction.placeSellOrders(
//         auctionId,
//         [ethers.utils.parseEther("1").div(BigNumber.from(nrTests - 2))],
//         [
//           BigNumber.from(10)
//             .pow(BigNumber.from(18))
//             .div(BigNumber.from(nrTests - 2))
//             .div(BigNumber.from(i)),
//         ],
//         [prevBuyOrder],
//       );
//     }
//     await closeAuction(easyAuction, auctionId, web3);
//     const price = toPrice(
//       await sendTxAndGetReturnValue(easyAuction.calculatePrice, auctionId),
//     );
//     assert.equal(
//       price.priceNumerator.toString(),
//       BigNumber.from(10)
//         .pow(BigNumber.from(18))
//         .div(BigNumber.from(nrTests - 2))
//         .toString(),
//     );
//     assert.equal(
//       price.priceDenominator.toString(),
//       BigNumber.from(10)
//         .pow(BigNumber.from(18))
//         .div(BigNumber.from(nrTests - 2))
//         .div(BigNumber.from(2))
//         .toString(),
//     );
//   });
// });
