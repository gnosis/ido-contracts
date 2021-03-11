import "hardhat-deploy";
import "@nomiclabs/hardhat-ethers";
import { task } from "hardhat/config";

import weth9Networks from "../../node_modules/canonical-weth/networks.json";

import {
  getAllowListOffChainManagedContract,
  getDepositAndPlaceOrderContract,
  getEasyAuctionContract,
} from "./utils";

const verifyContracts: () => void = () => {
  task("verifyContracts", "Verifies all contracts").setAction(
    async (taskArgs, hardhatRuntime) => {
      const easyAuction = await getEasyAuctionContract(hardhatRuntime);
      await hardhatRuntime.run("verify", {
        address: easyAuction.address,
        constructorArguments: [],
      });
      const allowList = await getAllowListOffChainManagedContract(
        hardhatRuntime,
      );
      await hardhatRuntime.run("verify", {
        address: allowList.address,
        constructorArguments: [],
      });
      let weth9Address;
      const chainId = (await hardhatRuntime.ethers.provider.getNetwork())
        .chainId;
      if (chainId == 4) {
        weth9Address = weth9Networks.WETH9["4"]["address"];
      } else if (chainId == 1) {
        weth9Address = weth9Networks.WETH9["1"]["address"];
      } else if (chainId == 100) {
        weth9Address = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
      }
      const depositAndPlaceOrder = await getDepositAndPlaceOrderContract(
        hardhatRuntime,
      );

      await hardhatRuntime.run("verify", {
        address: depositAndPlaceOrder.address,
        constructorArguments: [easyAuction.address, weth9Address],
      });
    },
  );
};

export { verifyContracts };
