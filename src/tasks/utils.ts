import { Contract } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import weth9Networks from "../../node_modules/canonical-weth/networks.json";
import { TypedDataDomain } from "../ts/ethers";

export function domain(
  chainId: number,
  verifyingContract: string,
): TypedDataDomain {
  return {
    name: "AccessManager",
    version: "v1",
    chainId,
    verifyingContract,
  };
}

export async function getEasyAuctionContract({
  ethers,
  deployments,
}: HardhatRuntimeEnvironment): Promise<Contract> {
  // const authenticatorDeployment = await deployments.get("EasyAuction");
  
  const json = `[{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"auctionId","type":"uint256"},{"indexed":false,"internalType":"uint96","name":"soldAuctioningTokens","type":"uint96"},{"indexed":false,"internalType":"uint96","name":"soldBiddingTokens","type":"uint96"},{"indexed":false,"internalType":"bytes32","name":"clearingPriceOrder","type":"bytes32"}],"name":"AuctionCleared","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"auctionId","type":"uint256"},{"indexed":true,"internalType":"uint64","name":"userId","type":"uint64"},{"indexed":false,"internalType":"uint96","name":"buyAmount","type":"uint96"},{"indexed":false,"internalType":"uint96","name":"sellAmount","type":"uint96"}],"name":"CancellationSellOrder","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"auctionId","type":"uint256"},{"indexed":true,"internalType":"uint64","name":"userId","type":"uint64"},{"indexed":false,"internalType":"uint96","name":"buyAmount","type":"uint96"},{"indexed":false,"internalType":"uint96","name":"sellAmount","type":"uint96"}],"name":"ClaimedFromOrder","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"auctionId","type":"uint256"},{"indexed":true,"internalType":"contract IERC20","name":"_auctioningToken","type":"address"},{"indexed":true,"internalType":"contract IERC20","name":"_biddingToken","type":"address"},{"indexed":false,"internalType":"uint256","name":"orderCancellationEndDate","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"auctionEndDate","type":"uint256"},{"indexed":false,"internalType":"uint64","name":"userId","type":"uint64"},{"indexed":false,"internalType":"uint96","name":"_auctionedSellAmount","type":"uint96"},{"indexed":false,"internalType":"uint96","name":"_minBuyAmount","type":"uint96"},{"indexed":false,"internalType":"uint256","name":"minimumBiddingAmountPerOrder","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"minFundingThreshold","type":"uint256"},{"indexed":false,"internalType":"address","name":"allowListContract","type":"address"},{"indexed":false,"internalType":"bytes","name":"allowListData","type":"bytes"}],"name":"NewAuction","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"auctionId","type":"uint256"},{"indexed":true,"internalType":"uint64","name":"userId","type":"uint64"},{"indexed":false,"internalType":"uint96","name":"buyAmount","type":"uint96"},{"indexed":false,"internalType":"uint96","name":"sellAmount","type":"uint96"}],"name":"NewSellOrder","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint64","name":"userId","type":"uint64"},{"indexed":true,"internalType":"address","name":"userAddress","type":"address"}],"name":"NewUser","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint64","name":"userId","type":"uint64"}],"name":"UserRegistration","type":"event"},{"inputs":[],"name":"FEE_DENOMINATOR","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"auctionAccessData","outputs":[{"internalType":"bytes","name":"","type":"bytes"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"auctionAccessManager","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"auctionCounter","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"auctionData","outputs":[{"internalType":"contract IERC20","name":"auctioningToken","type":"address"},{"internalType":"contract IERC20","name":"biddingToken","type":"address"},{"internalType":"uint256","name":"orderCancellationEndDate","type":"uint256"},{"internalType":"uint256","name":"auctionEndDate","type":"uint256"},{"internalType":"bytes32","name":"initialAuctionOrder","type":"bytes32"},{"internalType":"uint256","name":"minimumBiddingAmountPerOrder","type":"uint256"},{"internalType":"uint256","name":"interimSumBidAmount","type":"uint256"},{"internalType":"bytes32","name":"interimOrder","type":"bytes32"},{"internalType":"bytes32","name":"clearingPriceOrder","type":"bytes32"},{"internalType":"uint96","name":"volumeClearingPriceOrder","type":"uint96"},{"internalType":"bool","name":"minFundingThresholdNotReached","type":"bool"},{"internalType":"bool","name":"isAtomicClosureAllowed","type":"bool"},{"internalType":"uint256","name":"feeNumerator","type":"uint256"},{"internalType":"uint256","name":"minFundingThreshold","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"auctionId","type":"uint256"},{"internalType":"bytes32[]","name":"_sellOrders","type":"bytes32[]"}],"name":"cancelSellOrders","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"auctionId","type":"uint256"},{"internalType":"bytes32[]","name":"orders","type":"bytes32[]"}],"name":"claimFromParticipantOrder","outputs":[{"internalType":"uint256","name":"sumAuctioningTokenAmount","type":"uint256"},{"internalType":"uint256","name":"sumBiddingTokenAmount","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"auctionId","type":"uint256"},{"internalType":"bytes32","name":"order","type":"bytes32"}],"name":"containsOrder","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"feeNumerator","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"feeReceiverUserId","outputs":[{"internalType":"uint64","name":"","type":"uint64"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"auctionId","type":"uint256"}],"name":"getSecondsRemainingInBatch","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"user","type":"address"}],"name":"getUserId","outputs":[{"internalType":"uint64","name":"userId","type":"uint64"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"contract IERC20","name":"_auctioningToken","type":"address"},{"internalType":"contract IERC20","name":"_biddingToken","type":"address"},{"internalType":"uint256","name":"orderCancellationEndDate","type":"uint256"},{"internalType":"uint256","name":"auctionEndDate","type":"uint256"},{"internalType":"uint96","name":"_auctionedSellAmount","type":"uint96"},{"internalType":"uint96","name":"_minBuyAmount","type":"uint96"},{"internalType":"uint256","name":"minimumBiddingAmountPerOrder","type":"uint256"},{"internalType":"uint256","name":"minFundingThreshold","type":"uint256"},{"internalType":"bool","name":"isAtomicClosureAllowed","type":"bool"},{"internalType":"address","name":"accessManagerContract","type":"address"},{"internalType":"bytes","name":"accessManagerContractData","type":"bytes"}],"name":"initiateAuction","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"numUsers","outputs":[{"internalType":"uint64","name":"","type":"uint64"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"auctionId","type":"uint256"},{"internalType":"uint96[]","name":"_minBuyAmounts","type":"uint96[]"},{"internalType":"uint96[]","name":"_sellAmounts","type":"uint96[]"},{"internalType":"bytes32[]","name":"_prevSellOrders","type":"bytes32[]"},{"internalType":"bytes","name":"allowListCallData","type":"bytes"}],"name":"placeSellOrders","outputs":[{"internalType":"uint64","name":"userId","type":"uint64"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"auctionId","type":"uint256"},{"internalType":"uint96[]","name":"_minBuyAmounts","type":"uint96[]"},{"internalType":"uint96[]","name":"_sellAmounts","type":"uint96[]"},{"internalType":"bytes32[]","name":"_prevSellOrders","type":"bytes32[]"},{"internalType":"bytes","name":"allowListCallData","type":"bytes"},{"internalType":"address","name":"orderSubmitter","type":"address"}],"name":"placeSellOrdersOnBehalf","outputs":[{"internalType":"uint64","name":"userId","type":"uint64"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"auctionId","type":"uint256"},{"internalType":"uint256","name":"iterationSteps","type":"uint256"}],"name":"precalculateSellAmountSum","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"user","type":"address"}],"name":"registerUser","outputs":[{"internalType":"uint64","name":"userId","type":"uint64"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"newFeeNumerator","type":"uint256"},{"internalType":"address","name":"newfeeReceiverAddress","type":"address"}],"name":"setFeeParameters","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"auctionId","type":"uint256"}],"name":"settleAuction","outputs":[{"internalType":"bytes32","name":"clearingOrder","type":"bytes32"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"auctionId","type":"uint256"},{"internalType":"uint96[]","name":"_minBuyAmount","type":"uint96[]"},{"internalType":"uint96[]","name":"_sellAmount","type":"uint96[]"},{"internalType":"bytes32[]","name":"_prevSellOrder","type":"bytes32[]"},{"internalType":"bytes","name":"allowListCallData","type":"bytes"}],"name":"settleAuctionAtomically","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"}]`

  const authenticator = new Contract(
    '0xb5D00F83680ea5E078e911995c64b43Fbfd1eE61',
    JSON.parse(json)
  ).connect(ethers.provider)

  // const authenticator = new Contract(
  //   authenticatorDeployment.address,
  //   authenticatorDeployment.abi,
  // ).connect(ethers.provider);

  return authenticator;
}
export async function getAllowListOffChainManagedContract({
  ethers,
  deployments,
}: HardhatRuntimeEnvironment): Promise<Contract> {
  const authenticatorDeployment = await deployments.get(
    "AllowListOffChainManaged",
  );

  const authenticator = new Contract(
    authenticatorDeployment.address,
    authenticatorDeployment.abi,
  ).connect(ethers.provider);

  return authenticator;
}

export async function getDepositAndPlaceOrderContract({
  ethers,
  deployments,
}: HardhatRuntimeEnvironment): Promise<Contract> {
  const depositAndPlaceOrderDeployment = await deployments.get(
    "DepositAndPlaceOrder",
  );

  const authenticator = new Contract(
    depositAndPlaceOrderDeployment.address,
    depositAndPlaceOrderDeployment.abi,
  ).connect(ethers.provider);

  return authenticator;
}

export async function getWETH9Address(
  hre: HardhatRuntimeEnvironment,
): Promise<string> {
  // Todo: to be refactored...
  let weth9Address = "";
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  if (chainId == 4) {
    weth9Address = weth9Networks.WETH9["4"]["address"];
  } else if (chainId == 1) {
    weth9Address = weth9Networks.WETH9["1"]["address"];
  } else if (chainId == 137) {
    weth9Address = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";
  } else if (chainId == 56) {
    weth9Address = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
  } else if (chainId == 100) {
    weth9Address = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
  }
  return weth9Address;
}
