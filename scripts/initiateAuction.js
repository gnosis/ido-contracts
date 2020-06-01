const EasyAuction = artifacts.require("./EasyAuction.sol");
const ERC20 = artifacts.require("ERC20Mintable.sol");

const BN = require("bn.js");

const argv = require("yargs")
  .option("sellAmount", {
    describe: "Amount of tokens to be sold",
    default: new BN(1).pow(new BN(17)),
  })
  .option("buyAmount", {
    describe: "Amount of tokens to be bought",
    default: new BN(1).pow(new BN(17)),
  })
  .option("sellToken", {
    describe: "Address of sellToken",
  })
  .option("buyToken", {
    describe: "Address of buyToken",
  })
  .option("duration", {
    describe: "Duration of auction",
    default: 360000,
  })
  .help(false)
  .version(false).argv;

module.exports = async function (callback) {
  try {
    const [account] = await web3.eth.getAccounts();
    const easyAuction = await EasyAuction.deployed();

    // fake minting, to be removed
    const buyToken = await ERC20.at(argv.buyToken);
    const sellToken = await ERC20.at(argv.sellToken);
    await sellToken.approve(easyAuction.address, new BN(10).pow(new BN(30)));

    //initiating
    await easyAuction.initiateAuction(
      sellToken.address,
      buyToken.address,
      argv.duration,
      argv.sellAmount,
      argv.buyAmount
    );

    callback();
  } catch (error) {
    callback(error);
  }
};
