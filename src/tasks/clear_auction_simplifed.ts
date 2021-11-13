import "hardhat-deploy";
import "@nomiclabs/hardhat-ethers";
import { BigNumber } from "ethers";
import { task } from "hardhat/config";

import { getAuctionEndTimeStamp } from "../priceCalculation";

import { getEasyAuctionContract } from "./utils";

const PRECALCULATION_ITERATION_STEPS = 1000;

const clearAuctionSimplified: () => void = () => {
  task("clearAuctionSimplified", "Provides the clearing price to an auction")
    .addParam("auctionId", "Id of the auction to be cleared")
    .addParam(
      "numberOfOrdersToClear",
      "The number of orders that need to be considered for clearing - in most of teh cases, this number does not need to be exact",
    )
    .setAction(async (taskArgs, hardhatRuntime) => {
      const [caller] = await hardhatRuntime.ethers.getSigners();
      console.log("Using the account:", caller.address);
      const easyAuction = await getEasyAuctionContract(hardhatRuntime);
      const auctionEndDate = await getAuctionEndTimeStamp(
        easyAuction,
        taskArgs.auctionId,
      );
      if (auctionEndDate.gt(BigNumber.from(Math.floor(+new Date() / 1000)))) {
        throw new Error("Auction not yet ended");
      }
      if (taskArgs.numberOfOrdersToClear > PRECALCULATION_ITERATION_STEPS) {
        console.log(
          "The on-chain price calculation will be split into ",
          Math.floor(
            taskArgs.numberOfOrdersToClear / PRECALCULATION_ITERATION_STEPS,
          ),
          " separate txs",
        );
        for (
          let i = 0;
          i <
          Math.floor(
            taskArgs.numberOfOrdersToClear / PRECALCULATION_ITERATION_STEPS,
          );
          i++
        ) {
          const tx = await easyAuction
            .connect(caller)
            .precalculateSellAmountSum(
              taskArgs.auctionId,
              PRECALCULATION_ITERATION_STEPS,
            );
          const txResult = await tx.wait();
          console.log(txResult);
        }
      }
      const tx = await easyAuction
        .connect(caller)
        .settleAuction(taskArgs.auctionId);
      const txResult = await tx.wait();
      console.log(txResult);
    });
};

export { clearAuctionSimplified };
