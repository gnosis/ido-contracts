import { EasyAuctionInstance } from "../types/truffle-typings";
import BN from "bn.js";
import { HttpProvider } from "web3-core";

const jsonrpc = "2.0";
const id = 0;
const send = function <T>(
  method: string,
  params: T[],
  web3Provider: Web3
): Promise<{}> {
  return new Promise(function (resolve, reject) {
    (web3Provider.currentProvider as HttpProvider).send(
      { id, jsonrpc, method, params },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
  });
};

export async function waitForNSeconds(
  seconds: number,
  web3Provider = web3 as Web3
): Promise<void> {
  await send("evm_increaseTime", [seconds], web3Provider);
  await send("evm_mine", [], web3Provider);
}

export async function closeAuction(
  instance: EasyAuctionInstance,
  auctionId: number,
  web3Provider = web3 as Web3
): Promise<void> {
  const time_remaining = (
    await instance.getSecondsRemainingInBatch(auctionId)
  ).toNumber();
  await waitForNSeconds(time_remaining + 1, web3Provider);
}

export async function sendTxAndGetReturnValue<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  method: {
    sendTransaction: (...args: any[]) => Promise<string>;
    call: (...args: any[]) => Promise<T>;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
): Promise<T> {
  const result = await method.call(...args);
  await method.sendTransaction(...args);
  return result;
}
