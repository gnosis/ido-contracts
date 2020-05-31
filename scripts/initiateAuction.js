const EasyAuction = artifacts.require("./EasyAuction.sol");
const ERC20 = artifacts.require("ERC20Mintable.sol");

const BN = require("bn.js");

const argv = require("yargs")
  .option("sellAmount", {
    describe: "Amount of tokens to be sold",
    default: new BN(10).pow(new BN(18)),
  })
  .option("buyAmount", {
    describe: "Amount of tokens to be bought",
    default: new BN(10).pow(new BN(18)),
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
    const buyToken = await ERC20.new("DAI", "DAI");
    const sellToken = await ERC20.new("ETH", "ETH");
    for (const user of [account]) {
      await buyToken.mint(user, new BN(10).pow(new BN(30)));
      await buyToken.approve(easyAuction.address, new BN(10).pow(new BN(30)), {
        from: user,
      });

      await sellToken.mint(user, new BN(10).pow(new BN(30)));
      await sellToken.approve(easyAuction.address, new BN(10).pow(new BN(30)), {
        from: user,
      });
    }

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
