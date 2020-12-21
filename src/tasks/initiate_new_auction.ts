import "hardhat-deploy";
import "@nomiclabs/hardhat-ethers";
import { ethers } from "ethers";
import { task, types } from "hardhat/config";

import { getEasyAuctionContract } from "./utils";

const initiateAuction: () => void = () => {
  task("initiateAuction", "Starts a new auction")
    .addParam(
      "sellToken",
      "The ERC20's address of the token that should be sold",
    )
    .addParam(
      "buyToken",
      "The ERC20's address of the token that should be bought",
    )
    .addParam("sellAmount", "The amount of sellTokens to be sold in atoms")
    .addParam(
      "minBuyAmount",
      "The amount of buyToken to be bought at least for selling sellAmount in atoms",
    )
    .addOptionalParam(
      "duration",
      "Describes how long the auction should last in seconds",
      "3600",
      types.string,
    )
    .addOptionalParam(
      "minBuyAmountPerOrder",
      "Describes the minimal buyAmount per order placed in the auction. This can be used in order to protect against too high gas costs for the settlement",
      "0.01",
      types.string,
    )
    .setAction(async (taskArgs, hardhatRuntime) => {
      const [caller] = await hardhatRuntime.ethers.getSigners();
      console.log("Using the account:", caller.address);

      const easyAuction = await getEasyAuctionContract(hardhatRuntime);
      const buyToken = await hardhatRuntime.ethers.getContractAt(
        "ERC20",
        taskArgs.buyToken,
      );
      const sellToken = await hardhatRuntime.ethers.getContractAt(
        "ERC20",
        taskArgs.sellToken,
      );
      const sellAmountsInAtoms = ethers.utils.parseUnits(
        taskArgs.sellAmount,
        await sellToken.callStatic.decimals(),
      );
      const minBuyAmountInAtoms = ethers.utils.parseUnits(
        taskArgs.minBuyAmount,
        await buyToken.callStatic.decimals(),
      );
      const minParticipantsBuyAmount = ethers.utils.parseUnits(
        taskArgs.minBuyAmountPerOrder,
        await buyToken.callStatic.decimals(),
      );

      console.log("Using EasyAuction deployed to:", easyAuction.address);

      const allowance = await sellToken.callStatic.allowance(
        caller.address,
        easyAuction.address,
      );
      if (sellAmountsInAtoms.gt(allowance)) {
        console.log("Approving tokens:");
        const tx = await sellToken
          .connect(caller)
          .approve(easyAuction.address, sellAmountsInAtoms);
        await tx.wait();
        console.log("Done");
      }

      console.log("Auction gets initiated:");
      const tx = await easyAuction
        .connect(caller)
        .initiateAuction(
          sellToken.address,
          buyToken.address,
          taskArgs.duration,
          sellAmountsInAtoms,
          minBuyAmountInAtoms,
          minParticipantsBuyAmount,
        );
      const txResult = await tx.wait();
      const auctionId = txResult.events
        .filter((event: any) => event.event === "NewAuction")
        .map((event: any) => event.args.auctionId);
      console.log(
        "Your auction has been schedule and has the Id:",
        auctionId.toString(),
      );
    });
};
export { initiateAuction };

// Rinkeby tests task selling WETH for DAI:
// yarn hardhat initiateAuction --sell-token "0xc778417e063141139fce010982780140aa0cd5ab" --buy-token "0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa" --sell-amount 0.1 --min-buy-amount 50 --network rinkeby
