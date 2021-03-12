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
  } else if (chainId == 100) {
    weth9Address = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
  }
  return weth9Address;
}
