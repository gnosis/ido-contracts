import { BigNumberish, BytesLike, Contract } from "ethers";

export interface InitiateAuctionInput {
  auctioningToken: Contract;
  biddingToken: Contract;
  orderCancellationEndDate: BigNumberish;
  auctionEndDate: BigNumberish;
  auctionedSellAmount: BigNumberish;
  minBuyAmount: BigNumberish;
  minimumBiddingAmountPerOrder: BigNumberish;
  minFundingThreshold: BigNumberish;
  isAtomicClosureAllowed: boolean;
  allowListManager: BytesLike;
  allowListData: BytesLike;
}

export interface InitiateChannelAuctionInput {
  auctioningToken: Contract;
  biddingToken: Contract;
  _auctionedSellAmount: BigNumberish;
  _auctioneerBuyAmountMinimum: BigNumberish;
  _auctioneerBuyAmountMaximum: BigNumberish;
  _auctionStartDate: BigNumberish;
  _minimumBiddingAmountPerOrder: BigNumberish;
  _maxDuration: BigNumberish;
}
