import hre, { ethers } from "hardhat";

// better approach to do via it tasks
async function main() {
  // parameters: should be received from console later....
  const sellAmount = ethers.utils.parseEther("0.1");
  const duration = 60 * 60 * 24;
  const buyAmount = ethers.utils.parseEther("50");
  const EasyAuction = await hre.ethers.getContractAt(
    "EasyAuction",
    "0xa75de195d7f6f48d773654058fB5A9492B23f842",
  );
  const buyToken = await hre.ethers.getContractAt(
    "ERC20",
    "0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa",
  );
  const sellToken = await hre.ethers.getContractAt(
    "ERC20",
    "0xc778417e063141139fce010982780140aa0cd5ab",
  );

  const easyAuction = await EasyAuction.deployed();

  console.log("easyAuction deployed to:", easyAuction.address);

  const allowance = await sellToken.callStatic.allowance(
    sellToken.address,
    easyAuction.address,
  );
  if (sellAmount.gt(allowance)) {
    await sellToken.approve(easyAuction.address, sellAmount);
  }

  const tx = await easyAuction.initiateAuction(
    sellToken.address,
    buyToken.address,
    duration,
    sellAmount,
    buyAmount,
  );
  const txResult = await tx.wait();
  console.log(
    "You auction has been schedule and has the Id:",
    txResult.logs[2].data.toString(),
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
