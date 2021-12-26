import { Contract, BigNumber } from "ethers";
import hre, { ethers, waffle } from "hardhat";

import {
  createTokensAndMintAndApprove,
  placeOrders,
} from "../../src/priceCalculation";

import { createAuctionWithDefaultsAndReturnId } from "./defaultContractInteractions";
import { closeAuction } from "./utilities";

describe("EasyAuction", async () => {
  const [user_1, user_2] = waffle.provider.getWallets();
  let easyAuction: Contract;
  beforeEach(async () => {
    const EasyAuction = await ethers.getContractFactory("EasyAuction");

    easyAuction = await EasyAuction.deploy();
  });

  it("e2e - places a lot of sellOrders, such that the second last order is the clearingOrder and calculates the price to test gas usage of settleAuction", async () => {
    const { auctioningToken, biddingToken } =
      await createTokensAndMintAndApprove(easyAuction, [user_1, user_2], hre);
    const nrTests = 12; // increase here for better gas estimations, nrTests-2 must be a divisor of 10**18
    const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
      easyAuction,
      {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: ethers.utils.parseEther("1000"),
        minBuyAmount: ethers.utils.parseEther("1000"),
      },
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
          userId: BigNumber.from(1),
        },
      ];
      await placeOrders(easyAuction, sellOrder, auctionId, hre);
    }
    await closeAuction(easyAuction, auctionId);
    const tx = await easyAuction.settleAuction(auctionId);
    const gasUsed = (await tx.wait()).gasUsed;

    console.log("Gas usage for verification", gasUsed.toString());
  });
});
