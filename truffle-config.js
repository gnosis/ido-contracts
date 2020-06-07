const truffleConfig = require("@gnosis.pm/util-contracts/src/util/truffleConfig");
require("ts-node/register");
const path = require("path");
const argv = require("yargs")
  .option("gas", {
    alias: "g",
    type: "boolean",
    describe: "Enable gas reporter",
  })
  .option("grep", {
    type: "string",
    describe: "Mocha test filter pattern",
  })
  .help(false)
  .version(false).argv;

const DEFAULT_GAS_PRICE_GWEI = 25;
const DEFAULT_GAS_LIMIT = 8e6;
const DEFAULT_MNEMONIC =
  "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";

// Load env vars
require("dotenv").config();

// Get the mnemonic
const privateKey = process.env.PK;
let mnemonic = process.env.MNEMONIC;
if (!privateKey && !mnemonic) {
  mnemonic = DEFAULT_MNEMONIC;
}

// Solc
const solcUseDocker = process.env.SOLC_USE_DOCKER === "true" || false;
const solcVersion = "0.6.8";

// Gas price
const gasPriceGWei = process.env.GAS_PRICE_GWEI || DEFAULT_GAS_PRICE_GWEI;

// Gas limit
const gas = process.env.GAS_LIMIT || DEFAULT_GAS_LIMIT;

// Allow to add an additional network (useful for docker-compose setups)
//  i.e. NETWORK='{ "name": "docker", "networkId": "99999", "url": "http://rpc:8545", "gas": "6700000", "gasPrice": "25000000000"  }'
const additionalNetwork = process.env.NETWORK
  ? JSON.parse(process.env.NETWORK)
  : null;

const urlDevelopment = process.env.GANACHE_HOST || "localhost";

// network key
const infuraKey = process.env.INFURA_KEY || "9408f47dedf04716a03ef994182cf150";

const { gas: gasLog, grep } = argv;

module.exports = {
  ...truffleConfig({
    mnemonic,
    privateKey,
    urlRinkeby: "https://rinkeby.infura.io/v3/".concat(infuraKey),
    urlKovan: "https://kovan.infura.io/v3/".concat(infuraKey),
    urlMainnet: "https://mainnet.infura.io/v3/".concat(infuraKey),
    urlDevelopment,
    gasPriceGWei,
    gas,
    additionalNetwork,
    optimizedEnabled: true,
    solcUseDocker,
    solcVersion,
  }),
  // https://github.com/mochajs/mocha/wiki/Using-mocha-programmatically#set-options
  mocha: {
    reporter: gasLog ? "eth-gas-reporter" : "spec",
    reporterOptions: {
      currency: "USD",
      gasPrice: 20,
      showTimeSpent: true,
    },
    grep,
  },
  contracts_build_directory: path.join(__dirname, "client/src/contracts"),
  test_file_extension_regexp: /.*\.js$/,
  plugins: ["truffle-plugin-verify", "solidity-coverage"],
  api_keys: {
    etherscan: process.env.MY_ETHERSCAN_API_KEY,
  },
};
