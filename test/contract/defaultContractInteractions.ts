import { Contract, BigNumber } from "ethers";
import { ethers } from "hardhat";

import {
  InitiateAuctionInput,
  InitiateChannelAuctionInput,
} from "../../src/ts/types";

import { sendTxAndGetReturnValue } from "./utilities";

type PartialAuctionInput = Partial<InitiateAuctionInput> &
  Pick<InitiateAuctionInput, "auctioningToken" | "biddingToken">;

type PartialChannelAuctionInput = Partial<InitiateChannelAuctionInput> &
  Pick<InitiateChannelAuctionInput, "auctioningToken" | "biddingToken">;

async function createAuctionInputWithDefaults(
  parameters: PartialAuctionInput,
): Promise<unknown[]> {
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  return [
    parameters.auctioningToken.address,
    parameters.biddingToken.address,
    parameters.orderCancellationEndDate ?? now + 3600,
    parameters.auctionEndDate ?? now + 3600,
    parameters.auctionedSellAmount ?? ethers.utils.parseEther("1"),
    parameters.minBuyAmount ?? ethers.utils.parseEther("1"),
    parameters.minimumBiddingAmountPerOrder ?? 1,
    parameters.minFundingThreshold ?? 0,
    parameters.isAtomicClosureAllowed ?? false,
    parameters.allowListManager ?? "0x0000000000000000000000000000000000000000",
    parameters.allowListData ?? "0x",
  ];
}
async function createChannelAuctionInputWithDefaults(
  parameters: PartialChannelAuctionInput,
): Promise<unknown[]> {
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  return [
    parameters.auctioningToken.address,
    parameters.biddingToken.address,
    parameters._auctionedSellAmount ?? ethers.utils.parseEther("1"),
    parameters._auctioneerBuyAmountMinimum ?? ethers.utils.parseEther("1"),
    parameters._auctioneerBuyAmountMaximum ?? ethers.utils.parseEther("2"),
    parameters._auctionStartDate ?? now + 3600,
    parameters._minimumBiddingAmountPerOrder ?? 1,
    parameters._maxDuration ?? 3600,
  ];
}

export async function createAuctionWithDefaults(
  easyAuction: Contract,
  parameters: PartialAuctionInput,
): Promise<unknown> {
  return easyAuction.initiateAuction(
    ...(await createAuctionInputWithDefaults(parameters)),
  );
}
export async function createChannelAuctionWithDefaults(
  channelAuction: Contract,
  parameters: PartialChannelAuctionInput,
): Promise<unknown> {
  return channelAuction.initiateAuction(
    ...(await createChannelAuctionInputWithDefaults(parameters)),
  );
}

export async function createChannelAuctionWithDefaultsAndReturnId(
  channelAuction: Contract,
  parameters: PartialAuctionInput,
): Promise<BigNumber> {
  return sendTxAndGetReturnValue(
    channelAuction,
    "initiateAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool,address,bytes)",
    ...(await createAuctionInputWithDefaults(parameters)),
  );
}

export async function createAuctionWithDefaultsAndReturnId(
  easyAuction: Contract,
  parameters: PartialAuctionInput,
): Promise<BigNumber> {
  return sendTxAndGetReturnValue(
    easyAuction,
    "initiateAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool,address,bytes)",
    ...(await createAuctionInputWithDefaults(parameters)),
  );
}
