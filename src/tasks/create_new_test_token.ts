import "hardhat-deploy";
import "@nomiclabs/hardhat-ethers";
import { task } from "hardhat/config";

import { createTokensAndMintAndApprove } from "../../src/priceCalculation";

import { getEasyAuctionContract } from "./utils";

const createTestToken: () => void = () => {
  task("createTestToken", "Starts a new auction").setAction(
    async (taskArgs, hardhatRuntime) => {
      const [caller] = await hardhatRuntime.ethers.getSigners();
      console.log("Using the account:", caller.address);

      const easyAuction = await getEasyAuctionContract(hardhatRuntime);
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [caller],
        hardhatRuntime,
      );
      console.log(
        "Following tokens were created: ",
        auctioningToken.address,
        "and",
        biddingToken.address,
      );
    },
  );
};
export { createTestToken };

// Rinkeby tests task selling WETH for DAI:
// yarn hardhat initiateAuction --auctioning-token "0xc778417e063141139fce010982780140aa0cd5ab" --bidding-token "0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa" --sell-amount 0.1 --min-buy-amount 50 --network rinkeby
