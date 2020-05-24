import { EasyAuctionInstance } from "../types/truffle-typings";
import BN from "bn.js";
import { HttpProvider } from "web3-core";

const ERC20 = artifacts.require("ERC20Mintable.sol");
export const queueStartElement =
  "0xffffffffffffffffffffffffffffffffffffffff000000000000000000000001";
export const queueLastElement =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

export function toAuctionDataResult(
  result: [string, string, BN, string, string, BN, BN]
): OrderResult {
  return {
    sellToken: result[0],
    buyToken: result[1],
    auctionEndDate: result[2],
    sellOrder: result[3],
    clearingPriceOrder: result[4],
    volumeClearingPriceOrder: result[5],
    rewardFactor: result[6],
  };
}
export function encodeOrder(
  userId: number,
  sellAmount: number,
  buyAmount: number
): string {
  return (
    "0x" +
    userId.toString(16).padStart(16, "0") +
    sellAmount.toString(16).padStart(24, "0") +
    buyAmount.toString(16).padStart(24, "0")
  );
}

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
export function toPrice(result: [BN, BN]): Price {
  return {
    priceNumerator: result[0],
    priceDenominator: result[1],
  };
}

export function toReceivedFunds(result: [BN, BN]): ReceivedFunds {
  return {
    sellTokenAmount: result[0],
    buyTokenAmount: result[1],
  };
}

export interface Price {
  priceNumerator: BN;
  priceDenominator: BN;
}

export interface ReceivedFunds {
  sellTokenAmount: BN;
  buyTokenAmount: BN;
}

export interface OrderResult {
  sellToken: string;
  buyToken: string;
  auctionEndDate: BN;
  sellOrder: string;
  clearingPriceOrder: string;
  volumeClearingPriceOrder: BN;
  rewardFactor: BN;
}

export interface Order {
  sellAmount: BN;
  buyAmount: BN;
  owner: string;
}

export async function createTokensAndMintAndApprove(
  easyAuction: EasyAuctionInstance,
  users: string[]
) {
  const buyToken = await ERC20.new("BT", "BT");
  const sellToken = await ERC20.new("BT", "BT");

  for (const user of users) {
    await buyToken.mint(user, new BN(10).pow(new BN(30)));
    await buyToken.approve(easyAuction.address, new BN(10).pow(new BN(30)), {
      from: user,
    });

    await sellToken.mint(user, new BN(10).pow(new BN(30)));
    await sellToken.approve(easyAuction.address, new BN(10).pow(new BN(30)), {
      from: user,
    });
  }
  return { sellToken: sellToken, buyToken: buyToken };
}

// import { EasyAuctionInstance } from "../types/truffle-typings";

// const getAllOrders = async function (
//   easyAuction: EasyAuctionInstance
// ): Promise<Order[]> {
//   const events = (
//     await easyAuction.getPastEvents("NewBuyOrder", {
//       fromBlock: 0,
//       toBlock: "latest",
//     })
//   ).returnValues;
//   return events.map((object) => {
//     userId: object.returnValues.userId;
//     sellAmount: object.returnValues.sellAmount;
//     buyAmount: object.returnValues.buyAmount;
//   });
// };
