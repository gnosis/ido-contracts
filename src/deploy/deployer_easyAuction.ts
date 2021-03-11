import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import weth9Networks from "../../node_modules/canonical-weth/networks.json";
import { contractNames } from "../ts/deploy";

const deployEasyContract: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const { deploy, get } = deployments;

  const { depositAndPlaceOrder } = contractNames;

  const { easyAuction } = contractNames;

  await deploy(easyAuction, {
    from: deployer,
    gasLimit: 8000000,
    args: [],
    log: true,
    deterministicDeployment: false,
  });
  const easyAuctionDeployed = await get(easyAuction);
  let weth9Address;
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  if (chainId == 4) {
    weth9Address = weth9Networks.WETH9["4"]["address"];
  } else if (chainId == 1) {
    weth9Address = weth9Networks.WETH9["1"]["address"];
  } else if (chainId == 100) {
    weth9Address = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
  }

  await deploy(depositAndPlaceOrder, {
    from: deployer,
    gasLimit: 8000000,
    args: [easyAuctionDeployed.address, weth9Address],
    log: true,
    deterministicDeployment: true,
  });
};

export default deployEasyContract;
