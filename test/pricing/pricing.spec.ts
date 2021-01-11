import { assert } from "chai";
import { BigNumber, BigNumberish, ethers } from "ethers";

interface Order {
  sell: BigNumberish;
  buy: BigNumberish;
}

interface Auction {
  auctioned: BigNumberish;
  minBid: BigNumberish;
}

function lte(lhs: Order, rhs: Order): boolean {
  return BigNumber.from(lhs.sell)
    .mul(rhs.buy)
    .lte(BigNumber.from(lhs.buy).mul(rhs.sell));
}

function samePrice(lhs: Order, rhs: Order): boolean {
  return BigNumber.from(lhs.sell)
    .mul(rhs.buy)
    .eq(BigNumber.from(lhs.buy).mul(rhs.sell));
}

function isSorted(list: Order[]): boolean {
  const len = list.length;
  if (len == 0) {
    return true;
  }
  let prev = list[0];
  for (const curr of list.slice(1)) {
    if (!lte(curr, prev)) {
      return false;
    }
    prev = curr;
  }
  return true;
}

describe("isSorted", () => {
  it("true for sorted", () => {
    const o1 = {
      sell: 1,
      buy: 1,
    };
    const o2 = {
      sell: 1,
      buy: 2,
    };
    assert(isSorted([o1, o2]));
  });
  it("false for unsorted", () => {
    const o1 = {
      sell: 1,
      buy: 1,
    };
    const o2 = {
      sell: 1,
      buy: 2,
    };
    assert(!isSorted([o2, o1]));
  });
});

// eslint-disable-next-line no-constant-condition
const log = (...args: unknown[]) => (true ? console.log(...args) : null);
const format = (obj: Order | Auction | undefined) =>
  obj === undefined
    ? "undefined"
    : Object.entries(obj)
        .map(
          ([key, entry]: [string, BigNumberish]) =>
            `${key}: ${entry.toString()}`,
        )
        .join("; ");

function auctionPrice(auction: Auction, orders: Order[]): Order {
  // Idea: we can assume that the auction creator is willing to buy everything
  // at the auction price. If there aren't enough orders, this is the one that
  // is matched.
  const perfectlyMatchingOrder = {
    sell: auction.minBid,
    buy: auction.auctioned,
  };
  orders.push(perfectlyMatchingOrder);

  let index = 0;
  let current;
  let sumCurrentBids = BigNumber.from(0);
  let next: Order | undefined = orders[index];
  do {
    log("loop");
    log("  current:", format(current));
    log("  next:", format(next));
    index++;
    current = next;
    sumCurrentBids = sumCurrentBids.add(current.sell);
    next = orders[index];
  } while (
    next != undefined &&
    sumCurrentBids
      .mul(next.buy)
      .lt(BigNumber.from(next.sell).mul(auction.auctioned))
  );

  // at this point, the price of the `next` order cannot be used with the
  // current amount. The actual price must be between the price of the `current`
  // order (inclusive) and the price of the `next` order (excluded).

  // two cases: (1) cannot fully fill the current order or (2) order is fully
  // filled, must find price
  if (
    // check: auctioning at `current` price covers the current order in full
    sumCurrentBids
      .mul(current.buy)
      .lt(BigNumber.from(current.sell).mul(auction.auctioned))
  ) {
    // all orders up to and including `current` are fully matched. the others
    // are not touched.
    log("full match");

    // the price is set to that which makes the previous if's inequality an
    // equality
    return {
      sell: sumCurrentBids,
      buy: auction.auctioned,
    };
  } else {
    log("partial match");
    log("current", format(current));
    // all orders before `current` are fully matched, `current` is partially
    // matched and the others are not touched.
    //
    // must partially match the current order. the total BID amount matched in
    // this auction (`totalBidAuction`) is
    // the one that, when replaced to `sumCurrentBids` in the previous if's
    // inequality, transforms it into an equality.

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _totalBidAuction = BigNumber.from(current.sell)
      .mul(auction.auctioned)
      .div(current.buy);
    // note: _totalBidAuction is defined also for `perfectlyMatchingOrder`, but
    // in this case it would not be used by the contract since the corresponding
    // order is not really in the linked list

    return {
      sell: current.sell,
      buy: current.buy,
    };
  }
}

