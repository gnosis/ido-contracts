import { BigNumber } from "ethers";
import hre from "hardhat";

import { calculateClearingPrice, encodeOrder } from "../priceCalculation";

// better approach would be to do via it tasks
async function main() {
  const auctionId = BigNumber.from(2);
  const EasyAuction = await hre.ethers.getContractAt(
    "EasyAuction",
    "0xa75de195d7f6f48d773654058fB5A9492B23f842",
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
