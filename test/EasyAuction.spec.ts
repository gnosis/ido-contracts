const EasyAuction = artifacts.require("EasyAuction.sol");
import BN from "bn.js";
import truffleAssert from "truffle-assertions";

import { EasyAuctionInstance } from "../types/truffle-typings";

const {
  toPrice,
  toAuctionDataResult,
  encodeOrder,
  queueStartElement,
  sendTxAndGetReturnValue,
  createTokensAndMintAndApprove,
  closeAuction,
} = require("./utilities");

contract("EasyAuction", async (accounts) => {
  const [user_1, user_2, user_3] = accounts;

  let easyAuction: EasyAuctionInstance;
  beforeEach(async () => {
    easyAuction = await EasyAuction.new();
  });
  describe("initiate Auction", async () => {
    it("initiateAuction stores the parameters correctly", async () => {
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1]);
      const auctionId = await sendTxAndGetReturnValue(
        easyAuction.initiateAuction,
        sellToken.address,
        buyToken.address,
        60 * 60,
        new BN(10).pow(new BN(18)),
        new BN(10).pow(new BN(18))
      );
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId)
      );
      assert.equal(auctionData.sellToken, sellToken.address);
      assert.equal(auctionData.buyToken, buyToken.address);
      assert.equal(
        auctionData.sellOrder,
        encodeOrder(0, new BN(10).pow(new BN(18)), new BN(10).pow(new BN(18)))
      );
      //Todo assert.equal(auctionData.auctionEndDate);
      assert.equal(auctionData.clearingPriceOrder, encodeOrder(0, 0, 0));
      assert.equal(auctionData.volumeClearingPriceOrder.toNumber(), 0);

      assert.equal(
        (await sellToken.balanceOf.call(easyAuction.address)).toString(),
        new BN(10).pow(new BN(18)).toString()
      );
    });
  });

  describe("getUserId", async () => {
    it("creates new userIds", async () => {
      const userId_1 = await sendTxAndGetReturnValue(
        easyAuction.getUserId,
        user_1,
        {
          from: user_1,
        }
      );
      const userId_2 = await sendTxAndGetReturnValue(
        easyAuction.getUserId,
        user_2,
        {
          from: user_2,
        }
      );
      const userId_3 = await sendTxAndGetReturnValue(
        easyAuction.getUserId,
        user_1,
        {
          from: user_3,
        }
      );
      assert.equal(userId_1, 0);
      assert.equal(userId_2, 1);
      assert.equal(userId_3, 0);
    });
  });
  describe("placeOrders", async () => {
    it("one can not place orders, if auction is not yet initiated", async () => {
      await truffleAssert.reverts(
        easyAuction.placeBuyOrders(
          0,
          [new BN(10).pow(new BN(18))],
          [new BN(10).pow(new BN(18)).add(new BN(1))],
          [queueStartElement]
        ),
        "Auction no longer in order placement phase"
      );
    });
    it("one can not place orders, if auction is over", async () => {
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1]);
      const auctionId = await sendTxAndGetReturnValue(
        easyAuction.initiateAuction,
        sellToken.address,
        buyToken.address,
        60 * 60,
        new BN(10).pow(new BN(18)),
        new BN(10).pow(new BN(18))
      );
      await closeAuction(easyAuction, auctionId);
      await truffleAssert.reverts(
        easyAuction.placeBuyOrders(
          0,
          [new BN(10).pow(new BN(18))],
          [new BN(10).pow(new BN(18)).add(new BN(1))],
          [queueStartElement]
        ),
        "Auction no longer in order placement phase"
      );
    });
    it("one can not place orders, with a worser or same rate", async () => {
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1]);
      const auctionId = await sendTxAndGetReturnValue(
        easyAuction.initiateAuction,
        sellToken.address,
        buyToken.address,
        60 * 60,
        new BN(10).pow(new BN(18)),
        new BN(10).pow(new BN(18))
      );
      await truffleAssert.reverts(
        easyAuction.placeBuyOrders(
          auctionId,
          [new BN(10).pow(new BN(18)).sub(new BN(1))],
          [new BN(10).pow(new BN(18))],
          [queueStartElement]
        ),
        "limit price not better than mimimal offer"
      );
      await truffleAssert.reverts(
        easyAuction.placeBuyOrders(
          auctionId,
          [new BN(10).pow(new BN(18))],
          [new BN(10).pow(new BN(18))],
          [queueStartElement]
        ),
        "limit price not better than mimimal offer"
      );
    });
    it("places a new order and checks that tokens were transferred", async () => {
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1]);
      const auctionId = await sendTxAndGetReturnValue(
        easyAuction.initiateAuction,
        sellToken.address,
        buyToken.address,
        60 * 60,
        new BN(10).pow(new BN(18)),
        new BN(10).pow(new BN(18))
      );
      const balanceBeforeOrderPlacement = await buyToken.balanceOf(user_1);
      const sellAmount = new BN(10).pow(new BN(18)).sub(new BN(1));
      const buyAmount = new BN(10).pow(new BN(18));
      await easyAuction.placeBuyOrders(
        auctionId,
        [buyAmount, buyAmount],
        [sellAmount, sellAmount.sub(new BN(1))],
        [queueStartElement, queueStartElement]
      );
      const transferredBuyTokenAmount = buyAmount
        .mul(buyAmount)
        .div(sellAmount)
        .add(buyAmount.mul(buyAmount).div(sellAmount.sub(new BN(1))));
      assert.equal(
        (await buyToken.balanceOf(easyAuction.address)).toString(),
        transferredBuyTokenAmount.toString()
      );
      assert.equal(
        (await buyToken.balanceOf(user_1)).toString(),
        balanceBeforeOrderPlacement.sub(transferredBuyTokenAmount).toString()
      );
    });
    it("throws, if DDOS attack with small order amounts is started", async () => {
      const sellOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const buyOrders = [
        {
          sellAmount: new BN(10).pow(new BN(18)).div(new BN(10000)),
          buyAmount: new BN(10).pow(new BN(18)).div(new BN(5000)),
          owner: user_1,
        },
      ];

      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1]);

      const auctionId = await sendTxAndGetReturnValue(
        easyAuction.initiateAuction,
        sellToken.address,
        buyToken.address,
        60 * 60,
        sellOrder.sellAmount,
        sellOrder.buyAmount
      );
      await truffleAssert.reverts(
        easyAuction.placeBuyOrders(
          auctionId,
          buyOrders.map((buyOrder) => buyOrder.buyAmount),
          buyOrders.map((buyOrder) => buyOrder.sellAmount),
          Array(buyOrders.length).fill(queueStartElement)
        ),
        "buyOrder too small"
      );
    });
    it("fails, if transfers are failing", async () => {
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1]);
      const auctionId = await sendTxAndGetReturnValue(
        easyAuction.initiateAuction,
        sellToken.address,
        buyToken.address,
        60 * 60,
        new BN(10).pow(new BN(18)),
        new BN(10).pow(new BN(18))
      );
      const balanceBeforeOrderPlacement = await buyToken.balanceOf(user_1);
      const sellAmount = new BN(10).pow(new BN(18)).sub(new BN(1));
      const buyAmount = new BN(10).pow(new BN(18));
      await buyToken.approve(easyAuction.address, new BN(0));

      await truffleAssert.reverts(
        easyAuction.placeBuyOrders(
          auctionId,
          [buyAmount, buyAmount],
          [sellAmount, sellAmount.sub(new BN(1))],
          [queueStartElement, queueStartElement]
        ),
        "ERC20: transfer amount exceeds allowance"
      );
    });
  });

  describe("calculatePrice", async () => {
    it("calculates the auction price in case of clearing order == sellOrder", async () => {
      const sellOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const buyOrders = [
        {
          sellAmount: new BN(10).pow(new BN(18)).div(new BN(20)),
          buyAmount: new BN(10).pow(new BN(18)).div(new BN(10)),
          owner: user_1,
        },
      ];

      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1]);

      const auctionId = await sendTxAndGetReturnValue(
        easyAuction.initiateAuction,
        sellToken.address,
        buyToken.address,
        60 * 60,
        sellOrder.sellAmount,
        sellOrder.buyAmount
      );
      await easyAuction.placeBuyOrders(
        auctionId,
        buyOrders.map((buyOrder) => buyOrder.buyAmount),
        buyOrders.map((buyOrder) => buyOrder.sellAmount),
        Array(buyOrders.length).fill(queueStartElement)
      );
      await closeAuction(easyAuction, auctionId);
      const price = toPrice(
        await sendTxAndGetReturnValue(easyAuction.calculatePrice, auctionId)
      );
      assert.equal(
        price.priceNumerator.toString(),
        price.priceNumerator.toString()
      );
      assert.equal(
        price.priceDenominator.toString(),
        sellOrder.sellAmount.toString()
      );
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId)
      );
      assert.equal(
        auctionData.volumeClearingPriceOrder.toString(),
        buyOrders[0].buyAmount.toString()
      );
    });
    it("calculates the auction price in case of no buyOrders", async () => {
      const sellOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1]);

      const auctionId = await sendTxAndGetReturnValue(
        easyAuction.initiateAuction,
        sellToken.address,
        buyToken.address,
        60 * 60,
        sellOrder.sellAmount,
        sellOrder.buyAmount
      );
      await closeAuction(easyAuction, auctionId);
      const price = toPrice(
        await sendTxAndGetReturnValue(easyAuction.calculatePrice, auctionId)
      );
      assert.equal(
        price.priceNumerator.toString(),
        sellOrder.buyAmount.toString()
      );
      assert.equal(
        price.priceDenominator.toString(),
        sellOrder.sellAmount.toString()
      );
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId)
      );
      assert.equal(auctionData.volumeClearingPriceOrder.toString(), "0");
    });
    it("calculates the auction price in case of one buyOrders eating sellOrder completely", async () => {
      const sellOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const buyOrders = [
        {
          sellAmount: new BN(10).pow(new BN(18)).mul(new BN(10)),
          buyAmount: new BN(10).pow(new BN(18)).mul(new BN(20)),
          owner: user_1,
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1]);

      const auctionId = await sendTxAndGetReturnValue(
        easyAuction.initiateAuction,
        sellToken.address,
        buyToken.address,
        60 * 60,
        sellOrder.sellAmount,
        sellOrder.buyAmount
      );
      await easyAuction.placeBuyOrders(
        auctionId,
        buyOrders.map((buyOrder) => buyOrder.buyAmount),
        buyOrders.map((buyOrder) => buyOrder.sellAmount),
        Array(buyOrders.length).fill(queueStartElement)
      );
      await closeAuction(easyAuction, auctionId);
      const price = toPrice(
        await sendTxAndGetReturnValue(easyAuction.calculatePrice, auctionId)
      );
      assert.equal(
        price.priceNumerator.toString(),
        buyOrders[0].buyAmount.toString()
      );
      assert.equal(
        price.priceDenominator.toString(),
        buyOrders[0].sellAmount.toString()
      );
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId)
      );
      assert.equal(
        auctionData.volumeClearingPriceOrder.toString(),
        sellOrder.sellAmount.toString()
      );
    });
    it("calculates the auction price in case of 2 of 3 buyOrders eating sellOrder completely", async () => {
      const sellOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const buyOrders = [
        {
          sellAmount: new BN(10).pow(new BN(18)).div(new BN(4)),
          buyAmount: new BN(10).pow(new BN(18)).div(new BN(2)),
          owner: user_1,
        },
        {
          sellAmount: new BN(10).pow(new BN(18)).div(new BN(8)),
          buyAmount: new BN(10).pow(new BN(18)).div(new BN(2)),
          owner: user_1,
        },
        {
          sellAmount: new BN(10).pow(new BN(18)).div(new BN(16)),
          buyAmount: new BN(10).pow(new BN(18)).div(new BN(2)),
          owner: user_1,
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1]);

      const auctionId = await sendTxAndGetReturnValue(
        easyAuction.initiateAuction,
        sellToken.address,
        buyToken.address,
        60 * 60,
        sellOrder.sellAmount,
        sellOrder.buyAmount
      );
      await easyAuction.placeBuyOrders(
        auctionId,
        buyOrders.map((buyOrder) => buyOrder.buyAmount),
        buyOrders.map((buyOrder) => buyOrder.sellAmount),
        Array(buyOrders.length).fill(queueStartElement)
      );
      await closeAuction(easyAuction, auctionId);
      const price = toPrice(
        await sendTxAndGetReturnValue(easyAuction.calculatePrice, auctionId)
      );
      assert.equal(
        price.priceNumerator.toString(),
        buyOrders[1].buyAmount.toString()
      );
      assert.equal(
        price.priceDenominator.toString(),
        buyOrders[1].sellAmount.toString()
      );
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId)
      );
      assert.equal(
        auctionData.volumeClearingPriceOrder.toString(),
        buyOrders[1].buyAmount.toString()
      );
    });
    it("simple version of e2e gas test", async () => {
      const sellOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const buyOrders = [
        {
          sellAmount: new BN(10).pow(new BN(18)).div(new BN(8)),
          buyAmount: new BN(10).pow(new BN(18)).div(new BN(4)),
          owner: user_1,
        },
        {
          sellAmount: new BN(10).pow(new BN(18)).div(new BN(12)),
          buyAmount: new BN(10).pow(new BN(18)).div(new BN(4)),
          owner: user_1,
        },
        {
          sellAmount: new BN(10).pow(new BN(18)).div(new BN(16)),
          buyAmount: new BN(10).pow(new BN(18)).div(new BN(4)),
          owner: user_1,
        },
        {
          sellAmount: new BN(10).pow(new BN(18)).div(new BN(20)),
          buyAmount: new BN(10).pow(new BN(18)).div(new BN(4)),
          owner: user_1,
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1]);

      const auctionId = await sendTxAndGetReturnValue(
        easyAuction.initiateAuction,
        sellToken.address,
        buyToken.address,
        60 * 60,
        sellOrder.sellAmount,
        sellOrder.buyAmount
      );
      await easyAuction.placeBuyOrders(
        auctionId,
        buyOrders.map((buyOrder) => buyOrder.buyAmount),
        buyOrders.map((buyOrder) => buyOrder.sellAmount),
        Array(buyOrders.length).fill(queueStartElement)
      );
      await closeAuction(easyAuction, auctionId);
      const price = toPrice(
        await sendTxAndGetReturnValue(easyAuction.calculatePrice, auctionId)
      );
      assert.equal(
        price.priceNumerator.toString(),
        buyOrders[0].buyAmount.toString()
      );
      assert.equal(
        price.priceDenominator.toString(),
        buyOrders[0].sellAmount.toString()
      );
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId)
      );
      assert.equal(
        auctionData.volumeClearingPriceOrder.toString(),
        buyOrders[1].buyAmount.toString()
      );
    });
  });
  describe("claimFromSellOrder", async () => {
    it("checks that claiming only works after the finishing of the auction", async () => {
      const sellOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const buyOrders = [
        {
          sellAmount: new BN(10).pow(new BN(18)).sub(new BN(1)),
          buyAmount: new BN(10).pow(new BN(18)),
          owner: user_1,
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1]);

      const auctionId = await sendTxAndGetReturnValue(
        easyAuction.initiateAuction,
        sellToken.address,
        buyToken.address,
        60 * 60,
        sellOrder.sellAmount,
        sellOrder.buyAmount
      );
      await easyAuction.placeBuyOrders(
        auctionId,
        buyOrders.map((buyOrder) => buyOrder.buyAmount),
        buyOrders.map((buyOrder) => buyOrder.sellAmount),
        Array(buyOrders.length).fill(queueStartElement)
      );
      await truffleAssert.reverts(
        easyAuction.claimFromSellOrder(auctionId),
        "Auction not yet finished"
      );
      await closeAuction(easyAuction, auctionId);
      await truffleAssert.reverts(
        easyAuction.claimFromSellOrder(auctionId),
        "Auction not yet finished"
      );
    });
    it("checks the claimed amounts for a fully matched sellOrder and buyOrder", async () => {
      const sellOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const buyOrders = [
        {
          sellAmount: new BN(10).pow(new BN(18)).sub(new BN(1)),
          buyAmount: new BN(10).pow(new BN(18)),
          owner: user_1,
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1]);

      const auctionId = await sendTxAndGetReturnValue(
        easyAuction.initiateAuction,
        sellToken.address,
        buyToken.address,
        60 * 60,
        sellOrder.sellAmount,
        sellOrder.buyAmount
      );
      await easyAuction.placeBuyOrders(
        auctionId,
        buyOrders.map((buyOrder) => buyOrder.buyAmount),
        buyOrders.map((buyOrder) => buyOrder.sellAmount),
        Array(buyOrders.length).fill(queueStartElement)
      );
      await closeAuction(easyAuction, auctionId);
      const price = toPrice(
        await sendTxAndGetReturnValue(easyAuction.calculatePrice, auctionId)
      );
      const receivedAmounts = await easyAuction.claimFromSellOrder.call(
        auctionId
      );
      assert.equal(receivedAmounts[0].toString(), "0");
      assert.equal(
        receivedAmounts[1].toString(),
        sellOrder.sellAmount
          .mul(buyOrders[0].buyAmount)
          .div(buyOrders[0].sellAmount)
          .toString()
      );
    });
  });
  describe("claimFromBuyOrder", async () => {
    it("checks that claiming only works after the finishing of the auction", async () => {
      const sellOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const buyOrders = [
        {
          sellAmount: new BN(10).pow(new BN(18)).sub(new BN(1)),
          buyAmount: new BN(10).pow(new BN(18)),
          owner: user_1,
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1]);

      const auctionId = await sendTxAndGetReturnValue(
        easyAuction.initiateAuction,
        sellToken.address,
        buyToken.address,
        60 * 60,
        sellOrder.sellAmount,
        sellOrder.buyAmount
      );
      await easyAuction.placeBuyOrders(
        auctionId,
        buyOrders.map((buyOrder) => buyOrder.buyAmount),
        buyOrders.map((buyOrder) => buyOrder.sellAmount),
        Array(buyOrders.length).fill(queueStartElement)
      );
      await truffleAssert.reverts(
        easyAuction.claimFromBuyOrder(
          auctionId,
          buyOrders.map((order) =>
            encodeOrder(order.buyAmount, order.sellAmount, 0)
          )
        ),
        "Auction not yet finished"
      );
      await closeAuction(easyAuction, auctionId);
      await truffleAssert.reverts(
        easyAuction.claimFromBuyOrder(
          auctionId,
          buyOrders.map((order) =>
            encodeOrder(order.buyAmount, order.sellAmount, 0)
          )
        ),
        "Auction not yet finished"
      );
    });
  });
});
