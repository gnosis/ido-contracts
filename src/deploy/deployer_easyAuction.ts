import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { contractNames } from "../ts/deploy";

const deployEasyContract: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const { deploy } = deployments;

  const { easyAuction } = contractNames;

  await deploy(easyAuction, {
    from: deployer,
    gasLimit: 8000000,
    args: [],
    log: true,
    deterministicDeployment: false,
  });
};

export default deployEasyContract;
