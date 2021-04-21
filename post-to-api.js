const fs = require("fs");

const axios = require("axios");

const apiEndpoint = `https://ido-api-mainnet.gnosis.io/api/v1/provide_signature`;
// Alternatives could be:
// `https://ido-v1-api-rinkeby.dev.gnosisdev.com/api/v1/provide_signature`
// `http://localhost:8080/api/v1/provide_signature`
const startingPackage = 2407;
const maxPackageNumber = 2460;

async function postToAPI() {
  for (let i = startingPackage; i < maxPackageNumber; i++) {
    // Read signatures from provided file
    console.log(`posting signature package-${i}`);
    const rawdata = fs.readFileSync(
      `./signatures/signatures-${i}.json`,
      "utf8",
    );
    const signatures = JSON.parse(rawdata);

    // Posting to the Dev-API endpoint
    const apiResult = await axios
      .post(apiEndpoint, signatures, {
        headers: {
          "Content-Type": "application/json",
        },
      })
      .catch(function (error) {
        console.log(error);
        i--;
      });
    console.log("Api returned: ", apiResult.data);
  }
}

postToAPI();
