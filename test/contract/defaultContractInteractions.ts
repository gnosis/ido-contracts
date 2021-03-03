import { Contract, BigNumber } from "ethers";
import { ethers } from "hardhat";

import { InitiateAuctionInput } from "../../src/ts/types";

import { sendTxAndGetReturnValue } from "./utilities";

export async function createAuctionWithDefaults(
  easyAuction: Contract,
  parameters: Partial<InitiateAuctionInput> &
    Pick<InitiateAuctionInput, "auctioningToken" | "biddingToken">,
): Promise<BigNumber> {
  return sendTxAndGetReturnValue(
    easyAuction,
    "initiateAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool,address)",
    parameters.auctioningToken.address,
    parameters.biddingToken.address,
    parameters.orderCancelationPeriodDuration ?? 60 * 60,
    parameters.duration ?? 60 * 60,
    parameters.auctionedSellAmount ?? ethers.utils.parseEther("1"),
    parameters.minBuyAmount ?? ethers.utils.parseEther("1"),
    parameters.minimumBiddingAmountPerOrder ?? 1,
    parameters.minFundingThreshold ?? 0,
    parameters.isAtomicClosureAllowed ?? false,
    parameters.allowListManager ?? "0x0000000000000000000000000000000000000000",
  );
}
