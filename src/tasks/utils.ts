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
  const authenticatorDeployment = await deployments.get("EasyAuction");

  const authenticator = new Contract(
    authenticatorDeployment.address,
    authenticatorDeployment.abi,
  ).connect(ethers.provider);

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
  } else if (chainId == 43113) {
    weth9Address = "0xd9d01a9f7c810ec035c0e42cb9e80ef44d7f8692"; // wrapped avax
  } else if (chainId == 43114) {
    weth9Address = "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7"; // wrapped avax
  }
  return weth9Address;
}

export const isAvaxNetwork = (chainId: number): boolean =>
  chainId === 43113 || chainId === 43114;
