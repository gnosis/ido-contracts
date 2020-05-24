const EasyAuction = artifacts.require("EasyAuction.sol");
const ERC20 = artifacts.require("ERC20Mintable.sol");
import BN from "bn.js";

import { EasyAuctionInstance } from "../types/truffle-typings";

const {
  encodeOrder,
  toPrice,
  Price,
  queueStartElement,
  sendTxAndGetReturnValue,
  closeAuction,
} = require("./utilities");

contract("IterableOrderedOrderSet", async (accounts) => {
  const [user_1] = accounts;

  let easyAuction: EasyAuctionInstance;
  let buyToken;
  let sellToken;
  beforeEach(async () => {
    easyAuction = await EasyAuction.new();
  });

  it("e2e - places a lot of buyOrders, such that the second last order is the clearingOrder and calculates the price to test gas usage of calculatePrice", async () => {
    buyToken = await ERC20.new("BT", "BT");
    await buyToken.mint(user_1, new BN(10).pow(new BN(30)));
    await buyToken.approve(easyAuction.address, new BN(10).pow(new BN(30)));

    sellToken = await ERC20.new("BT", "BT");
    await sellToken.mint(user_1, new BN(10).pow(new BN(30)));
    await sellToken.approve(easyAuction.address, new BN(10).pow(new BN(30)));
    const nrTests = 6; // increase here for better gas estimations, nrTests-2 must be a divisor of 10**18
    const auctionId = await sendTxAndGetReturnValue(
      easyAuction.initiateAuction,
      buyToken.address,
      sellToken.address,
      60 * 60,
      new BN(10).pow(new BN(18)),
      new BN(10).pow(new BN(18))
    );
    for (let i = 2; i < nrTests; i++) {
      let prevBuyOrder = queueStartElement;
      await easyAuction.placeBuyOrders(
        auctionId,
        [new BN(10).pow(new BN(18)).div(new BN(nrTests - 2))],
        [
          new BN(10)
            .pow(new BN(18))
            .div(new BN(nrTests - 2))
            .div(new BN(i)),
        ],
        [prevBuyOrder]
      );
    }
    await closeAuction(easyAuction, auctionId, web3);
    const price = toPrice(
      await sendTxAndGetReturnValue(easyAuction.calculatePrice, auctionId)
    );
    assert.equal(
      price.priceNumerator.toString(),
      new BN(10)
        .pow(new BN(18))
        .div(new BN(nrTests - 2))
        .toString()
    );
    assert.equal(
      price.priceDenominator.toString(),
      new BN(10)
        .pow(new BN(18))
        .div(new BN(nrTests - 2))
        .div(new BN(2))
        .toString()
    );
  });
});
