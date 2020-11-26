import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { salt, logResult, contractNames } from "../ts/deploy";

const deployEasyContract: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deployer } = await getNamedAccounts();
  const { deploy, log } = deployments;

  const { easyAuction } = contractNames;

  await deploy(easyAuction, {
    from: deployer,
    gasLimit: 8000000,
    args: [],
    log: true,
    deterministicDeployment: true,
  });

  // await logResult(deployResult, easyAuction, network.name, log);
};

export default deployEasyContract;
