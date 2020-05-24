const EasyAuction = artifacts.require("./EasyAuction.sol");

module.exports = function (deployer) {
  deployer.deploy(EasyAuction);
};
