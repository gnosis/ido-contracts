import { EasyAuctionInstance } from "../types/truffle-typings";
import BN from "bn.js";

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
  initialAuctionOrder: string;
  clearingPriceOrder: string;
  volumeClearingPriceOrder: BN;
  rewardFactor: BN;
}

export interface Order {
  sellAmount: BN;
  buyAmount: BN;
  userId: BN;
}

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
    initialAuctionOrder: result[3],
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

export function decodeOrder(bytes: string): Order {
  return {
    userId: new BN(parseInt(bytes.substring(2, 18), 16)),
    sellAmount: new BN(parseInt(bytes.substring(19, 42), 16)),
    buyAmount: new BN(parseInt(bytes.substring(43, 66), 16)),
  };
}

export function toReceivedFunds(result: [BN, BN]): ReceivedFunds {
  return {
    sellTokenAmount: result[0],
    buyTokenAmount: result[1],
  };
}

export async function getInitialOrder(
  easyAuction: EasyAuctionInstance,
  auctionId: number
) {
  const auctionDataStruct = await easyAuction.auctionData(auctionId);
  console.log(auctionDataStruct);
  return decodeOrder(auctionDataStruct[3]);
}

export function hasLowerClearingPrice(order1: Order, order2: Order): number {
  if (
    order1.sellAmount
      .mul(order2.buyAmount)
      .lt(order2.sellAmount.mul(order1.buyAmount))
  )
    return -1;
  return 1;
}

export async function calculateClearingPrice(
  easyAuction: EasyAuctionInstance,
  auctionId: number
): Promise<Price> {
  const initialOrder = await getInitialOrder(easyAuction, auctionId);
  let sellOrders = await getAllSellOrders(easyAuction, auctionId);
  sellOrders.sort(function (a, b) {
    return hasLowerClearingPrice(a, b);
  });
  return findClearingPrice(sellOrders, initialOrder);
}

export function findClearingPrice(
  sellOrders: Order[],
  initialAuctionOrder: Order
): Price {
  sellOrders.forEach(function (order, index) {
    if (index > 1) {
      if (!hasLowerClearingPrice(sellOrders[index - 1], order)) {
        throw Error("The orders must be sorted");
      }
    }
  });

  let price = toPrice([
    initialAuctionOrder.sellAmount,
    initialAuctionOrder.buyAmount,
  ]);
  for (const clearingOrder of sellOrders) {
    let totalSellVolume = initialAuctionOrder.sellAmount;
    for (const order of sellOrders) {
      totalSellVolume = totalSellVolume.sub(
        order.sellAmount
          .mul(clearingOrder.buyAmount)
          .div(clearingOrder.sellAmount)
      );
      if (order === clearingOrder) {
        break;
      }
    }
    if (totalSellVolume.lt(new BN(0))) {
      price = toPrice([clearingOrder.buyAmount, clearingOrder.sellAmount]);
      break;
    }
  }
  return price;
}

export async function getAllSellOrders(
  easyAuction: EasyAuctionInstance,
  auctionId: number
) {
  const sellOrdersNestedArrays = (
    await easyAuction.getPastEvents("NewSellOrders", {
      filter: { auctionId: auctionId },
      fromBlock: 0,
      toBlock: "latest",
    })
  ).map((x) => x.returnValues);
  const sellOrders = sellOrdersNestedArrays.map((x) =>
    x.sellAmount
      .slice()
      .map((k: any, i: number) => [k, x.buyAmount.slice()[i]])
      .map((y: any) => {
        return {
          userId: x.userId,
          sellAmount: y[0],
          buyAmount: y[1],
        };
      })
  );

  const sellOrdersDeletions = (
    await easyAuction.getPastEvents("CancellationSellOrders", {
      filter: { auctionId: auctionId },
      fromBlock: 0,
      toBlock: "latest",
    })
  ).map((x) => x.returnValues);
  for (const order in sellOrdersDeletions) {
    sellOrders.splice(sellOrders.indexOf(order), 1);
  }

  return sellOrders;
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

export function toPrice(result: [BN, BN]): Price {
  return {
    priceNumerator: result[0],
    priceDenominator: result[1],
  };
}
