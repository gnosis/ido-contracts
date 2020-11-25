import { Contract, BigNumber, Wallet } from "ethers";
import { ethers, waffle } from "hardhat";
export interface Price {
  priceNumerator: BigNumber;
  priceDenominator: BigNumber;
}

export interface ReceivedFunds {
  sellTokenAmount: BigNumber;
  buyTokenAmount: BigNumber;
}

export interface OrderResult {
  sellToken: string;
  buyToken: string;
  auctionEndDate: BigNumber;
  initialAuctionOrder: string;
  clearingPriceOrder: string;
  volumeClearingPriceOrder: BigNumber;
  rewardFactor: BigNumber;
}

export interface Order {
  sellAmount: BigNumber;
  buyAmount: BigNumber;
  userId: BigNumber;
}

export const queueStartElement =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
export const queueLastElement =
  "0xffffffffffffffffffffffffffffffffffffffff000000000000000000000001";

export function toAuctionDataResult(
  result: [string, string, BigNumber, string, string, BigNumber, BigNumber],
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
export function encodeOrder(order: Order): string {
  return (
    "0x" +
    order.userId.toHexString().slice(2).padStart(16, "0") +
    order.buyAmount.toHexString().slice(2).padStart(24, "0") +
    order.sellAmount.toHexString().slice(2).padStart(24, "0")
  );
}

export function decodeOrder(bytes: string): Order {
  return {
    userId: BigNumber.from(parseInt(bytes.substring(2, 18), 16).toString()),
    sellAmount: BigNumber.from(
      parseInt(bytes.substring(19, 42), 16).toString(),
    ),
    buyAmount: BigNumber.from(parseInt(bytes.substring(43, 66), 16).toString()),
  };
}

export function toReceivedFunds(result: [BigNumber, BigNumber]): ReceivedFunds {
  return {
    sellTokenAmount: result[0],
    buyTokenAmount: result[1],
  };
}

export async function getInitialOrder(
  easyAuction: Contract,
  auctionId: BigNumber,
): Promise<Order> {
  const auctionDataStruct = await easyAuction.auctionData(auctionId);
  return decodeOrder(auctionDataStruct[3]);
}

export function hasLowerClearingPrice(order1: Order, order2: Order): number {
  if (
    order1.buyAmount
      .mul(order2.sellAmount)
      .lt(order2.buyAmount.mul(order1.sellAmount))
  )
    return -1;
  if (
    order1.buyAmount
      .mul(order2.sellAmount)
      .eq(order2.buyAmount.mul(order1.sellAmount))
  ) {
    if (order1.userId < order2.userId) return -1;
  }
  return 1;
}

export async function calculateClearingPrice(
  easyAuction: Contract,
  auctionId: BigNumber,
): Promise<Order> {
  const initialOrder = await getInitialOrder(easyAuction, auctionId);
  const sellOrders = await getAllSellOrders(easyAuction, auctionId);
  sellOrders.sort(function (a: Order, b: Order) {
    return hasLowerClearingPrice(a, b);
  });
  return findClearingPrice(sellOrders, initialOrder);
}

export function findClearingPrice(
  sellOrders: Order[],
  initialAuctionOrder: Order,
): Order {
  sellOrders.forEach(function (order, index) {
    if (index > 1) {
      if (!hasLowerClearingPrice(sellOrders[index - 1], order)) {
        throw Error("The orders must be sorted");
      }
    }
  });
  let totalSellVolume = BigNumber.from(0);

  for (const order of sellOrders) {
    totalSellVolume = totalSellVolume.add(order.sellAmount);
    if (
      totalSellVolume
        .mul(order.buyAmount)
        .div(order.sellAmount)
        .gte(initialAuctionOrder.sellAmount)
    ) {
      const coveredBuyAmount = initialAuctionOrder.sellAmount.sub(
        totalSellVolume
          .sub(order.sellAmount)
          .mul(order.buyAmount)
          .div(order.sellAmount),
      );
      const sellAmountClearingOrder = coveredBuyAmount
        .mul(order.sellAmount)
        .div(order.buyAmount);
      if (sellAmountClearingOrder.gt(BigNumber.from(0))) {
        return order;
      } else {
        return {
          userId: BigNumber.from(0),
          buyAmount: initialAuctionOrder.sellAmount,
          sellAmount: totalSellVolume.sub(order.sellAmount),
        };
      }
    }
  }
  // otherwise, clearing price is initialAuctionOrder
  return {
    userId: BigNumber.from(0),
    buyAmount: initialAuctionOrder.sellAmount,
    sellAmount: initialAuctionOrder.buyAmount,
  };
}

export async function getAllSellOrders(
  easyAuction: Contract,
  auctionId: BigNumber,
): Promise<Order[]> {
  const filterSellOrders = easyAuction.filters.NewSellOrder(
    auctionId,
    null,
    null,
    null,
  );
  const logs = await easyAuction.queryFilter(filterSellOrders, 0, "latest");
  const events = logs.map((log: any) => easyAuction.interface.parseLog(log));
  const sellOrders = events.map((x: any) => {
    const order: Order = {
      userId: x.args[1],
      sellAmount: x.args[3],
      buyAmount: x.args[2],
    };
    return order;
  });

  const filterOrderCancellations = easyAuction.filters.CancellationSellOrders;
  const logsForCancellations = await easyAuction.queryFilter(
    filterOrderCancellations(),
    0,
    "latest",
  );
  const eventsForCancellations = logsForCancellations.map((log: any) =>
    easyAuction.interface.parseLog(log),
  );
  const sellOrdersDeletions = eventsForCancellations.map((x: any) => {
    const order: Order = {
      userId: x.args[1],
      sellAmount: x.args[3],
      buyAmount: x.args[2],
    };
    return order;
  });
  for (const orderDeletion of sellOrdersDeletions) {
    sellOrders.splice(sellOrders.indexOf(orderDeletion), 1);
  }
  return sellOrders;
}

export async function createTokensAndMintAndApprove(
  easyAuction: Contract,
  users: Wallet[],
): Promise<{ sellToken: Contract; buyToken: Contract }> {
  const ERC20 = await ethers.getContractFactory("ERC20Mintable");
  const buyToken = await ERC20.deploy("BT", "BT");
  const sellToken = await ERC20.deploy("BT", "BT");

  for (const user of users) {
    await buyToken.mint(user.address, BigNumber.from(10).pow(30));
    await buyToken
      .connect(user)
      .approve(easyAuction.address, BigNumber.from(10).pow(30));

    await sellToken.mint(user.address, BigNumber.from(10).pow(30));
    await sellToken
      .connect(user)
      .approve(easyAuction.address, BigNumber.from(10).pow(30));
  }
  return { sellToken: sellToken, buyToken: buyToken };
}

export function toPrice(result: [BigNumber, BigNumber]): Price {
  return {
    priceNumerator: result[0],
    priceDenominator: result[1],
  };
}

export async function placeOrders(
  easyAuction: Contract,
  sellOrders: Order[],
  auctionId: BigNumber,
): Promise<void> {
  for (const sellOrder of sellOrders) {
    await easyAuction
      .connect(waffle.provider.getWallets()[sellOrder.userId.toNumber()])
      .placeSellOrders(
        auctionId,
        [sellOrder.buyAmount],
        [sellOrder.sellAmount],
        [queueStartElement],
      );
  }
}
