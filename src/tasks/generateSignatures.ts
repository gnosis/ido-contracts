import fs from "fs";

import "hardhat-deploy";
import "@nomiclabs/hardhat-ethers";
import axios from "axios";
import { task, types } from "hardhat/config";

import { domain, getAllowListOffChainManagedContract } from "./utils";

const generateSignatures: () => void = () => {
  task(
    "generateSignatures",
    "Generates the signatures for the allowListManager",
  )
    .addParam("auctionId", "Id of the auction ")
    .addParam(
      "fileWithAddress",
      "File with comma separated addresses that should be allow-listed",
    )
    .addOptionalParam(
      "postToApi",
      "File with comma separated addresses that should be allow-listed",
      "false",
      types.boolean,
    )
    .setAction(async (taskArgs, hardhatRuntime) => {
      const [caller] = await hardhatRuntime.ethers.getSigners();
      console.log(
        "Using the account: ",
        caller.address,
        " to generate signatures",
      );
      const allowListContract = await getAllowListOffChainManagedContract(
        hardhatRuntime,
      );
      const { chainId } = await hardhatRuntime.ethers.provider.getNetwork();

      const contractDomain = domain(chainId, allowListContract.address);

      const file = fs.readFileSync(taskArgs.fileWithAddress, "utf8");
      const addresses = file.split(",").map((address) => address.trim());
      const signatures = [];
      for (const address of addresses) {
        const auctioneerMessage = hardhatRuntime.ethers.utils.keccak256(
          hardhatRuntime.ethers.utils.defaultAbiCoder.encode(
            ["bytes32", "address", "uint256"],
            [
              hardhatRuntime.ethers.utils._TypedDataEncoder.hashDomain(
                contractDomain,
              ),
              address,
              taskArgs.auctionId,
            ],
          ),
        );
        const auctioneerSignature = await caller.signMessage(
          hardhatRuntime.ethers.utils.arrayify(auctioneerMessage),
        );
        const sig = hardhatRuntime.ethers.utils.splitSignature(
          auctioneerSignature,
        );
        const auctioneerSignatureEncoded = hardhatRuntime.ethers.utils.defaultAbiCoder.encode(
          ["uint8", "bytes32", "bytes32"],
          [sig.v, sig.r, sig.s],
        );
        signatures.push({
          user: address,
          signature: auctioneerSignatureEncoded,
        });
      }
      const json = JSON.stringify({
        auctionId: Number(taskArgs.auctionId),
        chainId: chainId,
        allowListContract: allowListContract.address,
        signatures: signatures,
      });
      fs.writeFileSync("signatures.json", json, "utf8");
      if (taskArgs.postToApi) {
        const networkName = (await hardhatRuntime.ethers.provider.getNetwork())
          .name;
        const apiResult = await axios.post(
          `https://ido-v1-api-${networkName}.dev.gnosisdev.com/api/v1/provide_signature`,
          json,
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
        console.log("Api returned: ", apiResult);
      }
    });
};
export { generateSignatures };
