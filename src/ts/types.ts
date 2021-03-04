import { BigNumberish, BytesLike, Contract } from "ethers";

export interface InitiateAuctionInput {
  auctioningToken: Contract;
  biddingToken: Contract;
  orderCancelationPeriodDuration: BigNumberish;
  duration: BigNumberish;
  auctionedSellAmount: BigNumberish;
  minBuyAmount: BigNumberish;
  minimumBiddingAmountPerOrder: BigNumberish;
  minFundingThreshold: BigNumberish;
  isAtomicClosureAllowed: boolean;
  allowListManager: BytesLike;
  allowListSigner: BytesLike;
}
