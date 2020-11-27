import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import { ethers, waffle } from "hardhat";

import {
  encodeOrder,
  createTokensAndMintAndApprove,
  placeOrders,
  calculateClearingPrice,
} from "../../src/priceCalculation";

import { sendTxAndGetReturnValue, closeAuction } from "./utilities";

describe("EasyAuction", async () => {
  const [user_1, user_2] = waffle.provider.getWallets();
  let easyAuction: Contract;
  beforeEach(async () => {
    const EasyAuction = await ethers.getContractFactory("EasyAuction");

    easyAuction = await EasyAuction.deploy();
  });

  it("e2e - places a lot of sellOrders, such that the second last order is the clearingOrder and calculates the price to test gas usage of verifyPrice", async () => {
    const {
      sellToken,
      buyToken,
    } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);
    const nrTests = 12; // increase here for better gas estimations, nrTests-2 must be a divisor of 10**18
    const auctionId: BigNumber = await sendTxAndGetReturnValue(
      easyAuction,
      "initiateAuction(address,address,uint256,uint96,uint96)",
      sellToken.address,
      buyToken.address,
      60 * 60,
      ethers.utils.parseEther("1000"),
      ethers.utils.parseEther("1000"),
    );

    for (let i = 2; i < nrTests; i++) {
      const sellOrder = [
        {
          sellAmount: ethers.utils
            .parseEther("1000")
            .div(BigNumber.from(nrTests - 2)),
          buyAmount: BigNumber.from("10")
            .pow(BigNumber.from(18))
            .mul(1000)
            .div(BigNumber.from(nrTests - 2))
            .mul(i - 1)
            .div(BigNumber.from(i)),
          userId: BigNumber.from(0),
        },
      ];
      await placeOrders(easyAuction, sellOrder, auctionId);
    }
    await closeAuction(easyAuction, auctionId);
    const price = await calculateClearingPrice(easyAuction, auctionId);
    const tx = await easyAuction.verifyPrice(auctionId, encodeOrder(price));
    const gasUsed = (await tx.wait()).gasUsed;

    console.log("Gas usage for verification", gasUsed.toString());
  });
});