describe.only("pricing algo", () => {
  describe("finds right price for", () => {
    describe("zero orders", () => {
      it("returns auction price", () => {
        const orders: Order[] = [];
        const auction = {
          auctioned: ethers.utils.parseEther("100"),
          minBid: ethers.utils.parseEther("100"),
        };
        assert(isSorted(orders));
        const expectedPrice = {
          sell: 1,
          buy: 1,
        };
        assert(samePrice(auctionPrice(auction, orders), expectedPrice));
      });
    });
    describe("one order", () => {
      it("not covering full auction", () => {
        const orders = [
          {
            sell: ethers.utils.parseEther("2"),
            buy: ethers.utils.parseEther("1"),
          },
        ];
        const auction = {
          auctioned: ethers.utils.parseEther("100"),
          minBid: ethers.utils.parseEther("100"),
        };
        assert(isSorted(orders));
        const expectedPrice = {
          sell: 1,
          buy: 1,
        };
        assert(samePrice(auctionPrice(auction, orders), expectedPrice));
      });
      it("in full covering auction", () => {
        const orders = [
          {
            sell: ethers.utils.parseEther("200"),
            buy: ethers.utils.parseEther("20"),
          },
        ];
        const auction = {
          auctioned: ethers.utils.parseEther("100"),
          minBid: ethers.utils.parseEther("100"),
        };
        assert(isSorted(orders));
        // if priced at 200/20 it would only sell 10, if priced at 1/1 it would
        // have to sell 100
        const expectedPrice = {
          sell: 2,
          buy: 1,
        };
        assert(samePrice(auctionPrice(auction, orders), expectedPrice));
      });
    });
    describe("two orders", () => {
      it("not covering full auction", () => {
        const orders = [
          {
            sell: ethers.utils.parseEther("3"),
            buy: ethers.utils.parseEther("1"),
          },
          {
            sell: ethers.utils.parseEther("2"),
            buy: ethers.utils.parseEther("1"),
          },
        ];
        const auction = {
          auctioned: ethers.utils.parseEther("100"),
          minBid: ethers.utils.parseEther("100"),
        };
        assert(isSorted(orders));
        const expectedPrice = {
          sell: 1,
          buy: 1,
        };
        assert(samePrice(auctionPrice(auction, orders), expectedPrice));
      });
      it("in full covering auction at some price that is not an order", () => {
        const orders = [
          {
            sell: ethers.utils.parseEther("100"),
            buy: ethers.utils.parseEther("20"),
          },
          {
            sell: ethers.utils.parseEther("100"),
            buy: ethers.utils.parseEther("40"),
          },
        ];
        const auction = {
          auctioned: ethers.utils.parseEther("100"),
          minBid: ethers.utils.parseEther("100"),
        };
        assert(isSorted(orders));
        // if priced at 100/40 it would only sell 80, if priced at 1/1 it would
        // only sell to the first
        const expectedPrice = {
          sell: 2,
          buy: 1,
        };
        assert(samePrice(auctionPrice(auction, orders), expectedPrice));
      });
      it("in full covering auction at exactly the price of the second", () => {
        const orders = [
          {
            sell: ethers.utils.parseEther("100"),
            buy: ethers.utils.parseEther("25"),
          },
          {
            sell: ethers.utils.parseEther("100"),
            buy: ethers.utils.parseEther("50"),
          },
        ];
        const auction = {
          auctioned: ethers.utils.parseEther("100"),
          minBid: ethers.utils.parseEther("100"),
        };
        assert(isSorted(orders));
        const expectedPrice = {
          sell: 2,
          buy: 1,
        };
        assert(samePrice(auctionPrice(auction, orders), expectedPrice));
      });
      it("second partially filled", () => {
        const orders = [
          {
            sell: ethers.utils.parseEther("100"),
            buy: ethers.utils.parseEther("25"),
          },
          {
            sell: ethers.utils.parseEther("100"),
            buy: ethers.utils.parseEther("80"),
          },
        ];
        const auction = {
          auctioned: ethers.utils.parseEther("100"),
          minBid: ethers.utils.parseEther("80"),
        };
        assert(isSorted(orders));
        const expectedPrice = {
          sell: 100,
          buy: 80,
        };
        log("expected price:", format(auctionPrice(auction, orders)));
        assert(samePrice(auctionPrice(auction, orders), expectedPrice));
      });
    });
    describe("three orders", () => {
      it("not covering full auction", () => {
        const orders = [
          {
            sell: ethers.utils.parseEther("4"),
            buy: ethers.utils.parseEther("1"),
          },
          {
            sell: ethers.utils.parseEther("3"),
            buy: ethers.utils.parseEther("1"),
          },
          {
            sell: ethers.utils.parseEther("2"),
            buy: ethers.utils.parseEther("1"),
          },
        ];
        const auction = {
          auctioned: ethers.utils.parseEther("100"),
          minBid: ethers.utils.parseEther("100"),
        };
        assert(isSorted(orders));
        const expectedPrice = {
          sell: 1,
          buy: 1,
        };
        assert(samePrice(auctionPrice(auction, orders), expectedPrice));
      });
      it("in full covering auction at some price between second and third order", () => {
        const orders = [
          {
            sell: ethers.utils.parseEther("100"),
            buy: ethers.utils.parseEther("20"),
          },
          {
            sell: ethers.utils.parseEther("100"),
            buy: ethers.utils.parseEther("40"),
          },
          {
            sell: ethers.utils.parseEther("100"),
            buy: ethers.utils.parseEther("99"),
          },
        ];
        const auction = {
          auctioned: ethers.utils.parseEther("100"),
          minBid: ethers.utils.parseEther("100"),
        };
        assert(isSorted(orders));
        // if priced at 100/40 it would only sell 80, if priced at 1/1 it would
        // only sell to the first
        const expectedPrice = {
          sell: 2,
          buy: 1,
        };
        log("expected price:", format(auctionPrice(auction, orders)));
        assert(samePrice(auctionPrice(auction, orders), expectedPrice));
      });
      it("in full covering auction at some price after third order", () => {
        const orders = [
          {
            sell: ethers.utils.parseEther("50"),
            buy: ethers.utils.parseEther("10"),
          },
          {
            sell: ethers.utils.parseEther("50"),
            buy: ethers.utils.parseEther("15"),
          },
          {
            sell: ethers.utils.parseEther("100"),
            buy: ethers.utils.parseEther("40"),
          },
        ];
        const auction = {
          auctioned: ethers.utils.parseEther("100"),
          minBid: ethers.utils.parseEther("100"),
        };
        assert(isSorted(orders));
        // if priced at 100/40 it would only sell 80, if priced at 1/1 it would
        // only sell to the first
        const expectedPrice = {
          sell: 2,
          buy: 1,
        };
        log("expected price:", format(auctionPrice(auction, orders)));
        assert(samePrice(auctionPrice(auction, orders), expectedPrice));
      });
      it("in full covering auction at exactly the price of the third", () => {
        const orders = [
          {
            sell: ethers.utils.parseEther("50"),
            buy: ethers.utils.parseEther("12"),
          },
          {
            sell: ethers.utils.parseEther("50"),
            buy: ethers.utils.parseEther("12"),
          },
          {
            sell: ethers.utils.parseEther("100"),
            buy: ethers.utils.parseEther("50"),
          },
        ];
        const auction = {
          auctioned: ethers.utils.parseEther("100"),
          minBid: ethers.utils.parseEther("100"),
        };
        assert(isSorted(orders));
        const expectedPrice = {
          sell: 2,
          buy: 1,
        };
        assert(samePrice(auctionPrice(auction, orders), expectedPrice));
      });
      it("third partially filled", () => {
        const orders = [
          {
            sell: ethers.utils.parseEther("50"),
            buy: ethers.utils.parseEther("12"),
          },
          {
            sell: ethers.utils.parseEther("50"),
            buy: ethers.utils.parseEther("14"),
          },
          {
            sell: ethers.utils.parseEther("100"),
            buy: ethers.utils.parseEther("80"),
          },
        ];
        const auction = {
          auctioned: ethers.utils.parseEther("100"),
          minBid: ethers.utils.parseEther("80"),
        };
        assert(isSorted(orders));
        const expectedPrice = {
          sell: 100,
          buy: 80,
        };
        assert(samePrice(auctionPrice(auction, orders), expectedPrice));
      });
    });
  });
});
