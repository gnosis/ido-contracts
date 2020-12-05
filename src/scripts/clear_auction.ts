import { BigNumber } from "ethers";
import hre from "hardhat";

import { calculateClearingPrice, encodeOrder } from "../priceCalculation";
const defaultDeployOptions = {
  gasLimit: 4000000,
  gasPrice: 9000000000,
};

// better approach would be to do via it tasks
async function main() {
  const auctionId = BigNumber.from(2);
  const EasyAuction = await hre.ethers.getContractAt(
    "EasyAuction",
    "0x1d7962fdfe4a4e4aa08ec3b92925389cdb709068",
  );
  const easyAuction = await EasyAuction.deployed();

  const price = await calculateClearingPrice(easyAuction, auctionId);
  console.log("price will be cleared at", price);
  const tx = await easyAuction.verifyPrice(auctionId, encodeOrder(price));
  const txResult = await tx.wait();
  console.log(txResult);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
