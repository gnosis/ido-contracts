import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import { ethers, waffle } from "hardhat";

import {
  toAuctionDataResult,
  toReceivedFunds,
  encodeOrder,
  queueStartElement,
  createTokensAndMintAndApprove,
  placeOrders,
  calculateClearingPrice,
} from "../../src/priceCalculation";

import { sendTxAndGetReturnValue, closeAuction } from "./utilities";

describe("EasyAuction", async () => {
  const [user_1, user_2, user_3] = waffle.provider.getWallets();
  let easyAuction: Contract;
  beforeEach(async () => {
    const EasyAuction = await ethers.getContractFactory("EasyAuction");

    easyAuction = await EasyAuction.deploy();
  });
  describe("initiate Auction", async () => {
    it("throws if minParticipationSellAmount is zero", async () => {
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      await expect(
        easyAuction.initiateAuction(
          sellToken.address,
          buyToken.address,
          60 * 60,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("1"),
          0,
        ),
      ).to.be.revertedWith(
        "minParticipationSellAmount is not allowed to be zero",
      );
    });
    it("initiateAuction stores the parameters correctly", async () => {
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("1"),
        1,
      );

      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId),
      );
      expect(auctionData.sellToken).to.equal(sellToken.address);
      expect(auctionData.buyToken).to.equal(buyToken.address);
      expect(auctionData.initialAuctionOrder).to.equal(
        encodeOrder({
          userId: BigNumber.from(0),
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1"),
        }),
      );
      //Todo assert.equal(auctionData.auctionEndDate);
      await expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder({
          userId: BigNumber.from(0),
          sellAmount: ethers.utils.parseEther("0"),
          buyAmount: ethers.utils.parseEther("0"),
        }),
      );
      expect(auctionData.volumeClearingPriceOrder).to.be.equal(0);

      expect(await sellToken.balanceOf(easyAuction.address)).to.equal(
        ethers.utils.parseEther("1"),
      );
    });
  });

  describe("getUserId", async () => {
    it("creates new userIds", async () => {
      expect(
        await sendTxAndGetReturnValue(
          easyAuction,
          "getUserId(address)",
          user_1.address,
        ),
      ).to.equal(0);
      expect(
        await sendTxAndGetReturnValue(
          easyAuction,
          "getUserId(address)",
          user_2.address,
        ),
      ).to.equal(1);
      expect(
        await sendTxAndGetReturnValue(
          easyAuction,
          "getUserId(address)",
          user_1.address,
        ),
      ).to.equal(0);
    });
  });
  describe("placeOrders", async () => {
    it("one can not place orders, if auction is not yet initiated", async () => {
      await expect(
        easyAuction.placeSellOrders(
          0,
          [ethers.utils.parseEther("1")],
          [ethers.utils.parseEther("1").add(1)],
          [queueStartElement],
        ),
      ).to.be.revertedWith("no longer in order placement phase");
    });
    it("one can not place orders, if auction is over", async () => {
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);
      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("1"),
        1,
      );
      await closeAuction(easyAuction, auctionId);
      await expect(
        easyAuction.placeSellOrders(
          0,
          [ethers.utils.parseEther("1")],
          [ethers.utils.parseEther("1").add(1)],
          [queueStartElement],
        ),
      ).to.be.revertedWith("no longer in order placement phase");
    });
    it("one can not place orders, with a worser or same rate", async () => {
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);
      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("1"),
        1,
      );
      await expect(
        easyAuction.placeSellOrders(
          auctionId,
          [ethers.utils.parseEther("1").add(1)],
          [ethers.utils.parseEther("1")],
          [queueStartElement],
        ),
      ).to.be.revertedWith("limit price not better than mimimal offer");
      await expect(
        easyAuction.placeSellOrders(
          auctionId,
          [ethers.utils.parseEther("1")],
          [ethers.utils.parseEther("1")],
          [queueStartElement],
        ),
      ).to.be.revertedWith("limit price not better than mimimal offer");
    });
    it("places a new order and checks that tokens were transferred", async () => {
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);
      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("1"),
        1,
      );

      const balanceBeforeOrderPlacement = await buyToken.balanceOf(
        user_1.address,
      );
      const sellAmount = ethers.utils.parseEther("1").add(1);
      const buyAmount = ethers.utils.parseEther("1");

      await easyAuction.placeSellOrders(
        auctionId,
        [buyAmount, buyAmount],
        [sellAmount, sellAmount.add(1)],
        [queueStartElement, queueStartElement],
      );
      const transferredBuyTokenAmount = sellAmount.add(sellAmount.add(1));

      expect(await buyToken.balanceOf(easyAuction.address)).to.equal(
        transferredBuyTokenAmount,
      );
      expect(await buyToken.balanceOf(user_1.address)).to.equal(
        balanceBeforeOrderPlacement.sub(transferredBuyTokenAmount),
      );
    });
    it("throws, if DDOS attack with small order amounts is started", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(5000),
          buyAmount: ethers.utils.parseEther("1").div(10000),
          userId: BigNumber.from(0),
        },
      ];

      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        ethers.utils.parseEther("1").div(100),
      );
      await expect(
        easyAuction.placeSellOrders(
          auctionId,
          sellOrders.map((buyOrder) => buyOrder.buyAmount),
          sellOrders.map((buyOrder) => buyOrder.sellAmount),
          Array(sellOrders.length).fill(queueStartElement),
        ),
      ).to.be.revertedWith("order too small");
    });
    it("fails, if transfers are failing", async () => {
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);
      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("1"),
        1,
      );
      const sellAmount = ethers.utils.parseEther("1").add(1);
      const buyAmount = ethers.utils.parseEther("1");
      await buyToken.approve(easyAuction.address, ethers.utils.parseEther("0"));

      await expect(
        easyAuction.placeSellOrders(
          auctionId,
          [buyAmount, buyAmount],
          [sellAmount, sellAmount.add(1)],
          [queueStartElement, queueStartElement],
        ),
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
  });
  describe("precalculateSellAmountSum", async () => {
    it("fails if too many orders are considered", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(0),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);
      await expect(
        easyAuction.precalculateSellAmountSum(auctionId, 3),
      ).to.be.revertedWith("too many orders summed up");
    });
    it("verifies that interimSellAmountSum and iterOrder is set correctly", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(0),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);

      await easyAuction.precalculateSellAmountSum(auctionId, 1);
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId),
      );
      expect(auctionData.interimSellAmountSum).to.equal(
        sellOrders[0].sellAmount,
      );

      expect(auctionData.interimOrder).to.equal(encodeOrder(sellOrders[0]));
    });
    it("verifies that interimSellAmountSum and iterOrder takes correct starting values by applying twice", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(10),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(10),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(0),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);

      await easyAuction.precalculateSellAmountSum(auctionId, 1);
      await easyAuction.precalculateSellAmountSum(auctionId, 1);
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId),
      );
      expect(auctionData.interimSellAmountSum).to.equal(
        sellOrders[0].sellAmount.add(sellOrders[0].sellAmount),
      );

      expect(auctionData.interimOrder).to.equal(encodeOrder(sellOrders[1]));
    });
  });
  describe("verifyPrice", async () => {
    it("verifies the price in case of clearing order == initialAuctionOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(10),
          buyAmount: ethers.utils.parseEther("1").div(20),
          userId: BigNumber.from(0),
        },
      ];

      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      await easyAuction.initiateAuction(
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      const auctionId = BigNumber.from(1);
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);

      const price = await calculateClearingPrice(easyAuction, auctionId);
      await easyAuction.verifyPrice(auctionId, encodeOrder(price));
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(
        sellOrders[0].sellAmount, // times prices (=1)
      );
    });
    it("prevents submission of malicious prices worser than initialAuction order price", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("5"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.1"),
          buyAmount: ethers.utils.parseEther("0.1"),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("0.1"),
          buyAmount: ethers.utils.parseEther("0.1"),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      await easyAuction.initiateAuction(
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      const auctionId = BigNumber.from(1);
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);

      const price = {
        userId: BigNumber.from(0),
        sellAmount: initialAuctionOrder.buyAmount,
        buyAmount: sellOrders[0].sellAmount.mul(2),
      };
      await expect(
        easyAuction.verifyPrice(auctionId, encodeOrder(price)),
      ).to.be.revertedWith("supplied price must be inverse initialOrderLimit");
    });
    it("verifies the price in case of clearingOrder == initialAuctionOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("5"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.1"),
          buyAmount: ethers.utils.parseEther("0.1"),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      await easyAuction.initiateAuction(
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      const auctionId = BigNumber.from(1);
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);

      const price = await calculateClearingPrice(easyAuction, auctionId);
      await easyAuction.verifyPrice(auctionId, encodeOrder(price));
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(
        sellOrders[0].sellAmount.mul(price.buyAmount).div(price.sellAmount),
      );
    });
    it("verifies the price in case of clearingOrder == initialAuctionOrder with 3 orders", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("2"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.1"),
          buyAmount: ethers.utils.parseEther("0.1"),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("0.1"),
          buyAmount: ethers.utils.parseEther("0.1"),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("0.1"),
          buyAmount: ethers.utils.parseEther("0.1"),
          userId: BigNumber.from(2),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [
        user_1,
        user_2,
        user_3,
      ]);

      await easyAuction.initiateAuction(
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      const auctionId = BigNumber.from(1);
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);

      const price = await calculateClearingPrice(easyAuction, auctionId);
      await easyAuction.verifyPrice(auctionId, encodeOrder(price));
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(
        sellOrders[0].sellAmount
          .mul(3)
          .mul(price.buyAmount)
          .div(price.sellAmount),
      );
    });
    it("verifies the price in case of clearingOrder != placed order", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("500"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      await easyAuction.initiateAuction(
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      const auctionId = BigNumber.from(1);
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);

      const price = await calculateClearingPrice(easyAuction, auctionId);
      await easyAuction.verifyPrice(auctionId, encodeOrder(price));
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(BigNumber.from(0));
    });
    it("verifies the price in case of clearingOrder != placed order with 3x participation", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("500"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },
      ];

      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [
        user_1,
        user_2,
        user_3,
      ]);

      await easyAuction.initiateAuction(
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      const auctionId = BigNumber.from(1);
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);

      const price = await calculateClearingPrice(easyAuction, auctionId);
      await easyAuction.verifyPrice(auctionId, encodeOrder(price));
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(BigNumber.from(0));
    });
    it("verifies the price in case of no participation of the auction", async () => {
      const initialAuctionOrder = {
        sellAmount: BigNumber.from(1000),
        buyAmount: BigNumber.from(1000),
        userId: BigNumber.from(1),
      };

      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      await easyAuction.initiateAuction(
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      const auctionId = BigNumber.from(1);

      await closeAuction(easyAuction, auctionId);

      const price = await calculateClearingPrice(easyAuction, auctionId);
      await easyAuction.verifyPrice(auctionId, encodeOrder(price));
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(BigNumber.from(0));
    });
    it("verifies the price in case without a partially filled order", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1").add(1),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);
      const price = await calculateClearingPrice(easyAuction, auctionId);
      await easyAuction.verifyPrice(auctionId, encodeOrder(price));
    });
    it("verifies the price in case one sellOrder is eating initialAuctionOrder completely", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(20),
          buyAmount: ethers.utils.parseEther("1").mul(10),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);
      const price = await calculateClearingPrice(easyAuction, auctionId);
      await easyAuction.verifyPrice(auctionId, encodeOrder(price));
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(
        initialAuctionOrder.sellAmount
          .mul(price.sellAmount)
          .div(price.buyAmount),
      );
    });
    it("verifies the price in case of 2 of 3 sellOrders eating initialAuctionOrder completely", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(0),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);
      const price = await calculateClearingPrice(easyAuction, auctionId);
      await easyAuction.verifyPrice(auctionId, encodeOrder(price));
      expect(price).to.eql(sellOrders[1]);
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(0);
    });
    it("verifies the price in case of 2 of 3 sellOrders eating initialAuctionOrder completely - with precalculateSellAmountSum step", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(0),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);
      const price = await calculateClearingPrice(easyAuction, auctionId);
      // this is the additional step
      await easyAuction.precalculateSellAmountSum(auctionId, 1);

      await easyAuction.verifyPrice(auctionId, encodeOrder(price));
      expect(price).to.eql(sellOrders[1]);
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(0);
    });
    it("verifies the price in case of 2 of 4 sellOrders eating initialAuctionOrder completely - with precalculateSellAmountSum step and one more step within verifyPrice", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(0),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);
      const price = await calculateClearingPrice(easyAuction, auctionId);
      // this is the additional step
      await easyAuction.precalculateSellAmountSum(auctionId, 1);

      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId),
      );
      expect(auctionData.interimSellAmountSum).to.equal(
        sellOrders[0].sellAmount,
      );
      expect(auctionData.interimOrder).to.equal(encodeOrder(sellOrders[0]));
      await easyAuction.verifyPrice(auctionId, encodeOrder(price));
      expect(price).to.eql(sellOrders[2]);
      const auctionData2 = toAuctionDataResult(
        await easyAuction.auctionData(auctionId),
      );
      expect(auctionData2.volumeClearingPriceOrder).to.equal(0);
    });
    it("verifies the price in case of clearing order is decided by userId", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(0),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);
      const price = await calculateClearingPrice(easyAuction, auctionId);
      await easyAuction.verifyPrice(auctionId, encodeOrder(price));
      expect(price).to.eql(sellOrders[1]);
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(0);
    });
    it("verifies that partially fillable orders can not be set arbitrary", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);
      await closeAuction(easyAuction, auctionId);
      await expect(
        easyAuction.verifyPrice(auctionId, encodeOrder(sellOrders[2])), //<-- wrong price, sellOrders[1] would be correct
      ).to.be.revertedWith("subtraction overflow");
    });
    it("verifies that the price needs to be correct in case of initialAuctionOrder.sellAmount > sumBuyAmount", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(0),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);
      await expect(
        easyAuction.verifyPrice(
          auctionId,
          encodeOrder({
            sellAmount: ethers.utils.parseEther("1").mul(5),
            buyAmount: ethers.utils.parseEther("1"),
            userId: BigNumber.from(1),
          }),
        ),
      ).to.be.revertedWith("supplied price must be inverse initialOrderLimit");
    });
    it("verifies that the price needs to be correct in case of initialAuctionOrder.sellAmount > sumBuyAmount", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(0),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);
      await expect(
        easyAuction.verifyPrice(
          auctionId,
          encodeOrder({
            sellAmount: ethers.utils.parseEther("1"),
            buyAmount: ethers.utils.parseEther("1").mul(5),
            userId: BigNumber.from(1),
          }),
        ),
      ).to.be.revertedWith("price is not clearing price");
    });

    it("simple version of e2e gas test", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(4),
          buyAmount: ethers.utils.parseEther("1").div(8),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1").div(4),
          buyAmount: ethers.utils.parseEther("1").div(12),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1").div(4),
          buyAmount: ethers.utils.parseEther("1").div(16),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1").div(4),
          buyAmount: ethers.utils.parseEther("1").div(20),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);
      const price = await calculateClearingPrice(easyAuction, auctionId);

      await easyAuction.verifyPrice(auctionId, encodeOrder(price));
      expect(price).to.eql(initialAuctionOrder);
      const auctionData = toAuctionDataResult(
        await easyAuction.auctionData(auctionId),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(0);
    });
  });
  describe("claimFromAuctioneerOrder", async () => {
    it("checks the claimed amounts for a fully matched initialAuctionOrder and buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").add(1),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);
      const price = await calculateClearingPrice(easyAuction, auctionId);
      const callPromise = easyAuction.verifyPrice(
        auctionId,
        encodeOrder(price),
      );
      // auctioneer reward check:
      await expect(callPromise)
        .to.emit(sellToken, "Transfer")
        .withArgs(easyAuction.address, user_1.address, 0);
      await expect(callPromise)
        .to.emit(buyToken, "Transfer")
        .withArgs(easyAuction.address, user_1.address, price.sellAmount);
    });
    it("checks the claimed amounts for a partially matched initialAuctionOrder and buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);

      const price = await calculateClearingPrice(easyAuction, auctionId);
      const callPromise = easyAuction.verifyPrice(
        auctionId,
        encodeOrder(price),
      );
      // auctioneer reward check:
      await expect(callPromise)
        .to.emit(sellToken, "Transfer")
        .withArgs(
          easyAuction.address,
          user_1.address,
          initialAuctionOrder.sellAmount.sub(sellOrders[0].sellAmount),
        );
      await expect(callPromise)
        .to.emit(buyToken, "Transfer")
        .withArgs(
          easyAuction.address,
          user_1.address,
          sellOrders[0].sellAmount,
        );
    });
  });
  describe("claimFromParticipantOrder", async () => {
    it("checks that claiming only works after the finishing of the auction", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").add(1),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await expect(
        easyAuction.claimFromParticipantOrder(
          auctionId,
          sellOrders.map((order) => encodeOrder(order)),
          Array(sellOrders.length).fill(queueStartElement),
        ),
      ).to.be.revertedWith("Auction not yet finished");
      await closeAuction(easyAuction, auctionId);
      await expect(
        easyAuction.claimFromParticipantOrder(
          auctionId,
          sellOrders.map((order) => encodeOrder(order)),
          Array(sellOrders.length).fill(queueStartElement),
        ),
      ).to.be.revertedWith("Auction not yet finished");
    });
    it("checks the claimed amounts for a partially matched buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);
      const price = await calculateClearingPrice(easyAuction, auctionId);
      await easyAuction.verifyPrice(auctionId, encodeOrder(price));

      const receivedAmounts = toReceivedFunds(
        await easyAuction.callStatic.claimFromParticipantOrder(
          auctionId,
          [encodeOrder(sellOrders[1])],
          [queueStartElement],
        ),
      );
      const settledBuyAmount = sellOrders[1].sellAmount
        .mul(price.buyAmount)
        .div(price.sellAmount)
        .sub(
          sellOrders[0].sellAmount
            .add(sellOrders[1].sellAmount)
            .mul(price.buyAmount)
            .div(price.sellAmount)
            .sub(initialAuctionOrder.sellAmount),
        );
      expect(receivedAmounts.sellTokenAmount).to.equal(settledBuyAmount.sub(1)); // <--- .sub(1) probably rounding error
      expect(receivedAmounts.buyTokenAmount).to.equal(
        sellOrders[1].sellAmount.sub(
          settledBuyAmount.mul(price.sellAmount).div(price.buyAmount),
        ),
      );
    });
    it("checks the claimed amounts for a fully not-matched buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(1),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);
      const price = await calculateClearingPrice(easyAuction, auctionId);
      await easyAuction.verifyPrice(auctionId, encodeOrder(price));

      const receivedAmounts = toReceivedFunds(
        await easyAuction.callStatic.claimFromParticipantOrder(
          auctionId,
          [encodeOrder(sellOrders[2])],
          [queueStartElement],
        ),
      );
      expect(receivedAmounts.buyTokenAmount).to.equal(sellOrders[2].sellAmount);
      expect(receivedAmounts.sellTokenAmount).to.equal("0");
    });
    it("checks the claimed amounts for a fully matched buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);
      const price = await calculateClearingPrice(easyAuction, auctionId);
      await easyAuction.verifyPrice(auctionId, encodeOrder(price));

      const receivedAmounts = toReceivedFunds(
        await easyAuction.callStatic.claimFromParticipantOrder(
          auctionId,
          [encodeOrder(sellOrders[0])],
          [queueStartElement],
        ),
      );
      expect(receivedAmounts.buyTokenAmount).to.equal("0");
      expect(receivedAmounts.sellTokenAmount).to.equal(
        sellOrders[0].sellAmount.mul(price.buyAmount).div(price.sellAmount),
      );
    });
    it("checks that an order can not be used for claiming twice", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(0),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);
      const price = await calculateClearingPrice(easyAuction, auctionId);
      await easyAuction.verifyPrice(auctionId, encodeOrder(price));

      await easyAuction.claimFromParticipantOrder(
        auctionId,
        [encodeOrder(sellOrders[0])],
        [queueStartElement],
      ),
        await expect(
          easyAuction.claimFromParticipantOrder(
            auctionId,
            [encodeOrder(sellOrders[0])],
            [queueStartElement],
          ),
        ).to.be.revertedWith("order is no longer claimable");
    });
  });
  it("checks that orders from different users can not be claimed at once", async () => {
    const initialAuctionOrder = {
      sellAmount: ethers.utils.parseEther("1"),
      buyAmount: ethers.utils.parseEther("1"),
      userId: BigNumber.from(0),
    };
    const sellOrders = [
      {
        sellAmount: ethers.utils.parseEther("1").div(2).add(1),
        buyAmount: ethers.utils.parseEther("1").div(2),
        userId: BigNumber.from(0),
      },
      {
        sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
        buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
        userId: BigNumber.from(1),
      },
    ];
    const {
      sellToken,
      buyToken,
    } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

    const auctionId: BigNumber = await sendTxAndGetReturnValue(
      easyAuction,
      "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
      sellToken.address,
      buyToken.address,
      60 * 60,
      initialAuctionOrder.sellAmount,
      initialAuctionOrder.buyAmount,
      1,
    );
    await placeOrders(easyAuction, sellOrders, auctionId);

    await closeAuction(easyAuction, auctionId);
    const price = await calculateClearingPrice(easyAuction, auctionId);
    await easyAuction.verifyPrice(auctionId, encodeOrder(price));

    await expect(
      easyAuction.claimFromParticipantOrder(
        auctionId,
        [encodeOrder(sellOrders[0]), encodeOrder(sellOrders[1])],
        [queueStartElement, queueStartElement],
      ),
    ).to.be.revertedWith("only allowed to claim for same user");
  });
  it("checks the claimed amounts are summed up correctly for two orders", async () => {
    const initialAuctionOrder = {
      sellAmount: ethers.utils.parseEther("1"),
      buyAmount: ethers.utils.parseEther("1"),
      userId: BigNumber.from(0),
    };
    const sellOrders = [
      {
        sellAmount: ethers.utils.parseEther("1").div(2).add(1),
        buyAmount: ethers.utils.parseEther("1").div(2),
        userId: BigNumber.from(0),
      },
      {
        sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
        buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
        userId: BigNumber.from(0),
      },
    ];
    const {
      sellToken,
      buyToken,
    } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

    const auctionId: BigNumber = await sendTxAndGetReturnValue(
      easyAuction,
      "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
      sellToken.address,
      buyToken.address,
      60 * 60,
      initialAuctionOrder.sellAmount,
      initialAuctionOrder.buyAmount,
      1,
    );
    await placeOrders(easyAuction, sellOrders, auctionId);

    await closeAuction(easyAuction, auctionId);
    const price = await calculateClearingPrice(easyAuction, auctionId);
    await easyAuction.verifyPrice(auctionId, encodeOrder(price));

    const receivedAmounts = toReceivedFunds(
      await easyAuction.callStatic.claimFromParticipantOrder(
        auctionId,
        [encodeOrder(sellOrders[0]), encodeOrder(sellOrders[1])],
        [queueStartElement, queueStartElement],
      ),
    );
    expect(receivedAmounts.buyTokenAmount).to.equal(
      sellOrders[0].sellAmount
        .add(sellOrders[1].sellAmount)
        .sub(
          initialAuctionOrder.sellAmount
            .mul(price.sellAmount)
            .div(price.buyAmount),
        ),
    );
    expect(receivedAmounts.sellTokenAmount).to.equal(
      initialAuctionOrder.sellAmount.sub(BigNumber.from(1)), //<-- tiny rounding error
    );
  });
  describe("cancelOrder", async () => {
    it("cancels an order", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await expect(
        easyAuction.cancelSellOrders(
          auctionId,
          [encodeOrder(sellOrders[0])],
          [queueStartElement],
        ),
      )
        .to.emit(buyToken, "Transfer")
        .withArgs(
          easyAuction.address,
          user_1.address,
          sellOrders[0].sellAmount,
        );
    });
    it("can't cancel orders twice", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      // removes the order
      easyAuction.cancelSellOrders(
        auctionId,
        [encodeOrder(sellOrders[0])],
        [queueStartElement],
      );
      // claims 0 sellAmount tokens
      await expect(
        easyAuction.cancelSellOrders(
          auctionId,
          [encodeOrder(sellOrders[0])],
          [queueStartElement],
        ),
      )
        .to.emit(buyToken, "Transfer")
        .withArgs(easyAuction.address, user_1.address, 0);
    });
    it("prevents an order from canceling, if tx is not from owner", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await expect(
        easyAuction.cancelSellOrders(
          auctionId,
          [encodeOrder(sellOrders[0])],
          [queueStartElement],
        ),
      ).to.be.revertedWith("Only the user can cancel his orders");
    });
  });

  describe("containsOrder", async () => {
    it("returns true, if it contains order", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(0),
        },
      ];
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await placeOrders(easyAuction, sellOrders, auctionId);

      await closeAuction(easyAuction, auctionId);
      expect(
        await easyAuction.callStatic.containsOrder(
          auctionId,
          encodeOrder(sellOrders[0]),
        ),
      ).to.be.equal(true);
    });
  });
  describe("getSecondsRemainingInBatch", async () => {
    it("checks that claiming only works after the finishing of the auction", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(0),
      };
      const {
        sellToken,
        buyToken,
      } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2]);

      const auctionId: BigNumber = await sendTxAndGetReturnValue(
        easyAuction,
        "initiateAuction(address,address,uint256,uint96,uint96,uint256)",
        sellToken.address,
        buyToken.address,
        60 * 60,
        initialAuctionOrder.sellAmount,
        initialAuctionOrder.buyAmount,
        1,
      );
      await closeAuction(easyAuction, auctionId);
      expect(
        await easyAuction.callStatic.getSecondsRemainingInBatch(auctionId),
      ).to.be.equal("0");
    });
  });
});
