import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { isAvaxNetwork } from "../tasks/utils";
import { contractNames } from "../ts/deploy";

const deployVerifierContract: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const { deploy } = deployments;
  const { allowListOffChainManaged } = contractNames;
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;

  await deploy(allowListOffChainManaged, {
    from: deployer,
    gasLimit: 8000000,
    args: [],
    log: true,
    deterministicDeployment: !isAvaxNetwork(chainId),
  });
};

export default deployVerifierContract;
