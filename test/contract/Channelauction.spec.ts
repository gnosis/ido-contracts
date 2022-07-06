import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import hre, { ethers, waffle } from "hardhat";
import "@nomiclabs/hardhat-ethers";

import {
  toReceivedFunds,
  encodeOrder,
  queueStartElement,
  createTokensAndMintAndApprove,
  placeOrdersForChannelAuction,
  calculateClearingPrice,
} from "../../src/priceCalculation";

import {
  createChannelAuctionWithDefaults,
  createChannelAuctionWithDefaultsAndReturnId,
} from "./defaultContractInteractions";
import {
  sendTxAndGetReturnValue,
  closeChannelAuction,
  claimFromAllOrders,
  startChannelAuction,
} from "./utilities";

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Some tests use different test cases 1,..,10. These test cases are illustrated in the following jam board:
// https://jamboard.google.com/d/1DMgMYCQQzsSLKPq_hlK3l32JNBbRdIhsOrLB1oHaEYY/edit?usp=sharing
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("ChannelAuction", async () => {
  const [user_1, user_2, user_3, user_4] = await waffle.provider.getWallets();
  let channelAuction: Contract;
  beforeEach(async () => {
    const ChannelAuction = await ethers.getContractFactory("ChannelAuction");
    channelAuction = await ChannelAuction.deploy();
  });
  describe("initiate Auction", async () => {
    it("throws if minimumBiddingAmountPerOrder is zero", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2],
        hre,
      );

      await expect(
        createChannelAuctionWithDefaults(channelAuction, {
          auctioningToken,
          biddingToken,
          _minimumBiddingAmountPerOrder: 0,
        }),
      ).to.be.revertedWith(
        "minimumBiddingAmountPerOrder is not allowed to be zero",
      );
    });
    it("throws if auctioned amount is zero", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2],
        hre,
      );

      await expect(
        createChannelAuctionWithDefaults(channelAuction, {
          auctioningToken,
          biddingToken,
          _auctionedSellAmount: 0,
        }),
      ).to.be.revertedWith("cannot auction zero tokens");
    });
    it("throws if auction is a giveaway", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2],
        hre,
      );

      await expect(
        createChannelAuctionWithDefaults(channelAuction, {
          auctioningToken,
          biddingToken,
          _auctioneerBuyAmountMinimum: 0,
        }),
      ).to.be.revertedWith("_auctioneerBuyAmountMinimum must be positive");
    });
    it("throws if auction end is not in the future", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2],
        hre,
      );

      const now = (await ethers.provider.getBlock("latest")).timestamp;
      await expect(
        createChannelAuctionWithDefaults(channelAuction, {
          auctioningToken,
          biddingToken,
          _auctionStartDate: now - 60 * 60,
          _maxDuration: 60,
        }),
      ).to.be.revertedWith("time periods are not configured correctly");
    });
    it("initiateAuction stores the parameters correctly", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2],
        hre,
      );

      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const auctionStartDate = now + 1337;
      const _maxDuration = BigNumber.from(2000);

      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        {
          auctioningToken,
          biddingToken,
          _auctionedSellAmount: initialAuctionOrder.sellAmount,
          _auctioneerBuyAmountMaximum: initialAuctionOrder.buyAmount.mul(2),
          _auctioneerBuyAmountMinimum: initialAuctionOrder.buyAmount,
          _auctionStartDate: auctionStartDate,
          _maxDuration,
        },
      );
      const auctionData = await channelAuction.auctionData(auctionId);
      expect(auctionData.auctioningToken).to.equal(auctioningToken.address);
      expect(auctionData.biddingToken).to.equal(biddingToken.address);
      expect(auctionData.initialAuctionOrder).to.equal(
        encodeOrder(initialAuctionOrder),
      );
      expect(auctionData.auctionStartDate).to.be.equal(auctionStartDate);
      expect(auctionData.maxDuration).to.be.equal(_maxDuration);
      expect(auctionData.auctioneerBuyAmountMaximum).to.be.equal(
        initialAuctionOrder.buyAmount.mul(2),
      );
      await expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder({
          userId: BigNumber.from(0),
          sellAmount: ethers.utils.parseEther("0"),
          buyAmount: ethers.utils.parseEther("0"),
        }),
      );
      expect(auctionData.volumeClearingPriceOrder).to.be.equal(0);

      // expect(await auctioningToken.balanceOf(channelAuction.address)).to.equal(
      //   ethers.utils.parseEther("1"),
      // );
    });
  });

  describe("getUserId", async () => {
    it("creates new userIds", async () => {
      expect(
        await sendTxAndGetReturnValue(
          channelAuction,
          "getUserId(address)",
          user_1.address,
        ),
      ).to.equal(1);
      expect(
        await sendTxAndGetReturnValue(
          channelAuction,
          "getUserId(address)",
          user_2.address,
        ),
      ).to.equal(2);
      expect(
        await sendTxAndGetReturnValue(
          channelAuction,
          "getUserId(address)",
          user_1.address,
        ),
      ).to.equal(1);
    });
  });
  // Maybe we have to disable that functionality
  // describe("placeOrdersOnBehalf", async () => {
  //   it("places a new order and checks that tokens were transferred", async () => {
  //     const {
  //       auctioningToken,
  //       biddingToken,
  //     } = await createTokensAndMintAndApprove(
  //       channelAuction,
  //       [user_1, user_2],
  //       hre,
  //     );
  //     const now = (await ethers.provider.getBlock("latest")).timestamp;
  //     const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
  //       channelAuction,
  //       {
  //         auctioningToken,
  //         biddingToken,
  //         _auctionStartDate: now + 3600,
  //       },
  //     );

  //     const balanceBeforeOrderPlacement = await biddingToken.balanceOf(
  //       user_1.address,
  //     );
  //     const balanceBeforeOrderPlacementOfUser2 = await biddingToken.balanceOf(
  //       user_2.address,
  //     );
  //     const sellAmount = ethers.utils.parseEther("2").add(1);
  //     const buyAmount = ethers.utils.parseEther("1");
  //     await startChannelAuction(channelAuction, auctionId);

  //     await channelAuction
  //       .connect(user_1)
  //       .placeSellOrdersOnBehalf(
  //         auctionId,
  //         [buyAmount],
  //         [sellAmount],
  //         [queueStartElement],
  //         user_2.address,
  //       );

  //     expect(await biddingToken.balanceOf(channelAuction.address)).to.equal(
  //       sellAmount,
  //     );
  //     expect(await biddingToken.balanceOf(user_1.address)).to.equal(
  //       balanceBeforeOrderPlacement.sub(sellAmount),
  //     );
  //     expect(await biddingToken.balanceOf(user_2.address)).to.equal(
  //       balanceBeforeOrderPlacementOfUser2,
  //     );
  //   });
  // });

  describe("placeOrders", async () => {
    it("one can not place orders, if auction is not yet initiated", async () => {
      await expect(
        channelAuction.placeSellOrders(
          0,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("1").add(1),
          queueStartElement,
        ),
      ).to.be.revertedWith("auction finished or not yet started");
    });
    it("one can not place orders, if auction is not yet started", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2],
        hre,
      );
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        {
          auctioningToken,
          biddingToken,
          _auctionStartDate: now + 360000,
        },
      );

      await expect(
        channelAuction.placeSellOrders(
          auctionId,
          ethers.utils.parseEther("4").add(1),
          ethers.utils.parseEther("1"),
          queueStartElement,
        ),
      ).to.be.revertedWith("not yet in order placement phase");
    });
    it("one can not place orders, if auction is over", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2],
        hre,
      );
      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        {
          auctioningToken,
          biddingToken,
        },
      );
      await closeChannelAuction(channelAuction, auctionId);
      await expect(
        channelAuction.placeSellOrders(
          auctionId,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("1").add(1),
          queueStartElement,
        ),
      ).to.be.revertedWith("auction finished or not yet started");
    });
    it("one can not place orders, with a worser or same rate", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2],
        hre,
      );
      const _auctioneerBuyAmountMaximum = ethers.utils.parseEther("2");
      const _auctioneerBuyAmountMinimum = ethers.utils.parseEther("1");
      const _auctionedSellAmount = ethers.utils.parseEther("1");
      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        {
          auctioningToken,
          biddingToken,
          _auctionedSellAmount,
          _auctioneerBuyAmountMaximum,
          _auctioneerBuyAmountMinimum,
        },
      );
      await startChannelAuction(channelAuction, auctionId);
      // todo: maybe test is not accurate
      await expect(
        channelAuction.placeSellOrders(
          auctionId,
          _auctioneerBuyAmountMinimum,
          _auctionedSellAmount,
          queueStartElement,
        ),
      ).to.be.revertedWith("limit price not better than mimimal offer");
      await expect(
        channelAuction.placeSellOrders(
          auctionId,
          _auctioneerBuyAmountMaximum,
          _auctionedSellAmount,
          queueStartElement,
        ),
      ).to.be.revertedWith("limit price not better than mimimal offer");
    });
    it("one can not place orders with buyAmount == 0", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2],
        hre,
      );
      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        {
          auctioningToken,
          biddingToken,
        },
      );
      await startChannelAuction(channelAuction, auctionId);

      await expect(
        channelAuction.placeSellOrders(
          auctionId,
          ethers.utils.parseEther("0"),
          ethers.utils.parseEther("1"),
          queueStartElement,
        ),
      ).to.be.revertedWith("_minBuyAmounts must be greater than 0");
    });
    it("can't place an order twice", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2],
        hre,
      );
      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        {
          auctioningToken,
          biddingToken,
        },
      );
      await startChannelAuction(channelAuction, auctionId);

      await expect(() =>
        channelAuction.placeSellOrders(
          auctionId,
          ethers.utils.parseEther("1").sub(1),
          ethers.utils.parseEther("1"),
          queueStartElement,
        ),
      ).to.changeTokenBalances(
        biddingToken,
        [user_1],
        [ethers.utils.parseEther("-1")],
      );
      await expect(
        channelAuction.placeSellOrders(
          auctionId,
          ethers.utils.parseEther("1").sub(1),
          ethers.utils.parseEther("1"),
          queueStartElement,
        ),
      ).to.be.revertedWith("could not insert order");
    });
    it("places a new order and checks that tokens were transferred", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2],
        hre,
      );
      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        {
          auctioningToken,
          biddingToken,
        },
      );

      const balanceBeforeOrderPlacement = await biddingToken.balanceOf(
        user_1.address,
      );
      const sellAmount = ethers.utils.parseEther("1").add(1);
      const buyAmount = ethers.utils.parseEther("1");
      await startChannelAuction(channelAuction, auctionId);

      await channelAuction.placeSellOrders(
        auctionId,
        buyAmount,
        sellAmount,
        queueStartElement,
      );
      const transferredbiddingTokenAmount = sellAmount;

      expect(await biddingToken.balanceOf(channelAuction.address)).to.equal(
        transferredbiddingTokenAmount,
      );
      expect(await biddingToken.balanceOf(user_1.address)).to.equal(
        balanceBeforeOrderPlacement.sub(transferredbiddingTokenAmount),
      );
    });
    it("throws, if DDOS attack with small order amounts is started", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(5000),
          buyAmount: ethers.utils.parseEther("1").div(10000),
          userId: BigNumber.from(1),
        },
      ];

      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        {
          auctioningToken,
          biddingToken,
          _auctionedSellAmount: initialAuctionOrder.sellAmount,
          _auctioneerBuyAmountMinimum: initialAuctionOrder.buyAmount,
          _minimumBiddingAmountPerOrder: ethers.utils.parseEther("1").div(100),
        },
      );
      await startChannelAuction(channelAuction, auctionId);
      await expect(
        channelAuction.placeSellOrders(
          auctionId,
          sellOrders[0].buyAmount,
          sellOrders[0].sellAmount,
          queueStartElement,
        ),
      ).to.be.revertedWith("order too small");
    });
    it("fails, if transfers are failing", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2],
        hre,
      );
      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        {
          auctioningToken,
          biddingToken,
        },
      );
      const sellAmount = ethers.utils.parseEther("1").add(1);
      const buyAmount = ethers.utils.parseEther("1");
      await biddingToken.approve(
        channelAuction.address,
        ethers.utils.parseEther("0"),
      );
      await startChannelAuction(channelAuction, auctionId);
      await expect(
        channelAuction.placeSellOrders(
          auctionId,
          buyAmount,
          sellAmount,
          queueStartElement,
        ),
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
  });
  // describe("precalculateSellAmountSum", async () => {
  //   it("fails if too many orders are considered", async () => {
  //     const initialAuctionOrder = {
  //       sellAmount: ethers.utils.parseEther("1"),
  //       buyAmount: ethers.utils.parseEther("1"),
  //       userId: BigNumber.from(1),
  //     };
  //     const sellOrders = [
  //       {
  //         sellAmount: ethers.utils.parseEther("1").mul(2),
  //         buyAmount: ethers.utils.parseEther("1").div(5),
  //         userId: BigNumber.from(1),
  //       },
  //       {
  //         sellAmount: ethers.utils.parseEther("1").mul(2),
  //         buyAmount: ethers.utils.parseEther("1"),
  //         userId: BigNumber.from(1),
  //       },

  //       {
  //         sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
  //         buyAmount: ethers.utils.parseEther("1").mul(2),
  //         userId: BigNumber.from(1),
  //       },
  //     ];
  //     const {
  //       auctioningToken,
  //       biddingToken,
  //     } = await createTokensAndMintAndApprove(
  //       channelAuction,
  //       [user_1, user_2],
  //       hre,
  //     );

  //     const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
  //       channelAuction,
  //       {
  //         auctioningToken,
  //         biddingToken,
  //         _auctionedSellAmount: initialAuctionOrder.sellAmount,
  //         _auctioneerBuyAmountMinimum: initialAuctionOrder.buyAmount,
  //       },
  //     );
  //     await placeOrdersForChannelAuction(
  //       channelAuction,
  //       sellOrders,
  //       auctionId,
  //       hre,
  //     );

  //     await closeChannelAuction(channelAuction, auctionId);
  //     await expect(
  //       channelAuction.precalculateSellAmountSum(auctionId, 3),
  //     ).to.be.revertedWith("too many orders summed up");
  //   });
  //   it("fails if queue end is reached", async () => {
  //     const initialAuctionOrder = {
  //       sellAmount: ethers.utils.parseEther("1"),
  //       buyAmount: ethers.utils.parseEther("1"),
  //       userId: BigNumber.from(1),
  //     };
  //     const sellOrders = [
  //       {
  //         sellAmount: ethers.utils.parseEther("1").mul(2),
  //         buyAmount: ethers.utils.parseEther("1").div(5),
  //         userId: BigNumber.from(1),
  //       },
  //     ];
  //     const {
  //       auctioningToken,
  //       biddingToken,
  //     } = await createTokensAndMintAndApprove(
  //       channelAuction,
  //       [user_1, user_2],
  //       hre,
  //     );

  //     const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
  //       channelAuction,
  //       {
  //         auctioningToken,
  //         biddingToken,
  //         _auctionedSellAmount: initialAuctionOrder.sellAmount,
  //         _auctioneerBuyAmountMinimum: initialAuctionOrder.buyAmount,
  //       },
  //     );
  //     await placeOrdersForChannelAuction(
  //       channelAuction,
  //       sellOrders,
  //       auctionId,
  //       hre,
  //     );

  //     await closeChannelAuction(channelAuction, auctionId);
  //     await expect(
  //       channelAuction.precalculateSellAmountSum(auctionId, 2),
  //     ).to.be.revertedWith("reached end of order list");
  //   });
  //   it("verifies that interimSumBidAmount and iterOrder is set correctly", async () => {
  //     const initialAuctionOrder = {
  //       sellAmount: ethers.utils.parseEther("1"),
  //       buyAmount: ethers.utils.parseEther("1"),
  //       userId: BigNumber.from(1),
  //     };
  //     const sellOrders = [
  //       {
  //         sellAmount: ethers.utils.parseEther("1").mul(2),
  //         buyAmount: ethers.utils.parseEther("1").div(5),
  //         userId: BigNumber.from(1),
  //       },
  //       {
  //         sellAmount: ethers.utils.parseEther("1").mul(2),
  //         buyAmount: ethers.utils.parseEther("1"),
  //         userId: BigNumber.from(1),
  //       },

  //       {
  //         sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
  //         buyAmount: ethers.utils.parseEther("1").mul(2),
  //         userId: BigNumber.from(1),
  //       },
  //     ];
  //     const {
  //       auctioningToken,
  //       biddingToken,
  //     } = await createTokensAndMintAndApprove(
  //       channelAuction,
  //       [user_1, user_2],
  //       hre,
  //     );

  //     const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
  //       channelAuction,
  //       {
  //         auctioningToken,
  //         biddingToken,
  //         _auctionedSellAmount: initialAuctionOrder.sellAmount,
  //         _auctioneerBuyAmountMinimum: initialAuctionOrder.buyAmount,
  //       },
  //     );
  //     await placeOrdersForChannelAuction(
  //       channelAuction,
  //       sellOrders,
  //       auctionId,
  //       hre,
  //     );

  //     await closeChannelAuction(channelAuction, auctionId);

  //     await channelAuction.precalculateSellAmountSum(auctionId, 1);
  //     const auctionData = await channelAuction.auctionData(auctionId);
  //     expect(auctionData.interimSumBidAmount).to.equal(
  //       sellOrders[0].sellAmount,
  //     );

  //     expect(auctionData.interimOrder).to.equal(encodeOrder(sellOrders[0]));
  //   });
  //   it("verifies that interimSumBidAmount and iterOrder takes correct starting values by applying twice", async () => {
  //     const initialAuctionOrder = {
  //       sellAmount: ethers.utils.parseEther("1"),
  //       buyAmount: ethers.utils.parseEther("1"),
  //       userId: BigNumber.from(1),
  //     };
  //     const sellOrders = [
  //       {
  //         sellAmount: ethers.utils.parseEther("1"),
  //         buyAmount: ethers.utils.parseEther("1").div(10),
  //         userId: BigNumber.from(1),
  //       },
  //       {
  //         sellAmount: ethers.utils.parseEther("1"),
  //         buyAmount: ethers.utils.parseEther("1").div(10),
  //         userId: BigNumber.from(2),
  //       },
  //       {
  //         sellAmount: ethers.utils.parseEther("1").mul(2),
  //         buyAmount: ethers.utils.parseEther("1"),
  //         userId: BigNumber.from(1),
  //       },

  //       {
  //         sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
  //         buyAmount: ethers.utils.parseEther("1").mul(2),
  //         userId: BigNumber.from(1),
  //       },
  //     ];
  //     const {
  //       auctioningToken,
  //       biddingToken,
  //     } = await createTokensAndMintAndApprove(
  //       channelAuction,
  //       [user_1, user_2],
  //       hre,
  //     );

  //     const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
  //       channelAuction,
  //       {
  //         auctioningToken,
  //         biddingToken,
  //         _auctionedSellAmount: initialAuctionOrder.sellAmount,
  //         _auctioneerBuyAmountMinimum: initialAuctionOrder.buyAmount,
  //       },
  //     );
  //     await startChannelAuction(channelAuction, auctionId);

  //     await placeOrdersForChannelAuction(
  //       channelAuction,
  //       sellOrders,
  //       auctionId,
  //       hre,
  //     );

  //     await closeChannelAuction(channelAuction, auctionId);

  //     await channelAuction.precalculateSellAmountSum(auctionId, 1);
  //     await channelAuction.precalculateSellAmountSum(auctionId, 1);
  //     const auctionData = await channelAuction.auctionData(auctionId);
  //     expect(auctionData.interimSumBidAmount).to.equal(
  //       sellOrders[0].sellAmount.add(sellOrders[0].sellAmount),
  //     );

  //     expect(auctionData.interimOrder).to.equal(encodeOrder(sellOrders[1]));
  //   });
  // });
  describe("settleAuction", async () => {
    it("checks case 4, it verifies the price in case of clearing order == initialAuctionOrder", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("2"),
        _auctioneerUserId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(10),
          buyAmount: ethers.utils.parseEther("1").div(20),
          userId: BigNumber.from(1),
        },
      ];
      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );
      await startChannelAuction(channelAuction, auctionId);
      await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );
      await closeChannelAuction(channelAuction, auctionId);
      const { clearingOrder: price } = await calculateClearingPrice(
        channelAuction,
        auctionId,
      );
      await expect(channelAuction.settleAuction(auctionId))
        .to.emit(channelAuction, "AuctionCleared")
        .withArgs(
          auctionId,
          sellOrders[0].sellAmount.mul(price.buyAmount).div(price.sellAmount),
          sellOrders[0].sellAmount,
          encodeOrder({
            sellAmount: auctionInitParameters._auctioneerBuyAmountMinimum,
            buyAmount: auctionInitParameters._auctionedSellAmount,
            userId: auctionInitParameters._auctioneerUserId,
          }),
        );
      const auctionData = await channelAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(encodeOrder(price));
    });
    it("checks case 4, it verifies the price in case of clearingOrder == initialAuctionOrder with 3 orders", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2, user_3, user_4],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("2"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("0.5"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("1"),
        _auctioneerUserId: BigNumber.from(0),
      };
      let sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.1"),
          buyAmount: ethers.utils.parseEther("0.1"),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("0.1"),
          buyAmount: ethers.utils.parseEther("0.099"),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("0.1"),
          buyAmount: ethers.utils.parseEther("0.1"),
          userId: BigNumber.from(3),
        },
      ];

      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );
      await startChannelAuction(channelAuction, auctionId);
      sellOrders = await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );

      await closeChannelAuction(channelAuction, auctionId);
      const { clearingOrder: price } = await calculateClearingPrice(
        channelAuction,
        auctionId,
      );
      await expect(channelAuction.settleAuction(auctionId))
        .to.emit(channelAuction, "AuctionCleared")
        .withArgs(
          auctionId,
          sellOrders[0].sellAmount
            .mul(3)
            .mul(price.buyAmount)
            .div(price.sellAmount),
          sellOrders[0].sellAmount.mul(3),
          encodeOrder({
            sellAmount: auctionInitParameters._auctioneerBuyAmountMinimum,
            buyAmount: auctionInitParameters._auctionedSellAmount,
            userId: auctionInitParameters._auctioneerUserId,
          }),
        );
      const auctionData = await channelAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(encodeOrder(price));
      await claimFromAllOrders(channelAuction, auctionId, sellOrders);
    });
    it("checks case 6, it verifies the price in case of clearingOrder == initialOrder, although last iterOrder would also be possible", async () => {
      // This test demonstrates the case 6,
      // where price could be either the auctioningOrder or sellOrder
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("500"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("2"),
        _auctioneerUserId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("260"),
          userId: BigNumber.from(1),
        },
      ];

      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );
      await startChannelAuction(channelAuction, auctionId);
      await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );

      await closeChannelAuction(channelAuction, auctionId);

      await expect(channelAuction.settleAuction(auctionId))
        .to.emit(channelAuction, "AuctionCleared")
        .withArgs(
          auctionId,
          auctionInitParameters._auctionedSellAmount,
          sellOrders[0].sellAmount,
          encodeOrder({
            sellAmount: auctionInitParameters._auctioneerBuyAmountMinimum,
            buyAmount: auctionInitParameters._auctionedSellAmount,
            userId: auctionInitParameters._auctioneerUserId,
          }),
        );
      const auctionData = await channelAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder({
          sellAmount: auctionInitParameters._auctioneerBuyAmountMinimum,
          buyAmount: auctionInitParameters._auctionedSellAmount,
          userId: auctionInitParameters._auctioneerUserId,
        }),
      );
      await claimFromAllOrders(channelAuction, auctionId, sellOrders);
    });
    it("checks case 12, it verifies that price can not be the initial auction price (Adam's case)", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("0.1"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("0.8"),
        _auctioneerUserId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: BigNumber.from(2),
          buyAmount: BigNumber.from(4),
          userId: BigNumber.from(2),
        },
      ];

      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );
      await startChannelAuction(channelAuction, auctionId);

      await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );

      await closeChannelAuction(channelAuction, auctionId);

      await channelAuction.settleAuction(auctionId);
      await channelAuction.auctionData(auctionId);
      await claimFromAllOrders(channelAuction, auctionId, sellOrders);
    });
    it("checks case 3, it verifies the price in case of clearingOrder != placed order with 3x participation", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2, user_3],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("500"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("1000"),
        _auctioneerUserId: BigNumber.from(0),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(3),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(2),
        },
      ];

      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );
      await startChannelAuction(channelAuction, auctionId);

      await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );

      await closeChannelAuction(channelAuction, auctionId);

      await channelAuction.settleAuction(auctionId);
      const auctionData = await channelAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder({
          sellAmount: ethers.utils.parseEther("3"),
          buyAmount: auctionInitParameters._auctionedSellAmount,
          userId: BigNumber.from(0),
        }),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(0);
      await claimFromAllOrders(channelAuction, auctionId, sellOrders);
    });
    it("checks case 8, it verifies the price in case of no participation of the auction", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2, user_3],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("500"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("1000"),
        _auctioneerUserId: BigNumber.from(0),
      };

      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );

      await closeChannelAuction(channelAuction, auctionId);

      await channelAuction.settleAuction(auctionId);
      const auctionData = await channelAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder({
          sellAmount: auctionInitParameters._auctioneerBuyAmountMinimum,
          buyAmount: auctionInitParameters._auctionedSellAmount,
          userId: auctionInitParameters._auctioneerUserId,
        }),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(BigNumber.from(0));
    });
    it("checks case 2, it verifies the price in case without a partially filled order", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2, user_3],
        hre,
      );

      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("5"),
        _auctioneerUserId: BigNumber.from(1),
      };

      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").add(1),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },
      ];

      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );
      await startChannelAuction(channelAuction, auctionId);
      await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );

      await closeChannelAuction(channelAuction, auctionId);
      await channelAuction.settleAuction(auctionId);
      const auctionData = await channelAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder({
          sellAmount: sellOrders[0].sellAmount,
          buyAmount: auctionInitParameters._auctionedSellAmount,
          userId: BigNumber.from(0),
        }),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(0);
      await claimFromAllOrders(channelAuction, auctionId, sellOrders);
    });
    it("checks case 10, verifies the price in case one sellOrder is eating initialAuctionOrder completely", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2, user_3],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("5"),
        _auctioneerUserId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(20),
          buyAmount: ethers.utils.parseEther("1").mul(10),
          userId: BigNumber.from(1),
        },
      ];

      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );
      await startChannelAuction(channelAuction, auctionId);

      await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );

      await closeChannelAuction(channelAuction, auctionId);
      await channelAuction.settleAuction(auctionId);
      const auctionData = await channelAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder(sellOrders[0]),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(
        auctionInitParameters._auctionedSellAmount
          .mul(sellOrders[0].sellAmount)
          .div(sellOrders[0].buyAmount),
      );
      await claimFromAllOrders(channelAuction, auctionId, sellOrders);
    });
    it("checks case 5, bidding amount matches min buyAmount of initialOrder perfectly", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2, user_3],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("0.5"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("5"),
        _auctioneerUserId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(3),
        },
      ];

      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );
      await startChannelAuction(channelAuction, auctionId);
      await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );

      await closeChannelAuction(channelAuction, auctionId);
      await channelAuction.settleAuction(auctionId);
      const auctionData = await channelAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.eql(encodeOrder(sellOrders[1]));
      expect(auctionData.volumeClearingPriceOrder).to.equal(
        sellOrders[1].sellAmount,
      );
      await expect(() =>
        channelAuction.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[0]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_2],
        [sellOrders[0].sellAmount],
      );
      await expect(() =>
        channelAuction.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[1]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_3],
        [sellOrders[1].sellAmount],
      );
    });
    it("checks case 7, bidding amount matches min buyAmount of initialOrder perfectly with additional order", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2, user_3],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("0.5"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("5"),
        _auctioneerUserId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(3),
        },
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.6"),
          userId: BigNumber.from(3),
        },
      ];
      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );
      await startChannelAuction(channelAuction, auctionId);
      await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );
      await closeChannelAuction(channelAuction, auctionId);
      await channelAuction.settleAuction(auctionId);
      const auctionData = await channelAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.eql(encodeOrder(sellOrders[1]));
      expect(auctionData.volumeClearingPriceOrder).to.equal(
        sellOrders[1].sellAmount,
      );
      await expect(() =>
        channelAuction.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[0]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_2],
        [sellOrders[0].sellAmount],
      );
      await expect(() =>
        channelAuction.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[1]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_3],
        [sellOrders[1].sellAmount],
      );
      await expect(() =>
        channelAuction.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[2]),
        ]),
      ).to.changeTokenBalances(
        biddingToken,
        [user_3],
        [sellOrders[2].sellAmount],
      );
    });
    it("checks case 10: it shows an example why userId should always be given: 2 orders with the same price", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2, user_3],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("0.5"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("5"),
        _auctioneerUserId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(3),
        },
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.4"),
          userId: BigNumber.from(3),
        },
      ];
      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );
      await startChannelAuction(channelAuction, auctionId);
      await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );

      await closeChannelAuction(channelAuction, auctionId);
      await channelAuction.settleAuction(auctionId);
      const auctionData = await channelAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder(sellOrders[0]),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(
        sellOrders[1].sellAmount,
      );
      await expect(() =>
        channelAuction.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[0]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_2],
        [sellOrders[0].sellAmount],
      );
      await expect(() =>
        channelAuction.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[1]),
        ]),
      ).to.changeTokenBalances(
        biddingToken,
        [user_3],
        [sellOrders[1].sellAmount],
      );
      await expect(() =>
        channelAuction.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[2]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_3],
        [sellOrders[2].sellAmount],
      );
    });
    it("checks case 1, it verifies the price in case of 2 of 3 sellOrders eating initialAuctionOrder completely", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2, user_3],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("20"),
        _auctioneerUserId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2),
          userId: BigNumber.from(1),
        },
      ];
      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );
      await startChannelAuction(channelAuction, auctionId);
      await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );

      await closeChannelAuction(channelAuction, auctionId);
      await channelAuction.settleAuction(auctionId);
      const auctionData = await channelAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.eql(encodeOrder(sellOrders[1]));
      expect(auctionData.volumeClearingPriceOrder).to.equal(0);
      await claimFromAllOrders(channelAuction, auctionId, sellOrders);
    });
    // it("verifies the price in case of 2 of 3 sellOrders eating initialAuctionOrder completely - with precalculateSellAmountSum step", async () => {
    //   const {
    //     auctioningToken,
    //     biddingToken,
    //   } = await createTokensAndMintAndApprove(
    //     channelAuction,
    //     [user_1, user_2, user_3],
    //     hre,
    //   );
    //   const auctionInitParameters = {
    //     auctioningToken,
    //     biddingToken,
    //     _auctionedSellAmount: ethers.utils.parseEther("1"),
    //     _auctioneerBuyAmountMinimum: ethers.utils.parseEther("1"),
    //     _auctioneerBuyAmountMaximum: ethers.utils.parseEther("5"),
    //     _auctioneerUserId: BigNumber.from(1),
    //   };
    //   const sellOrders = [
    //     {
    //       sellAmount: ethers.utils.parseEther("1").mul(2),
    //       buyAmount: ethers.utils.parseEther("1").div(5),
    //       userId: BigNumber.from(1),
    //     },
    //     {
    //       sellAmount: ethers.utils.parseEther("1").mul(2),
    //       buyAmount: ethers.utils.parseEther("1"),
    //       userId: BigNumber.from(1),
    //     },

    //     {
    //       sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
    //       buyAmount: ethers.utils.parseEther("1").mul(2),
    //       userId: BigNumber.from(1),
    //     },
    //   ];

    //   const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
    //     channelAuction,
    //     auctionInitParameters,
    //   );
    //   await startChannelAuction(channelAuction, auctionId);

    //   await placeOrdersForChannelAuction(
    //     channelAuction,
    //     sellOrders,
    //     auctionId,
    //     hre,
    //   );

    //   await closeChannelAuction(channelAuction, auctionId);
    //   // this is the additional step
    //   await channelAuction.precalculateSellAmountSum(auctionId, 1);

    //   await channelAuction.settleAuction(auctionId);
    //   const auctionData = await channelAuction.auctionData(auctionId);
    //   expect(auctionData.clearingPriceOrder).to.eql(encodeOrder(sellOrders[1]));
    //   expect(auctionData.volumeClearingPriceOrder).to.equal(0);
    // });
    // it("verifies the price in case of 2 of 4 sellOrders eating initialAuctionOrder completely - with precalculateSellAmountSum step and one more step within settleAuction", async () => {
    //   const initialAuctionOrder = {
    //     sellAmount: ethers.utils.parseEther("1"),
    //     buyAmount: ethers.utils.parseEther("1"),
    //     userId: BigNumber.from(1),
    //   };
    //   const sellOrders = [
    //     {
    //       sellAmount: ethers.utils.parseEther("1"),
    //       buyAmount: ethers.utils.parseEther("1").div(5),
    //       userId: BigNumber.from(1),
    //     },
    //     {
    //       sellAmount: ethers.utils.parseEther("1"),
    //       buyAmount: ethers.utils.parseEther("1").div(5),
    //       userId: BigNumber.from(2),
    //     },
    //     {
    //       sellAmount: ethers.utils.parseEther("1").mul(2),
    //       buyAmount: ethers.utils.parseEther("1"),
    //       userId: BigNumber.from(1),
    //     },

    //     {
    //       sellAmount: ethers.utils.parseEther("1").mul(2).add(1),
    //       buyAmount: ethers.utils.parseEther("1").mul(2),
    //       userId: BigNumber.from(1),
    //     },
    //   ];
    //   const {
    //     auctioningToken,
    //     biddingToken,
    //   } = await createTokensAndMintAndApprove(
    //     channelAuction,
    //     [user_1, user_2],
    //     hre,
    //   );

    //   const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
    //     channelAuction,
    //     {
    //       auctioningToken,
    //       biddingToken,
    //       _auctionedSellAmount: initialAuctionOrder.sellAmount,
    //       _auctioneerBuyAmountMinimum: initialAuctionOrder.buyAmount,
    //     },
    //   );
    //   await placeOrdersForChannelAuction(
    //     channelAuction,
    //     sellOrders,
    //     auctionId,
    //     hre,
    //   );

    //   await closeChannelAuction(channelAuction, auctionId);
    //   // this is the additional step
    //   await channelAuction.precalculateSellAmountSum(auctionId, 1);

    //   const auctionData = await channelAuction.auctionData(auctionId);
    //   expect(auctionData.interimSumBidAmount).to.equal(
    //     sellOrders[0].sellAmount,
    //   );
    //   expect(auctionData.interimOrder).to.equal(encodeOrder(sellOrders[0]));
    //   await channelAuction.settleAuction(auctionId);
    //   const auctionData2 = await channelAuction.auctionData(auctionId);
    //   expect(auctionData2.clearingPriceOrder).to.eql(
    //     encodeOrder(sellOrders[2]),
    //   );
    //   expect(auctionData2.volumeClearingPriceOrder).to.equal(0);
    //   await claimFromAllOrders(channelAuction, auctionId, sellOrders);
    // });
    it("verifies the price in case of clearing order is decided by userId", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2, user_3],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("20"),
        _auctioneerUserId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },

        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(2),
        },
      ];

      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );
      await startChannelAuction(channelAuction, auctionId);
      await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );

      await closeChannelAuction(channelAuction, auctionId);
      await channelAuction.settleAuction(auctionId);
      const auctionData = await channelAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.be.equal(
        encodeOrder(sellOrders[1]),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(0);
      await claimFromAllOrders(channelAuction, auctionId, sellOrders);
    });
  });
  describe("claimFromAuctioneerOrder", async () => {
    it("checks the claimed amounts for a fully matched initialAuctionOrder and buyOrder", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2, user_3],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("20"),
        _auctioneerUserId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").add(1),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },
      ];

      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );
      await startChannelAuction(channelAuction, auctionId);
      await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );
      await closeChannelAuction(channelAuction, auctionId);
      const { clearingOrder: price } = await calculateClearingPrice(
        channelAuction,
        auctionId,
      );
      const callPromise = channelAuction.settleAuction(auctionId);
      // auctioneer reward check:
      await expect(() => callPromise).to.changeTokenBalances(
        auctioningToken,
        [user_1],
        [0],
      );
      await expect(callPromise)
        .to.emit(biddingToken, "Transfer")
        .withArgs(channelAuction.address, user_1.address, price.sellAmount);
    });
    it("checks the claimed amounts for a partially matched initialAuctionOrder and buyOrder", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2, user_3],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("20"),
        _auctioneerUserId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
      ];

      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );
      await startChannelAuction(channelAuction, auctionId);
      await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );
      await closeChannelAuction(channelAuction, auctionId);
      const callPromise = channelAuction.settleAuction(auctionId);
      // auctioneer reward check:
      await expect(callPromise)
        .to.emit(auctioningToken, "Transfer")
        .withArgs(
          channelAuction.address,
          user_1.address,
          auctionInitParameters._auctionedSellAmount.sub(
            sellOrders[0].sellAmount,
          ),
        );
      await expect(callPromise)
        .to.emit(biddingToken, "Transfer")
        .withArgs(
          channelAuction.address,
          user_1.address,
          sellOrders[0].sellAmount,
        );
    });
  });
  describe("claimFromParticipantOrder", async () => {
    it("checks that claiming only works after the finishing of the auction", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2, user_3],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("20"),
        _auctioneerUserId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").add(1),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },
      ];

      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );
      await startChannelAuction(channelAuction, auctionId);
      await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );

      await expect(
        channelAuction.claimFromParticipantOrder(
          auctionId,
          sellOrders.map((order) => encodeOrder(order)),
        ),
      ).to.be.revertedWith("Auction not yet finished");
      await closeChannelAuction(channelAuction, auctionId);
      await expect(
        channelAuction.claimFromParticipantOrder(
          auctionId,
          sellOrders.map((order) => encodeOrder(order)),
        ),
      ).to.be.revertedWith("Auction not yet finished");
    });
    it("checks the claimed amounts for a partially matched buyOrder", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2, user_3],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("20"),
        _auctioneerUserId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(1),
        },
      ];

      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );
      await startChannelAuction(channelAuction, auctionId);
      await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );

      await closeChannelAuction(channelAuction, auctionId);
      const { clearingOrder: price } = await calculateClearingPrice(
        channelAuction,
        auctionId,
      );
      await channelAuction.settleAuction(auctionId);

      const receivedAmounts = toReceivedFunds(
        await channelAuction.callStatic.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[1]),
        ]),
      );
      const settledBuyAmount = sellOrders[1].sellAmount
        .mul(price.buyAmount)
        .div(price.sellAmount)
        .sub(
          sellOrders[0].sellAmount
            .add(sellOrders[1].sellAmount)
            .mul(price.buyAmount)
            .div(price.sellAmount)
            .sub(auctionInitParameters._auctionedSellAmount),
        )
        .sub(1);
      expect(receivedAmounts.auctioningTokenAmount).to.equal(settledBuyAmount);
      expect(receivedAmounts.biddingTokenAmount).to.equal(
        sellOrders[1].sellAmount
          .sub(settledBuyAmount.mul(price.sellAmount).div(price.buyAmount))
          .sub(1),
      );
    });
    it("checks the claimed amounts for a fully not-matched buyOrder", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2, user_3],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("20"),
        _auctioneerUserId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(2),
        },
      ];
      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );
      await startChannelAuction(channelAuction, auctionId);
      await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );
      await closeChannelAuction(channelAuction, auctionId);
      await channelAuction.settleAuction(auctionId);
      const receivedAmounts = toReceivedFunds(
        await channelAuction.callStatic.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[2]),
        ]),
      );
      expect(receivedAmounts.biddingTokenAmount).to.equal(
        sellOrders[2].sellAmount,
      );
      expect(receivedAmounts.auctioningTokenAmount).to.equal("0");
    });
    it("checks the claimed amounts for a fully matched buyOrder", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2, user_3],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("20"),
        _auctioneerUserId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(1),
        },
      ];

      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );
      await startChannelAuction(channelAuction, auctionId);
      await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );

      await closeChannelAuction(channelAuction, auctionId);
      const { clearingOrder: price } = await calculateClearingPrice(
        channelAuction,
        auctionId,
      );
      await channelAuction.settleAuction(auctionId);

      const receivedAmounts = toReceivedFunds(
        await channelAuction.callStatic.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[0]),
        ]),
      );
      expect(receivedAmounts.biddingTokenAmount).to.equal("0");
      expect(receivedAmounts.auctioningTokenAmount).to.equal(
        sellOrders[0].sellAmount.mul(price.buyAmount).div(price.sellAmount),
      );
    });
    it("checks that an order can not be used for claiming twice", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2, user_3],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("20"),
        _auctioneerUserId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(1),
        },
      ];

      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        auctionInitParameters,
      );
      await startChannelAuction(channelAuction, auctionId);
      await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );

      await closeChannelAuction(channelAuction, auctionId);
      await channelAuction.settleAuction(auctionId);
      await channelAuction.claimFromParticipantOrder(auctionId, [
        encodeOrder(sellOrders[0]),
      ]),
        await expect(
          channelAuction.claimFromParticipantOrder(auctionId, [
            encodeOrder(sellOrders[0]),
          ]),
        ).to.be.revertedWith("order is no longer claimable");
    });
  });
  it("checks that orders from different users can not be claimed at once", async () => {
    const {
      auctioningToken,
      biddingToken,
    } = await createTokensAndMintAndApprove(
      channelAuction,
      [user_1, user_2, user_3],
      hre,
    );
    const auctionInitParameters = {
      auctioningToken,
      biddingToken,
      _auctionedSellAmount: ethers.utils.parseEther("1"),
      _auctioneerBuyAmountMinimum: ethers.utils.parseEther("1"),
      _auctioneerBuyAmountMaximum: ethers.utils.parseEther("20"),
      _auctioneerUserId: BigNumber.from(1),
    };
    const sellOrders = [
      {
        sellAmount: ethers.utils.parseEther("1").div(2).add(1),
        buyAmount: ethers.utils.parseEther("1").div(2),
        userId: BigNumber.from(1),
      },
      {
        sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
        buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
        userId: BigNumber.from(2),
      },
    ];

    const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
      channelAuction,
      auctionInitParameters,
    );
    await startChannelAuction(channelAuction, auctionId);
    await placeOrdersForChannelAuction(
      channelAuction,
      sellOrders,
      auctionId,
      hre,
    );

    await closeChannelAuction(channelAuction, auctionId);
    await channelAuction.settleAuction(auctionId);
    await expect(
      channelAuction.claimFromParticipantOrder(auctionId, [
        encodeOrder(sellOrders[0]),
        encodeOrder(sellOrders[1]),
      ]),
    ).to.be.revertedWith("only allowed to claim for same user");
  });
  it("checks the claimed amounts are summed up correctly for two orders", async () => {
    const {
      auctioningToken,
      biddingToken,
    } = await createTokensAndMintAndApprove(
      channelAuction,
      [user_1, user_2, user_3],
      hre,
    );
    const auctionInitParameters = {
      auctioningToken,
      biddingToken,
      _auctionedSellAmount: ethers.utils.parseEther("1"),
      _auctioneerBuyAmountMinimum: ethers.utils.parseEther("1"),
      _auctioneerBuyAmountMaximum: ethers.utils.parseEther("20"),
      _auctioneerUserId: BigNumber.from(1),
    };
    const sellOrders = [
      {
        sellAmount: ethers.utils.parseEther("1").div(2).add(1),
        buyAmount: ethers.utils.parseEther("1").div(2),
        userId: BigNumber.from(1),
      },
      {
        sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
        buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
        userId: BigNumber.from(1),
      },
    ];

    const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
      channelAuction,
      auctionInitParameters,
    );
    await startChannelAuction(channelAuction, auctionId);

    await placeOrdersForChannelAuction(
      channelAuction,
      sellOrders,
      auctionId,
      hre,
    );

    await closeChannelAuction(channelAuction, auctionId);
    const { clearingOrder: price } = await calculateClearingPrice(
      channelAuction,
      auctionId,
    );
    await channelAuction.settleAuction(auctionId);

    const receivedAmounts = toReceivedFunds(
      await channelAuction.callStatic.claimFromParticipantOrder(auctionId, [
        encodeOrder(sellOrders[0]),
        encodeOrder(sellOrders[1]),
      ]),
    );
    expect(receivedAmounts.biddingTokenAmount).to.equal(
      sellOrders[0].sellAmount
        .add(sellOrders[1].sellAmount)
        .sub(
          auctionInitParameters._auctionedSellAmount
            .mul(price.sellAmount)
            .div(price.buyAmount),
        ),
    );
    expect(receivedAmounts.auctioningTokenAmount).to.equal(
      auctionInitParameters._auctionedSellAmount.sub(1),
    );
  });
  // describe("settleAuctionAtomically", async () => {
  //   it("can not settle atomically, if it is not allowed", async () => {
  //     const initialAuctionOrder = {
  //       sellAmount: ethers.utils.parseEther("1"),
  //       buyAmount: ethers.utils.parseEther("0.5"),
  //       userId: BigNumber.from(1),
  //     };
  //     const sellOrders = [
  //       {
  //         sellAmount: ethers.utils.parseEther("0.5"),
  //         buyAmount: ethers.utils.parseEther("0.5"),
  //         userId: BigNumber.from(1),
  //       },
  //     ];
  //     const atomicSellOrders = [
  //       {
  //         sellAmount: ethers.utils.parseEther("0.499"),
  //         buyAmount: ethers.utils.parseEther("0.4999"),
  //         userId: BigNumber.from(2),
  //       },
  //     ];
  //     const {
  //       auctioningToken,
  //       biddingToken,
  //     } = await createTokensAndMintAndApprove(
  //       channelAuction,
  //       [user_1, user_2],
  //       hre,
  //     );

  //     const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
  //       channelAuction,
  //       {
  //         auctioningToken,
  //         biddingToken,
  //         _auctionedSellAmount: initialAuctionOrder.sellAmount,
  //         _auctioneerBuyAmountMinimum: initialAuctionOrder.buyAmount,
  //         isAtomicClosureAllowed: false,
  //       },
  //     );
  //     await placeOrdersForChannelAuction(
  //       channelAuction,
  //       sellOrders,
  //       auctionId,
  //       hre,
  //     );

  //     await closeChannelAuction(channelAuction, auctionId);
  //     await expect(
  //       channelAuction.settleAuctionAtomically(
  //         auctionId,
  //         [atomicSellOrders[0].sellAmount],
  //         [atomicSellOrders[0].buyAmount],
  //         [queueStartElement],
  //         "0x",
  //       ),
  //     ).to.be.revertedWith("not allowed to settle auction atomically");
  //   });
  //   it("reverts, if more than one order is intended to be settled atomically", async () => {
  //     const initialAuctionOrder = {
  //       sellAmount: ethers.utils.parseEther("1"),
  //       buyAmount: ethers.utils.parseEther("0.5"),
  //       userId: BigNumber.from(1),
  //     };
  //     const sellOrders = [
  //       {
  //         sellAmount: ethers.utils.parseEther("0.5"),
  //         buyAmount: ethers.utils.parseEther("0.5"),
  //         userId: BigNumber.from(1),
  //       },
  //     ];
  //     const atomicSellOrders = [
  //       {
  //         sellAmount: ethers.utils.parseEther("0.49"),
  //         buyAmount: ethers.utils.parseEther("0.49"),
  //         userId: BigNumber.from(2),
  //       },
  //       {
  //         sellAmount: ethers.utils.parseEther("0.4"),
  //         buyAmount: ethers.utils.parseEther("0.4"),
  //         userId: BigNumber.from(2),
  //       },
  //     ];
  //     const {
  //       auctioningToken,
  //       biddingToken,
  //     } = await createTokensAndMintAndApprove(
  //       channelAuction,
  //       [user_1, user_2],
  //       hre,
  //     );

  //     const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
  //       channelAuction,
  //       {
  //         auctioningToken,
  //         biddingToken,
  //         _auctionedSellAmount: initialAuctionOrder.sellAmount,
  //         _auctioneerBuyAmountMinimum: initialAuctionOrder.buyAmount,
  //         isAtomicClosureAllowed: true,
  //       },
  //     );
  //     await placeOrdersForChannelAuction(
  //       channelAuction,
  //       sellOrders,
  //       auctionId,
  //       hre,
  //     );

  //     await closeChannelAuction(channelAuction, auctionId);
  //     await expect(
  //       channelAuction.settleAuctionAtomically(
  //         auctionId,
  //         [atomicSellOrders[0].sellAmount, atomicSellOrders[1].sellAmount],
  //         [atomicSellOrders[0].buyAmount, atomicSellOrders[1].buyAmount],
  //         [queueStartElement, queueStartElement],
  //         "0x",
  //       ),
  //     ).to.be.revertedWith("Only one order can be placed atomically");
  //   });
  //   it("can not settle atomically, if precalculateSellAmountSum was used", async () => {
  //     const initialAuctionOrder = {
  //       sellAmount: ethers.utils.parseEther("1"),
  //       buyAmount: ethers.utils.parseEther("0.5"),
  //       userId: BigNumber.from(1),
  //     };
  //     const sellOrders = [
  //       {
  //         sellAmount: ethers.utils.parseEther("0.5"),
  //         buyAmount: ethers.utils.parseEther("0.5"),
  //         userId: BigNumber.from(1),
  //       },
  //     ];
  //     const atomicSellOrders = [
  //       {
  //         sellAmount: ethers.utils.parseEther("0.499"),
  //         buyAmount: ethers.utils.parseEther("0.4999"),
  //         userId: BigNumber.from(2),
  //       },
  //     ];
  //     const {
  //       auctioningToken,
  //       biddingToken,
  //     } = await createTokensAndMintAndApprove(
  //       channelAuction,
  //       [user_1, user_2],
  //       hre,
  //     );

  //     const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
  //       channelAuction,
  //       {
  //         auctioningToken,
  //         biddingToken,
  //         _auctionedSellAmount: initialAuctionOrder.sellAmount,
  //         _auctioneerBuyAmountMinimum: initialAuctionOrder.buyAmount,
  //         isAtomicClosureAllowed: true,
  //       },
  //     );
  //     await placeOrdersForChannelAuction(
  //       channelAuction,
  //       sellOrders,
  //       auctionId,
  //       hre,
  //     );

  //     await closeChannelAuction(channelAuction, auctionId);
  //     await channelAuction.precalculateSellAmountSum(auctionId, 1);

  //     await expect(
  //       channelAuction.settleAuctionAtomically(
  //         auctionId,
  //         [atomicSellOrders[0].sellAmount],
  //         [atomicSellOrders[0].buyAmount],
  //         [queueStartElement],
  //         "0x",
  //       ),
  //     ).to.be.revertedWith("precalculateSellAmountSum is already too advanced");
  //   });
  //   it("allows an atomic settlement, if the precalculation are not yet beyond the price of the inserted order", async () => {
  //     const initialAuctionOrder = {
  //       sellAmount: ethers.utils.parseEther("1"),
  //       buyAmount: ethers.utils.parseEther("0.5"),
  //       userId: BigNumber.from(1),
  //     };
  //     const sellOrders = [
  //       {
  //         sellAmount: ethers.utils.parseEther("0.5"),
  //         buyAmount: ethers.utils.parseEther("0.5"),
  //         userId: BigNumber.from(1),
  //       },
  //     ];
  //     const atomicSellOrders = [
  //       {
  //         sellAmount: ethers.utils.parseEther("0.5"),
  //         buyAmount: ethers.utils.parseEther("0.55"),
  //         userId: BigNumber.from(1),
  //       },
  //     ];
  //     const {
  //       auctioningToken,
  //       biddingToken,
  //     } = await createTokensAndMintAndApprove(
  //       channelAuction,
  //       [user_1, user_2],
  //       hre,
  //     );

  //     const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
  //       channelAuction,
  //       {
  //         auctioningToken,
  //         biddingToken,
  //         _auctionedSellAmount: initialAuctionOrder.sellAmount,
  //         _auctioneerBuyAmountMinimum: initialAuctionOrder.buyAmount,
  //         isAtomicClosureAllowed: true,
  //       },
  //     );
  //     await placeOrdersForChannelAuction(
  //       channelAuction,
  //       sellOrders,
  //       auctionId,
  //       hre,
  //     );

  //     await closeChannelAuction(channelAuction, auctionId);
  //     await channelAuction.precalculateSellAmountSum(auctionId, 1);

  //     await channelAuction.settleAuctionAtomically(
  //       auctionId,
  //       [atomicSellOrders[0].buyAmount],
  //       [atomicSellOrders[0].sellAmount],
  //       [queueStartElement],
  //       "0x",
  //     );
  //     await claimFromAllOrders(channelAuction, auctionId, sellOrders);
  //     await claimFromAllOrders(channelAuction, auctionId, atomicSellOrders);
  //   });
  //   it("can settle atomically, if it is allowed", async () => {
  //     const initialAuctionOrder = {
  //       sellAmount: ethers.utils.parseEther("1"),
  //       buyAmount: ethers.utils.parseEther("0.5"),
  //       userId: BigNumber.from(1),
  //     };
  //     const sellOrders = [
  //       {
  //         sellAmount: ethers.utils.parseEther("0.5"),
  //         buyAmount: ethers.utils.parseEther("0.5"),
  //         userId: BigNumber.from(1),
  //       },
  //     ];
  //     const atomicSellOrders = [
  //       {
  //         sellAmount: ethers.utils.parseEther("0.4999"),
  //         buyAmount: ethers.utils.parseEther("0.4999"),
  //         userId: BigNumber.from(2),
  //       },
  //     ];
  //     const {
  //       auctioningToken,
  //       biddingToken,
  //     } = await createTokensAndMintAndApprove(
  //       channelAuction,
  //       [user_1, user_2],
  //       hre,
  //     );

  //     const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
  //       channelAuction,
  //       {
  //         auctioningToken,
  //         biddingToken,
  //         _auctionedSellAmount: initialAuctionOrder.sellAmount,
  //         _auctioneerBuyAmountMinimum: initialAuctionOrder.buyAmount,
  //         isAtomicClosureAllowed: true,
  //       },
  //     );
  //     await placeOrdersForChannelAuction(
  //       channelAuction,
  //       sellOrders,
  //       auctionId,
  //       hre,
  //     );

  //     await closeChannelAuction(channelAuction, auctionId);
  //     await channelAuction
  //       .connect(user_2)
  //       .settleAuctionAtomically(
  //         auctionId,
  //         [atomicSellOrders[0].sellAmount],
  //         [atomicSellOrders[0].buyAmount],
  //         [queueStartElement],
  //         "0x",
  //       );
  //     const auctionData = await channelAuction.auctionData(auctionId);
  //     expect(auctionData.clearingPriceOrder).to.equal(
  //       encodeOrder({
  //         sellAmount: sellOrders[0].sellAmount.add(
  //           atomicSellOrders[0].sellAmount,
  //         ),
  //         buyAmount: initialAuctionOrder.sellAmount,
  //         userId: BigNumber.from(0),
  //       }),
  //     );
  //   });
  //   it("can not settle auctions atomically, before auction finished", async () => {
  //     const initialAuctionOrder = {
  //       sellAmount: ethers.utils.parseEther("1"),
  //       buyAmount: ethers.utils.parseEther("0.5"),
  //       userId: BigNumber.from(1),
  //     };
  //     const sellOrders = [
  //       {
  //         sellAmount: ethers.utils.parseEther("0.5"),
  //         buyAmount: ethers.utils.parseEther("0.5"),
  //         userId: BigNumber.from(1),
  //       },
  //     ];
  //     const atomicSellOrders = [
  //       {
  //         sellAmount: ethers.utils.parseEther("0.4999"),
  //         buyAmount: ethers.utils.parseEther("0.4999"),
  //         userId: BigNumber.from(2),
  //       },
  //     ];
  //     const {
  //       auctioningToken,
  //       biddingToken,
  //     } = await createTokensAndMintAndApprove(
  //       channelAuction,
  //       [user_1, user_2],
  //       hre,
  //     );

  //     const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
  //       channelAuction,
  //       {
  //         auctioningToken,
  //         biddingToken,
  //         _auctionedSellAmount: initialAuctionOrder.sellAmount,
  //         _auctioneerBuyAmountMinimum: initialAuctionOrder.buyAmount,
  //         isAtomicClosureAllowed: true,
  //       },
  //     );
  //     await placeOrdersForChannelAuction(
  //       channelAuction,
  //       sellOrders,
  //       auctionId,
  //       hre,
  //     );

  //     await expect(
  //       channelAuction
  //         .connect(user_2)
  //         .settleAuctionAtomically(
  //           auctionId,
  //           [atomicSellOrders[0].sellAmount],
  //           [atomicSellOrders[0].buyAmount],
  //           [queueStartElement],
  //           "0x",
  //         ),
  //     ).to.be.revertedWith("Auction not in solution submission phase");
  //   });
  // });
  describe("registerUser", async () => {
    it("registers a user only once", async () => {
      await channelAuction.registerUser(user_1.address);
      await expect(
        channelAuction.registerUser(user_1.address),
      ).to.be.revertedWith("User already registered");
    });
  });
  describe("containsOrder", async () => {
    it("returns true, if it contains order", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createChannelAuctionWithDefaultsAndReturnId(
        channelAuction,
        {
          auctioningToken,
          biddingToken,
          _auctionedSellAmount: initialAuctionOrder.sellAmount,
          _auctioneerBuyAmountMinimum: initialAuctionOrder.buyAmount,
        },
      );
      await startChannelAuction(channelAuction, auctionId);
      await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );

      await closeChannelAuction(channelAuction, auctionId);
      expect(
        await channelAuction.callStatic.containsOrder(
          auctionId,
          encodeOrder(sellOrders[0]),
        ),
      ).to.be.equal(true);
    });
  });
  describe("transfers fees", async () => {
    it("transfers fees to feeReceiver", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        channelAuction,
        [user_1, user_2, user_3],
        hre,
      );
      const auctionInitParameters = {
        auctioningToken,
        biddingToken,
        _auctionedSellAmount: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMinimum: ethers.utils.parseEther("1"),
        _auctioneerBuyAmountMaximum: ethers.utils.parseEther("20"),
        _auctioneerUserId: BigNumber.from(1),
        _minimumBiddingAmount: ethers.utils.parseEther("0.01"),
      };
      let sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(1),
        },
      ];

      const feeReceiver = user_3;
      const feeNumerator = 4;
      await channelAuction
        .connect(user_1)
        .setFeeParameters(feeNumerator, feeReceiver.address);

      const now = (await ethers.provider.getBlock("latest")).timestamp;

      await expect(() =>
        channelAuction.initiateAuction(
          auctionInitParameters.auctioningToken.address,
          auctionInitParameters.biddingToken.address,
          auctionInitParameters._auctionedSellAmount,
          auctionInitParameters._auctioneerBuyAmountMinimum,
          auctionInitParameters._auctioneerBuyAmountMaximum,
          now + 3600,
          auctionInitParameters._minimumBiddingAmount,
          3600,
        ),
      ).to.changeTokenBalances(
        auctioningToken,
        [feeReceiver],
        [
          auctionInitParameters._auctionedSellAmount
            .mul(feeNumerator)
            .div("1000"),
        ],
      );
      const auctionId = BigNumber.from(1);
      await startChannelAuction(channelAuction, auctionId);
      sellOrders = await placeOrdersForChannelAuction(
        channelAuction,
        sellOrders,
        auctionId,
        hre,
      );

      await closeChannelAuction(channelAuction, auctionId);
      await channelAuction.settleAuction(auctionId);
      // contract still holds sufficient funds to pay the participants fully
      await channelAuction.callStatic.claimFromParticipantOrder(
        auctionId,
        sellOrders.map((order) => encodeOrder(order)),
      );
    });
  });
  describe("setFeeParameters", async () => {
    it("changing the paramter works", async () => {
      const feeReceiver = user_3;
      const feeNumerator = 4;
      await channelAuction
        .connect(user_1)
        .setFeeParameters(feeNumerator, feeReceiver.address);
      expect(await channelAuction.callStatic.feeNumerator()).to.be.equal(4);
    });
    it("can only be called by owner", async () => {
      const feeReceiver = user_3;
      const feeNumerator = 4;
      await expect(
        channelAuction
          .connect(user_2)
          .setFeeParameters(feeNumerator, feeReceiver.address),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("does not allow fees higher than 1.5%", async () => {
      const feeReceiver = user_3;
      const feeNumerator = 16;
      await expect(
        channelAuction
          .connect(user_1)
          .setFeeParameters(feeNumerator, feeReceiver.address),
      ).to.be.revertedWith("Fee is not allowed to be set higher than 0.5%");
    });
  });
});
