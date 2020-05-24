const EasyAuction = artifacts.require("./EasyAuction.sol");
import BN from "bn.js";

const argv = require("yargs")
  .option("auctionId", {
    describe: "Id of auction",
    default: 0,
  })
  .help(false)
  .version(false).argv;

module.exports = async function (callback) {
  try {
    const easyAuction = await EasyAuction.deployed();
    await easyAuction.calculatePrice(argv.auctionId);

    callback();
  } catch (error) {
    callback(error);
  }
};
