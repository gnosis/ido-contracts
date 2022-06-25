import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getWETH9Address, isAvaxNetwork } from "../tasks/utils";
import { contractNames } from "../ts/deploy";

const deployEasyContract: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const { deploy, get } = deployments;
  const { depositAndPlaceOrder } = contractNames;
  const { easyAuction } = contractNames;
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;

  await deploy(easyAuction, {
    from: deployer,
    gasLimit: 8000000,
    args: [],
    log: true,
    deterministicDeployment: false,
  });
  const easyAuctionDeployed = await get(easyAuction);
  const weth9Address = await getWETH9Address(hre);

  await deploy(depositAndPlaceOrder, {
    from: deployer,
    gasLimit: 8000000,
    args: [easyAuctionDeployed.address, weth9Address],
    log: true,
    deterministicDeployment: !isAvaxNetwork(chainId),
  });
};

export default deployEasyContract;
