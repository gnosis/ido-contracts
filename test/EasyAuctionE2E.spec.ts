const EasyAuction = artifacts.require("EasyAuction.sol");
const ERC20 = artifacts.require("ERC20Mintable.sol");
import BN from "bn.js";

import { EasyAuctionInstance } from "../types/truffle-typings";

const {
  encodeOrder,
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

  it("e2e - places a lot of buyOrders and calculates the price to test gas usage of claculatePrice", async () => {
    buyToken = await ERC20.new("BT", "BT");
    await buyToken.mint(user_1, new BN(10).pow(new BN(30)));
    await buyToken.approve(easyAuction.address, new BN(10).pow(new BN(30)));

    sellToken = await ERC20.new("BT", "BT");
    await sellToken.mint(user_1, new BN(10).pow(new BN(30)));
    await sellToken.approve(easyAuction.address, new BN(10).pow(new BN(30)));
    const auctionId = await sendTxAndGetReturnValue(
      easyAuction.initiateAuction,
      buyToken.address,
      sellToken.address,
      60 * 60,
      new BN(10).pow(new BN(18)),
      new BN(10).pow(new BN(18))
    );
    const nrTests = 5;
    for (let i = 1; i < nrTests; i++) {
      const buyOrder = encodeOrder(
        1,
        new BN(i).mul(new BN(10).pow(new BN(18))),
        new BN(10).pow(new BN(18)).div(new BN(nrTests - 2))
      );
      let prevBuyOrder = encodeOrder(
        1,
        new BN(i - 1).mul(new BN(10).pow(new BN(18))),
        new BN(10).pow(new BN(18)).div(new BN(nrTests - 2))
      );
      if (i == 1) {
        prevBuyOrder = queueStartElement;
      }
      await easyAuction.placeBuyOrders(
        auctionId,
        [new BN(i).mul(new BN(10).pow(new BN(18)))],
        [new BN(10).pow(new BN(18)).div(new BN(nrTests - 2))],
        [prevBuyOrder]
      );
    }
    await closeAuction(easyAuction, auctionId, web3);
    const ans = await easyAuction.calculatePrice.call(auctionId);
    console.log(ans);
    console.log(ans[0] + "/" + ans[1] + " = " + ans[0].div(ans[1]));
    await easyAuction.calculatePrice(auctionId);
  });
});
