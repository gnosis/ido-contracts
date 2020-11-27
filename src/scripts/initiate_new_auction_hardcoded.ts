import { BigNumber } from "ethers";
import hre from "hardhat";

// better approach to do via it tasks

async function main() {
  const sellAmount = 1000;
  const duration = 1000;
  const buyAmount = 1000;
  const EasyAuction = await hre.ethers.getContractAt(
    "EasyAuction",
    "0x1d7962fdfe4a4e4aa08ec3b92925389cdb709068",
  );
  const easyAuction = await EasyAuction.deployed();

  console.log("easyAuction deployed to:", easyAuction.address);

  const sellToken = await hre.ethers.getContractAt(
    "ERC20",
    "0x5592ec0cfb4dbc12d3ab100b257153436a1f0fea",
  );
  if (
    BigNumber.from(sellAmount).gt(
      await sellToken.callStatic.allowance(
        "0x740a98F8f4fAe0986FB3264Fe4aaCf94ac1EE96f",
        easyAuction.address,
      ),
    )
  ) {
    await sellToken.approve(easyAuction.address, sellAmount);
  }
  const buyToken = await hre.ethers.getContractAt(
    "ERC20",
    "0xc778417e063141139fce010982780140aa0cd5ab",
  );

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
