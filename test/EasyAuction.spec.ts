const EasyAuction = artifacts.require("EasyAuction.sol");
import BN from "bn.js";
import truffleAssert from "truffle-assertions";

const { sendTxAndGetReturnValue, closeAuction } = require("./utilities");

const {
  toPrice,
  toAuctionDataResult,
  toReceivedFunds,
  encodeOrder,
  queueStartElement,
  createTokensAndMintAndApprove,
  getAllSellOrders,
  getInitialOrder,
  calculateClearingPrice,
} = require("../src/priceCalculation");

contract("EasyAuction", async (accounts) => {
  const [user_1, user_2, user_3] = accounts;

  let easyAuction = await EasyAuction.new();
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
        auctionData.initialAuctionOrder,
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
        easyAuction.placeSellOrders(
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
        easyAuction.placeSellOrders(
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
        easyAuction.placeSellOrders(
          auctionId,
          [new BN(10).pow(new BN(18)).sub(new BN(1))],
          [new BN(10).pow(new BN(18))],
          [queueStartElement]
        ),
        "limit price not better than mimimal offer"
      );
      await truffleAssert.reverts(
        easyAuction.placeSellOrders(
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
      await easyAuction.placeSellOrders(
        auctionId,
        [buyAmount, buyAmount],
        [sellAmount, sellAmount.sub(new BN(1))],
        [queueStartElement, queueStartElement]
      );
      const transferredBuyTokenAmount = sellAmount.add(
        sellAmount.sub(new BN(1))
      );
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
      const initialAuctionOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const sellOrders = [
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
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount
      );
      await truffleAssert.reverts(
        easyAuction.placeSellOrders(
          auctionId,
          sellOrders.map((buyOrder) => buyOrder.buyAmount),
          sellOrders.map((buyOrder) => buyOrder.sellAmount),
          Array(sellOrders.length).fill(queueStartElement)
        ),
        "order too small"
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
        easyAuction.placeSellOrders(
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
    it.only("calculates the auction price in case of clearing order == initialAuctionOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const sellOrders = [
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
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount
      );
      await easyAuction.placeSellOrders(
        auctionId,
        sellOrders.map((buyOrder) => buyOrder.buyAmount),
        sellOrders.map((buyOrder) => buyOrder.sellAmount),
        Array(sellOrders.length).fill(queueStartElement)
      );
      await closeAuction(easyAuction, auctionId);
      const orders = await getAllSellOrders(easyAuction, auctionId.toNumber());
      const initOrder = await getInitialOrder(
        easyAuction,
        auctionId.toNumber()
      );
      console.log(initOrder);

      const price = await calculateClearingPrice(easyAuction, auctionId);
      assert.equal(
        price.priceNumerator.toString(),
        initialAuctionOrder.buyAmount.toString()
      );
      assert.equal(
        price.priceDenominator.toString(),
        initialAuctionOrder.sellAmount.toString()
      );
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId)
      );
      assert.equal(
        auctionData.volumeClearingPriceOrder.toString(),
        sellOrders[0].buyAmount.toString()
      );
    });
    it("calculates the auction price in case of no sellOrders", async () => {
      const initialAuctionOrder = {
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
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount
      );
      await closeAuction(easyAuction, auctionId);
      const price = toPrice(
        await sendTxAndGetReturnValue(easyAuction.calculatePrice, auctionId)
      );
      assert.equal(
        price.priceNumerator.toString(),
        initialAuctionOrder.buyAmount.toString()
      );
      assert.equal(
        price.priceDenominator.toString(),
        initialAuctionOrder.sellAmount.toString()
      );
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId)
      );
      assert.equal(auctionData.volumeClearingPriceOrder.toString(), "0");
    });
    it("calculates the auction price in case of one sellOrders eating initialAuctionOrder completely", async () => {
      const initialAuctionOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const sellOrders = [
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
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount
      );
      await easyAuction.placeSellOrders(
        auctionId,
        sellOrders.map((buyOrder) => buyOrder.buyAmount),
        sellOrders.map((buyOrder) => buyOrder.sellAmount),
        Array(sellOrders.length).fill(queueStartElement)
      );
      await closeAuction(easyAuction, auctionId);
      const price = toPrice(
        await sendTxAndGetReturnValue(easyAuction.calculatePrice, auctionId)
      );
      assert.equal(
        price.priceNumerator.toString(),
        sellOrders[0].buyAmount.toString()
      );
      assert.equal(
        price.priceDenominator.toString(),
        sellOrders[0].sellAmount.toString()
      );
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId)
      );
      assert.equal(
        auctionData.volumeClearingPriceOrder.toString(),
        initialAuctionOrder.sellAmount.toString()
      );
    });
    it("calculates the auction price in case of 2 of 3 sellOrders eating initialAuctionOrder completely", async () => {
      const initialAuctionOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const sellOrders = [
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
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount
      );
      await easyAuction.placeSellOrders(
        auctionId,
        sellOrders.map((buyOrder) => buyOrder.buyAmount),
        sellOrders.map((buyOrder) => buyOrder.sellAmount),
        Array(sellOrders.length).fill(queueStartElement)
      );
      await closeAuction(easyAuction, auctionId);
      const price = toPrice(
        await sendTxAndGetReturnValue(easyAuction.calculatePrice, auctionId)
      );
      assert.equal(
        price.priceNumerator.toString(),
        sellOrders[1].buyAmount.toString()
      );
      assert.equal(
        price.priceDenominator.toString(),
        sellOrders[1].sellAmount.toString()
      );
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId)
      );
      assert.equal(
        auctionData.volumeClearingPriceOrder.toString(),
        sellOrders[1].buyAmount.toString()
      );
    });
    it("simple version of e2e gas test", async () => {
      const initialAuctionOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const sellOrders = [
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
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount
      );
      await easyAuction.placeSellOrders(
        auctionId,
        sellOrders.map((buyOrder) => buyOrder.buyAmount),
        sellOrders.map((buyOrder) => buyOrder.sellAmount),
        Array(sellOrders.length).fill(queueStartElement)
      );
      await closeAuction(easyAuction, auctionId);
      const price = toPrice(
        await sendTxAndGetReturnValue(easyAuction.calculatePrice, auctionId)
      );
      assert.equal(
        price.priceNumerator.toString(),
        sellOrders[0].buyAmount.toString()
      );
      assert.equal(
        price.priceDenominator.toString(),
        sellOrders[0].sellAmount.toString()
      );
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId)
      );
      assert.equal(
        auctionData.volumeClearingPriceOrder.toString(),
        sellOrders[1].buyAmount.toString()
      );
    });
  });
  describe("claimFromSellOrder", async () => {
    it("checks that claiming only works after the finishing of the auction", async () => {
      const initialAuctionOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const sellOrders = [
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
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount
      );
      await easyAuction.placeSellOrders(
        auctionId,
        sellOrders.map((buyOrder) => buyOrder.buyAmount),
        sellOrders.map((buyOrder) => buyOrder.sellAmount),
        Array(sellOrders.length).fill(queueStartElement)
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
    it("checks the claimed amounts for a fully matched initialAuctionOrder and buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const sellOrders = [
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
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount
      );
      await easyAuction.placeSellOrders(
        auctionId,
        sellOrders.map((buyOrder) => buyOrder.buyAmount),
        sellOrders.map((buyOrder) => buyOrder.sellAmount),
        Array(sellOrders.length).fill(queueStartElement)
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
        initialAuctionOrder.sellAmount
          .mul(sellOrders[0].buyAmount)
          .div(sellOrders[0].sellAmount)
          .toString()
      );
    });
    it("checks the claimed amounts for a partially matched initialAuctionOrder and buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const sellOrders = [
        {
          sellAmount: new BN(10).pow(new BN(18)).div(new BN(2)).sub(new BN(1)),
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
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount
      );
      await easyAuction.placeSellOrders(
        auctionId,
        sellOrders.map((buyOrder) => buyOrder.buyAmount),
        sellOrders.map((buyOrder) => buyOrder.sellAmount),
        Array(sellOrders.length).fill(queueStartElement)
      );
      await closeAuction(easyAuction, auctionId);
      const price = toPrice(
        await sendTxAndGetReturnValue(easyAuction.calculatePrice, auctionId)
      );
      const receivedAmounts = await easyAuction.claimFromSellOrder.call(
        auctionId
      );
      assert.equal(
        receivedAmounts[0].toString(),
        initialAuctionOrder.sellAmount.sub(sellOrders[0].buyAmount).toString()
      );
      assert.equal(
        receivedAmounts[1].toString(),
        sellOrders[0].buyAmount.toString()
      );
    });
  });
  describe("claimFromBuyOrder", async () => {
    it("checks that claiming only works after the finishing of the auction", async () => {
      const initialAuctionOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const sellOrders = [
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
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount
      );
      await easyAuction.placeSellOrders(
        auctionId,
        sellOrders.map((buyOrder) => buyOrder.buyAmount),
        sellOrders.map((buyOrder) => buyOrder.sellAmount),
        Array(sellOrders.length).fill(queueStartElement)
      );
      await truffleAssert.reverts(
        easyAuction.claimFromBuyOrder(
          auctionId,
          sellOrders.map((order) =>
            encodeOrder(order.buyAmount, order.sellAmount, 0)
          )
        ),
        "Auction not yet finished"
      );
      await closeAuction(easyAuction, auctionId);
      await truffleAssert.reverts(
        easyAuction.claimFromBuyOrder(
          auctionId,
          sellOrders.map((order) =>
            encodeOrder(order.buyAmount, order.sellAmount, 0)
          )
        ),
        "Auction not yet finished"
      );
    });
    it("checks the claimed amounts for a partially matched buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const sellOrders = [
        {
          sellAmount: new BN(10).pow(new BN(18)).div(new BN(2)).sub(new BN(1)),
          buyAmount: new BN(10).pow(new BN(18)).div(new BN(2)),
          owner: user_1,
        },
        {
          sellAmount: new BN(10)
            .pow(new BN(18))
            .mul(new BN(2))
            .div(new BN(3))
            .sub(new BN(1)),
          buyAmount: new BN(10).pow(new BN(18)).mul(new BN(2)).div(new BN(3)),
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
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount
      );
      await easyAuction.placeSellOrders(
        auctionId,
        sellOrders.map((buyOrder) => buyOrder.buyAmount),
        sellOrders.map((buyOrder) => buyOrder.sellAmount),
        Array(sellOrders.length).fill(queueStartElement)
      );
      await closeAuction(easyAuction, auctionId);
      const price = toPrice(
        await sendTxAndGetReturnValue(easyAuction.calculatePrice, auctionId)
      );
      const receivedAmounts = toReceivedFunds(
        await easyAuction.claimFromBuyOrder.call(auctionId, [
          encodeOrder(0, sellOrders[1].buyAmount, sellOrders[1].sellAmount),
        ])
      );
      const settledBuyAmount = sellOrders[1].buyAmount.sub(
        sellOrders[0].buyAmount
          .add(sellOrders[1].buyAmount)
          .sub(initialAuctionOrder.sellAmount)
      );

      assert.equal(
        receivedAmounts.buyTokenAmount.toString(),
        sellOrders[1].buyAmount
          .mul(sellOrders[1].buyAmount)
          .div(sellOrders[1].sellAmount)
          .sub(settledBuyAmount)
          .toString()
      );
      assert.equal(
        receivedAmounts.sellTokenAmount.toString(),
        settledBuyAmount
          .mul(sellOrders[1].sellAmount)
          .div(sellOrders[1].buyAmount)
          .toString()
      );
    });
    it("checks the claimed amounts for a fully matched buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: new BN(10).pow(new BN(18)),
        buyAmount: new BN(10).pow(new BN(18)),
        owner: user_1,
      };
      const sellOrders = [
        {
          sellAmount: new BN(10).pow(new BN(18)).div(new BN(2)).sub(new BN(1)),
          buyAmount: new BN(10).pow(new BN(18)).div(new BN(2)),
          owner: user_1,
        },
        {
          sellAmount: new BN(10)
            .pow(new BN(18))
            .mul(new BN(2))
            .div(new BN(3))
            .sub(new BN(1)),
          buyAmount: new BN(10).pow(new BN(18)).mul(new BN(2)).div(new BN(3)),
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
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount
      );
      await easyAuction.placeSellOrders(
        auctionId,
        sellOrders.map((buyOrder) => buyOrder.buyAmount),
        sellOrders.map((buyOrder) => buyOrder.sellAmount),
        Array(sellOrders.length).fill(queueStartElement)
      );
      await closeAuction(easyAuction, auctionId);
      const price = toPrice(
        await sendTxAndGetReturnValue(easyAuction.calculatePrice, auctionId)
      );
      const receivedAmounts = toReceivedFunds(
        await easyAuction.claimFromBuyOrder.call(auctionId, [
          encodeOrder(0, sellOrders[0].buyAmount, sellOrders[0].sellAmount),
        ])
      );
      const unsettledBuyAmount = sellOrders[0].buyAmount
        .add(sellOrders[1].buyAmount)
        .sub(initialAuctionOrder.sellAmount);
      assert.equal(
        receivedAmounts.sellTokenAmount.toString(),
        sellOrders[0].buyAmount
          .mul(sellOrders[1].sellAmount)
          .div(sellOrders[1].buyAmount)
          .toString()
      );
      assert.equal(receivedAmounts.buyTokenAmount.toString(), "0");
    });
  });
});
