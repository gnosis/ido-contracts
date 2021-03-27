import { deployMockContract } from "@ethereum-waffle/mock-contract";
import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import hre, { artifacts, ethers, waffle } from "hardhat";
import "@nomiclabs/hardhat-ethers";

import {
  toReceivedFunds,
  encodeOrder,
  queueStartElement,
  createTokensAndMintAndApprove,
  placeOrders,
  calculateClearingPrice,
  getAllSellOrders,
  getClearingPriceFromInitialOrder,
} from "../../src/priceCalculation";

import {
  createAuctionWithDefaults,
  createAuctionWithDefaultsAndReturnId,
} from "./defaultContractInteractions";
import {
  sendTxAndGetReturnValue,
  closeAuction,
  increaseTime,
  claimFromAllOrders,
  MAGIC_VALUE_FROM_ALLOW_LIST_VERIFIER_INTERFACE,
} from "./utilities";

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Some tests use different test cases 1,..,10. These test cases are illustrated in the following jam board:
// https://jamboard.google.com/d/1DMgMYCQQzsSLKPq_hlK3l32JNBbRdIhsOrLB1oHaEYY/edit?usp=sharing
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("EasyAuction", async () => {
  const [user_1, user_2, user_3] = waffle.provider.getWallets();
  let easyAuction: Contract;
  beforeEach(async () => {
    const EasyAuction = await ethers.getContractFactory("EasyAuction");

    easyAuction = await EasyAuction.deploy();
  });
  describe("initiate Auction", async () => {
    it("throws if minimumBiddingAmountPerOrder is zero", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await expect(
        createAuctionWithDefaults(easyAuction, {
          auctioningToken,
          biddingToken,
          minimumBiddingAmountPerOrder: 0,
          minFundingThreshold: 0,
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
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await expect(
        createAuctionWithDefaults(easyAuction, {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: 0,
        }),
      ).to.be.revertedWith("cannot auction zero tokens");
    });
    it("throws if auction is a giveaway", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await expect(
        createAuctionWithDefaults(easyAuction, {
          auctioningToken,
          biddingToken,
          minBuyAmount: 0,
        }),
      ).to.be.revertedWith("tokens cannot be auctioned for free");
    });
    it("throws if auction periods do not make sense", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const now = (await ethers.provider.getBlock("latest")).timestamp;
      await expect(
        createAuctionWithDefaults(easyAuction, {
          auctioningToken,
          biddingToken,
          orderCancellationEndDate: now + 60 * 60 + 1,
          auctionEndDate: now + 60 * 60,
        }),
      ).to.be.revertedWith("time periods are not configured correctly");
    });
    it("throws if auction end is zero or in the past", async () => {
      // Important: if the auction end is zero, then the check at
      // `atStageSolutionSubmission` would always fail, leading to
      // locked funds in the contract.

      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await expect(
        createAuctionWithDefaults(easyAuction, {
          auctioningToken,
          biddingToken,
          orderCancellationEndDate: 0,
          auctionEndDate: 0,
        }),
      ).to.be.revertedWith("auction end date must be in the future");
    });
    it("initiateAuction stores the parameters correctly", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const orderCancellationEndDate = now + 42;
      const auctionEndDate = now + 1337;
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          orderCancellationEndDate,
          auctionEndDate,
        },
      );
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.auctioningToken).to.equal(auctioningToken.address);
      expect(auctionData.biddingToken).to.equal(biddingToken.address);
      expect(auctionData.initialAuctionOrder).to.equal(
        encodeOrder(initialAuctionOrder),
      );
      expect(auctionData.auctionEndDate).to.be.equal(auctionEndDate);
      expect(auctionData.orderCancellationEndDate).to.be.equal(
        orderCancellationEndDate,
      );
      await expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder({
          userId: BigNumber.from(0),
          sellAmount: ethers.utils.parseEther("0"),
          buyAmount: ethers.utils.parseEther("0"),
        }),
      );
      expect(auctionData.volumeClearingPriceOrder).to.be.equal(0);

      expect(await auctioningToken.balanceOf(easyAuction.address)).to.equal(
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
      ).to.equal(1);
      expect(
        await sendTxAndGetReturnValue(
          easyAuction,
          "getUserId(address)",
          user_2.address,
        ),
      ).to.equal(2);
      expect(
        await sendTxAndGetReturnValue(
          easyAuction,
          "getUserId(address)",
          user_1.address,
        ),
      ).to.equal(1);
    });
  });
  describe("placeOrdersOnBehalf", async () => {
    it("places a new order and checks that tokens were transferred", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          orderCancellationEndDate: now + 3600,
          auctionEndDate: now + 3600,
        },
      );

      const balanceBeforeOrderPlacement = await biddingToken.balanceOf(
        user_1.address,
      );
      const balanceBeforeOrderPlacementOfUser2 = await biddingToken.balanceOf(
        user_2.address,
      );
      const sellAmount = ethers.utils.parseEther("1").add(1);
      const buyAmount = ethers.utils.parseEther("1");

      await easyAuction
        .connect(user_1)
        .placeSellOrdersOnBehalf(
          auctionId,
          [buyAmount],
          [sellAmount],
          [queueStartElement],
          "0x",
          user_2.address,
        );

      expect(await biddingToken.balanceOf(easyAuction.address)).to.equal(
        sellAmount,
      );
      expect(await biddingToken.balanceOf(user_1.address)).to.equal(
        balanceBeforeOrderPlacement.sub(sellAmount),
      );
      expect(await biddingToken.balanceOf(user_2.address)).to.equal(
        balanceBeforeOrderPlacementOfUser2,
      );
      const userId = BigNumber.from(
        await easyAuction.callStatic.getUserId(user_2.address),
      );
      await easyAuction
        .connect(user_2)
        .cancelSellOrders(auctionId, [
          encodeOrder({ sellAmount, buyAmount, userId }),
        ]);
      expect(await biddingToken.balanceOf(easyAuction.address)).to.equal("0");
      expect(await biddingToken.balanceOf(user_2.address)).to.equal(
        balanceBeforeOrderPlacementOfUser2.add(sellAmount),
      );
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
          "0x",
        ),
      ).to.be.revertedWith("no longer in order placement phase");
    });
    it("one can not place orders, if auction is over", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
        },
      );
      await closeAuction(easyAuction, auctionId);
      await expect(
        easyAuction.placeSellOrders(
          0,
          [ethers.utils.parseEther("1")],
          [ethers.utils.parseEther("1").add(1)],
          [queueStartElement],
          "0x",
        ),
      ).to.be.revertedWith("no longer in order placement phase");
    });
    it("one can not place orders, with a worser or same rate", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
        },
      );
      await expect(
        easyAuction.placeSellOrders(
          auctionId,
          [ethers.utils.parseEther("1").add(1)],
          [ethers.utils.parseEther("1")],
          [queueStartElement],
          "0x",
        ),
      ).to.be.revertedWith("limit price not better than mimimal offer");
      await expect(
        easyAuction.placeSellOrders(
          auctionId,
          [ethers.utils.parseEther("1")],
          [ethers.utils.parseEther("1")],
          [queueStartElement],
          "0x",
        ),
      ).to.be.revertedWith("limit price not better than mimimal offer");
    });
    it("one can not place orders with buyAmount == 0", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
        },
      );
      await expect(
        easyAuction.placeSellOrders(
          auctionId,
          [ethers.utils.parseEther("0")],
          [ethers.utils.parseEther("1")],
          [queueStartElement],
          "0x",
        ),
      ).to.be.revertedWith("_minBuyAmounts must be greater than 0");
    });
    it("does not withdraw funds, if orders are placed twice", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
        },
      );
      await expect(() =>
        easyAuction.placeSellOrders(
          auctionId,
          [ethers.utils.parseEther("1").sub(1)],
          [ethers.utils.parseEther("1")],
          [queueStartElement],
          "0x",
        ),
      ).to.changeTokenBalances(
        biddingToken,
        [user_1],
        [ethers.utils.parseEther("-1")],
      );
      await expect(() =>
        easyAuction.placeSellOrders(
          auctionId,
          [ethers.utils.parseEther("1").sub(1)],
          [ethers.utils.parseEther("1")],
          [queueStartElement],
          "0x",
        ),
      ).to.changeTokenBalances(biddingToken, [user_1], [BigNumber.from(0)]);
    });
    it("places a new order and checks that tokens were transferred", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
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

      await easyAuction.placeSellOrders(
        auctionId,
        [buyAmount, buyAmount],
        [sellAmount, sellAmount.add(1)],
        [queueStartElement, queueStartElement],
        "0x",
      );
      const transferredbiddingTokenAmount = sellAmount.add(sellAmount.add(1));

      expect(await biddingToken.balanceOf(easyAuction.address)).to.equal(
        transferredbiddingTokenAmount,
      );
      expect(await biddingToken.balanceOf(user_1.address)).to.equal(
        balanceBeforeOrderPlacement.sub(transferredbiddingTokenAmount),
      );
    });
    it("order placement reverts, if order placer is not allowed", async () => {
      const verifier = await artifacts.readArtifact("AllowListVerifier");
      const verifierMocked = await deployMockContract(user_3, verifier.abi);
      await verifierMocked.mock.isAllowed.returns("0x00000000");
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          allowListManager: verifierMocked.address,
        },
      );

      const sellAmount = ethers.utils.parseEther("1").add(1);
      const buyAmount = ethers.utils.parseEther("1");
      await expect(
        easyAuction.placeSellOrders(
          auctionId,
          [buyAmount],
          [sellAmount],
          [queueStartElement],
          "0x",
        ),
      ).to.be.revertedWith("user not allowed to place order");
    });
    it("order placement reverts, if allow manager is an EOA", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          allowListManager: user_3.address,
        },
      );

      const sellAmount = ethers.utils.parseEther("1").add(1);
      const buyAmount = ethers.utils.parseEther("1");
      await expect(
        easyAuction.placeSellOrders(
          auctionId,
          [buyAmount],
          [sellAmount],
          [queueStartElement],
          "0x",
        ),
      ).to.be.revertedWith("function call to a non-contract account");
    });
    it("allow manager can not mutate state", async () => {
      const StateChangingAllowListManager = await ethers.getContractFactory(
        "StateChangingAllowListVerifier",
      );

      const stateChangingAllowListManager = await StateChangingAllowListManager.deploy();
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          allowListManager: stateChangingAllowListManager.address,
        },
      );

      const sellAmount = ethers.utils.parseEther("1").add(1);
      const buyAmount = ethers.utils.parseEther("1");
      expect(
        await stateChangingAllowListManager.callStatic.isAllowed(
          user_1.address,
          auctionId,
          "0x",
        ),
      ).to.be.equal(MAGIC_VALUE_FROM_ALLOW_LIST_VERIFIER_INTERFACE);
      await expect(
        easyAuction.placeSellOrders(
          auctionId,
          [buyAmount],
          [sellAmount],
          [queueStartElement],
          "0x",
        ),
      ).to.be.revertedWith(
        "Transaction reverted and Hardhat couldn't infer the reason. Please report this to help us improve Hardhat",
      );
    });

    it("order placement works, if order placer is allowed", async () => {
      const verifier = await artifacts.readArtifact("AllowListVerifier");
      const verifierMocked = await deployMockContract(user_3, verifier.abi);
      await verifierMocked.mock.isAllowed.returns(
        MAGIC_VALUE_FROM_ALLOW_LIST_VERIFIER_INTERFACE,
      );
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          allowListManager: verifierMocked.address,
        },
      );

      const sellAmount = ethers.utils.parseEther("1").add(1);
      const buyAmount = ethers.utils.parseEther("1");
      await expect(
        easyAuction.placeSellOrders(
          auctionId,
          [buyAmount],
          [sellAmount],
          [queueStartElement],
          "0x",
        ),
      ).to.emit(easyAuction, "NewSellOrder");
    });
    it("an order is only placed once", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
        },
      );

      const sellAmount = ethers.utils.parseEther("1").add(1);
      const buyAmount = ethers.utils.parseEther("1");

      await easyAuction.placeSellOrders(
        auctionId,
        [buyAmount],
        [sellAmount],
        [queueStartElement],
        "0x",
      );
      const allPlacedOrders = await getAllSellOrders(easyAuction, auctionId);
      expect(allPlacedOrders.length).to.be.equal(1);
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
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          minimumBiddingAmountPerOrder: ethers.utils.parseEther("1").div(100),
        },
      );
      await expect(
        easyAuction.placeSellOrders(
          auctionId,
          sellOrders.map((buyOrder) => buyOrder.buyAmount),
          sellOrders.map((buyOrder) => buyOrder.sellAmount),
          Array(sellOrders.length).fill(queueStartElement),
          "0x",
        ),
      ).to.be.revertedWith("order too small");
    });
    it("fails, if transfers are failing", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
        },
      );
      const sellAmount = ethers.utils.parseEther("1").add(1);
      const buyAmount = ethers.utils.parseEther("1");
      await biddingToken.approve(
        easyAuction.address,
        ethers.utils.parseEther("0"),
      );

      await expect(
        easyAuction.placeSellOrders(
          auctionId,
          [buyAmount, buyAmount],
          [sellAmount, sellAmount.add(1)],
          [queueStartElement, queueStartElement],
          "0x",
        ),
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
  });
  describe("precalculateSellAmountSum", async () => {
    it("fails if too many orders are considered", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
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
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      await expect(
        easyAuction.precalculateSellAmountSum(auctionId, 3),
      ).to.be.revertedWith("too many orders summed up");
    });
    it("fails if queue end is reached", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(2),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      await expect(
        easyAuction.precalculateSellAmountSum(auctionId, 2),
      ).to.be.revertedWith("reached end of order list");
    });
    it("verifies that interimSumBidAmount and iterOrder is set correctly", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
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
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);

      await easyAuction.precalculateSellAmountSum(auctionId, 1);
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.interimSumBidAmount).to.equal(
        sellOrders[0].sellAmount,
      );

      expect(auctionData.interimOrder).to.equal(encodeOrder(sellOrders[0]));
    });
    it("verifies that interimSumBidAmount and iterOrder takes correct starting values by applying twice", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(10),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(10),
          userId: BigNumber.from(2),
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
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);

      await easyAuction.precalculateSellAmountSum(auctionId, 1);
      await easyAuction.precalculateSellAmountSum(auctionId, 1);
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.interimSumBidAmount).to.equal(
        sellOrders[0].sellAmount.add(sellOrders[0].sellAmount),
      );

      expect(auctionData.interimOrder).to.equal(encodeOrder(sellOrders[1]));
    });
  });
  describe("settleAuction", async () => {
    it("checks case 4, it verifies the price in case of clearing order == initialAuctionOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(10),
          buyAmount: ethers.utils.parseEther("1").div(20),
          userId: BigNumber.from(1),
        },
      ];

      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await createAuctionWithDefaults(easyAuction, {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
      });

      const auctionId = BigNumber.from(1);
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);

      const { clearingOrder: price } = await calculateClearingPrice(
        easyAuction,
        auctionId,
      );
      await expect(easyAuction.settleAuction(auctionId))
        .to.emit(easyAuction, "AuctionCleared")
        .withArgs(
          auctionId,
          sellOrders[0].sellAmount.mul(price.buyAmount).div(price.sellAmount),
          sellOrders[0].sellAmount,
          encodeOrder(getClearingPriceFromInitialOrder(initialAuctionOrder)),
        );
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(encodeOrder(price));
    });
    it("checks case 4, it verifies the price in case of clearingOrder == initialAuctionOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("5"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.1"),
          buyAmount: ethers.utils.parseEther("0.1"),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await createAuctionWithDefaults(easyAuction, {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
      });
      const auctionId = BigNumber.from(1);
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);

      const { clearingOrder: price } = await calculateClearingPrice(
        easyAuction,
        auctionId,
      );
      await expect(easyAuction.settleAuction(auctionId))
        .to.emit(easyAuction, "AuctionCleared")
        .withArgs(
          auctionId,
          sellOrders[0].sellAmount.mul(price.buyAmount).div(price.sellAmount),
          sellOrders[0].sellAmount,
          encodeOrder(getClearingPriceFromInitialOrder(initialAuctionOrder)),
        );
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(encodeOrder(price));
      await claimFromAllOrders(easyAuction, auctionId, sellOrders);
    });
    it("checks case 4, it verifies the price in case of clearingOrder == initialAuctionOrder with 3 orders", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("2"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
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
        {
          sellAmount: ethers.utils.parseEther("0.1"),
          buyAmount: ethers.utils.parseEther("0.1"),
          userId: BigNumber.from(3),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, user_3],
        hre,
      );

      await createAuctionWithDefaults(easyAuction, {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
      });
      const auctionId = BigNumber.from(1);
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      const { clearingOrder: price } = await calculateClearingPrice(
        easyAuction,
        auctionId,
      );
      await expect(easyAuction.settleAuction(auctionId))
        .to.emit(easyAuction, "AuctionCleared")
        .withArgs(
          auctionId,
          sellOrders[0].sellAmount
            .mul(3)
            .mul(price.buyAmount)
            .div(price.sellAmount),
          sellOrders[0].sellAmount.mul(3),
          encodeOrder(getClearingPriceFromInitialOrder(initialAuctionOrder)),
        );
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder(getClearingPriceFromInitialOrder(initialAuctionOrder)),
      );
      await claimFromAllOrders(easyAuction, auctionId, sellOrders);
    });
    it("checks case 6, it verifies the price in case of clearingOrder == initialOrder, although last iterOrder would also be possible", async () => {
      // This test demonstrates the case 6,
      // where price could be either the auctioningOrder or sellOrder
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("500"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await createAuctionWithDefaults(easyAuction, {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
      });
      const auctionId = BigNumber.from(1);
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);

      await expect(easyAuction.settleAuction(auctionId))
        .to.emit(easyAuction, "AuctionCleared")
        .withArgs(
          auctionId,
          initialAuctionOrder.sellAmount,
          sellOrders[0].sellAmount,
          encodeOrder(getClearingPriceFromInitialOrder(initialAuctionOrder)),
        );
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder(getClearingPriceFromInitialOrder(initialAuctionOrder)),
      );
      await easyAuction.claimFromParticipantOrder(
        auctionId,
        sellOrders.map((order) => encodeOrder(order)),
      );
    });
    it("checks case 12, it verifies that price can not be the initial auction price (Adam's case)", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1").add(1),
        buyAmount: ethers.utils.parseEther("0.1"),
        userId: BigNumber.from(1),
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
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await createAuctionWithDefaults(easyAuction, {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
      });
      const auctionId = BigNumber.from(1);
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);

      await easyAuction.settleAuction(auctionId);
      await easyAuction.auctionData(auctionId);
      await claimFromAllOrders(easyAuction, auctionId, sellOrders);
    });
    it("checks case 3, it verifies the price in case of clearingOrder != placed order with 3x participation", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("500"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
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

      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, user_3],
        hre,
      );

      await createAuctionWithDefaults(easyAuction, {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
      });
      const auctionId = BigNumber.from(1);
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);

      await easyAuction.settleAuction(auctionId);
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder({
          sellAmount: ethers.utils.parseEther("3"),
          buyAmount: initialAuctionOrder.sellAmount,
          userId: BigNumber.from(0),
        }),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(0);
      await claimFromAllOrders(easyAuction, auctionId, sellOrders);
    });
    it("checks case 8, it verifies the price in case of no participation of the auction", async () => {
      const initialAuctionOrder = {
        sellAmount: BigNumber.from(1000),
        buyAmount: BigNumber.from(1000),
        userId: BigNumber.from(1),
      };

      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      await createAuctionWithDefaults(easyAuction, {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
      });
      const auctionId = BigNumber.from(1);

      await closeAuction(easyAuction, auctionId);

      await easyAuction.settleAuction(auctionId);
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder(getClearingPriceFromInitialOrder(initialAuctionOrder)),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(BigNumber.from(0));
    });
    it("checks case 2, it verifies the price in case without a partially filled order", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
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
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      await easyAuction.settleAuction(auctionId);
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder({
          sellAmount: sellOrders[0].sellAmount,
          buyAmount: initialAuctionOrder.sellAmount,
          userId: BigNumber.from(0),
        }),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(0);
      await claimFromAllOrders(easyAuction, auctionId, sellOrders);
    });
    it("checks case 10, verifies the price in case one sellOrder is eating initialAuctionOrder completely", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").mul(20),
          buyAmount: ethers.utils.parseEther("1").mul(10),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      await easyAuction.settleAuction(auctionId);
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder(sellOrders[0]),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(
        initialAuctionOrder.sellAmount
          .mul(sellOrders[0].sellAmount)
          .div(sellOrders[0].buyAmount),
      );
      await claimFromAllOrders(easyAuction, auctionId, sellOrders);
    });
    it("checks case 5, bidding amount matches min buyAmount of initialOrder perfectly", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(1),
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
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, user_3],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      await easyAuction.settleAuction(auctionId);
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.eql(encodeOrder(sellOrders[1]));
      expect(auctionData.volumeClearingPriceOrder).to.equal(
        sellOrders[1].sellAmount,
      );
      await expect(() =>
        easyAuction.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[0]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_2],
        [sellOrders[0].sellAmount],
      );
      await expect(() =>
        easyAuction.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[1]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_3],
        [sellOrders[1].sellAmount],
      );
    });
    it("checks case 7, bidding amount matches min buyAmount of initialOrder perfectly with additional order", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(1),
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
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, user_3],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      await easyAuction.settleAuction(auctionId);
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.eql(encodeOrder(sellOrders[1]));
      expect(auctionData.volumeClearingPriceOrder).to.equal(
        sellOrders[1].sellAmount,
      );
      await expect(() =>
        easyAuction.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[0]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_2],
        [sellOrders[0].sellAmount],
      );
      await expect(() =>
        easyAuction.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[1]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_3],
        [sellOrders[1].sellAmount],
      );
      await expect(() =>
        easyAuction.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[2]),
        ]),
      ).to.changeTokenBalances(
        biddingToken,
        [user_3],
        [sellOrders[2].sellAmount],
      );
    });
    it("checks case 10: it shows an example why userId should always be given: 2 orders with the same price", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(1),
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
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, user_3],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      await easyAuction.settleAuction(auctionId);
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder(sellOrders[0]),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(
        sellOrders[1].sellAmount,
      );
      await expect(() =>
        easyAuction.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[0]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_2],
        [sellOrders[0].sellAmount],
      );
      await expect(() =>
        easyAuction.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[1]),
        ]),
      ).to.changeTokenBalances(
        biddingToken,
        [user_3],
        [sellOrders[1].sellAmount],
      );
      await expect(() =>
        easyAuction.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[2]),
        ]),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_3],
        [sellOrders[2].sellAmount],
      );
    });
    it("checks case 1, it verifies the price in case of 2 of 3 sellOrders eating initialAuctionOrder completely", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
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
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      await easyAuction.settleAuction(auctionId);
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.eql(encodeOrder(sellOrders[1]));
      expect(auctionData.volumeClearingPriceOrder).to.equal(0);
      await claimFromAllOrders(easyAuction, auctionId, sellOrders);
    });
    it("verifies the price in case of 2 of 3 sellOrders eating initialAuctionOrder completely - with precalculateSellAmountSum step", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
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
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      // this is the additional step
      await easyAuction.precalculateSellAmountSum(auctionId, 1);

      await easyAuction.settleAuction(auctionId);
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.eql(encodeOrder(sellOrders[1]));
      expect(auctionData.volumeClearingPriceOrder).to.equal(0);
    });
    it("verifies the price in case of 2 of 4 sellOrders eating initialAuctionOrder completely - with precalculateSellAmountSum step and one more step within settleAuction", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(5),
          userId: BigNumber.from(2),
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
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      // this is the additional step
      await easyAuction.precalculateSellAmountSum(auctionId, 1);

      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.interimSumBidAmount).to.equal(
        sellOrders[0].sellAmount,
      );
      expect(auctionData.interimOrder).to.equal(encodeOrder(sellOrders[0]));
      await easyAuction.settleAuction(auctionId);
      const auctionData2 = await easyAuction.auctionData(auctionId);
      expect(auctionData2.clearingPriceOrder).to.eql(
        encodeOrder(sellOrders[2]),
      );
      expect(auctionData2.volumeClearingPriceOrder).to.equal(0);
      await claimFromAllOrders(easyAuction, auctionId, sellOrders);
    });
    it("verifies the price in case of clearing order is decided by userId", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
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
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      await easyAuction.settleAuction(auctionId);
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.be.equal(
        encodeOrder(sellOrders[1]),
      );
      expect(auctionData.volumeClearingPriceOrder).to.equal(0);
      await claimFromAllOrders(easyAuction, auctionId, sellOrders);
    });
    it("simple version of e2e gas test", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(4),
          buyAmount: ethers.utils.parseEther("1").div(8),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").div(4),
          buyAmount: ethers.utils.parseEther("1").div(12),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").div(4),
          buyAmount: ethers.utils.parseEther("1").div(16),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1").div(4),
          buyAmount: ethers.utils.parseEther("1").div(20),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      const { clearingOrder: price } = await calculateClearingPrice(
        easyAuction,
        auctionId,
      );

      await easyAuction.settleAuction(auctionId);
      expect(price.toString()).to.eql(
        getClearingPriceFromInitialOrder(initialAuctionOrder).toString(),
      );
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder(getClearingPriceFromInitialOrder(initialAuctionOrder)),
      );
      await claimFromAllOrders(easyAuction, auctionId, sellOrders);
    });
    it("checks whether the minimalFundingThreshold is not met", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("10"),
        buyAmount: ethers.utils.parseEther("10"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(1),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(4),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          minFundingThreshold: ethers.utils.parseEther("5"),
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      const { clearingOrder: price } = await calculateClearingPrice(
        easyAuction,
        auctionId,
      );

      await easyAuction.settleAuction(auctionId);
      expect(price.toString()).to.eql(
        getClearingPriceFromInitialOrder(initialAuctionOrder).toString(),
      );
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.minFundingThresholdNotReached).to.equal(true);
    });
  });
  describe("claimFromAuctioneerOrder", async () => {
    it("checks that auctioneer receives all their auctioningTokens back if minFundingThreshold was not met", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("10"),
        buyAmount: ethers.utils.parseEther("10"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(4),
          userId: BigNumber.from(3),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, user_3],
        hre,
      );
      const auctioningTokenBalanceBeforeAuction = await auctioningToken.balanceOf(
        user_1.address,
      );
      const feeReceiver = user_3;
      const feeNumerator = 10;
      await easyAuction
        .connect(user_1)
        .setFeeParameters(feeNumerator, feeReceiver.address);
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          minFundingThreshold: ethers.utils.parseEther("5"),
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);
      await closeAuction(easyAuction, auctionId);
      await easyAuction.settleAuction(auctionId);
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.minFundingThresholdNotReached).to.equal(true);
      expect(await auctioningToken.balanceOf(user_1.address)).to.be.equal(
        auctioningTokenBalanceBeforeAuction,
      );
    });
    it("checks the claimed amounts for a fully matched initialAuctionOrder and buyOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").add(1),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      const { clearingOrder: price } = await calculateClearingPrice(
        easyAuction,
        auctionId,
      );
      const callPromise = easyAuction.settleAuction(auctionId);
      // auctioneer reward check:
      await expect(() => callPromise).to.changeTokenBalances(
        auctioningToken,
        [user_1],
        [0],
      );
      await expect(callPromise)
        .to.emit(biddingToken, "Transfer")
        .withArgs(easyAuction.address, user_1.address, price.sellAmount);
    });
    it("checks the claimed amounts for a partially matched initialAuctionOrder and buyOrder", async () => {
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
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      const callPromise = easyAuction.settleAuction(auctionId);
      // auctioneer reward check:
      await expect(callPromise)
        .to.emit(auctioningToken, "Transfer")
        .withArgs(
          easyAuction.address,
          user_1.address,
          initialAuctionOrder.sellAmount.sub(sellOrders[0].sellAmount),
        );
      await expect(callPromise)
        .to.emit(biddingToken, "Transfer")
        .withArgs(
          easyAuction.address,
          user_1.address,
          sellOrders[0].sellAmount,
        );
    });
  });
  describe("claimFromParticipantOrder", async () => {
    it("checks that participant receives all their biddingTokens back if minFundingThreshold was not met", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("10"),
        buyAmount: ethers.utils.parseEther("10"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("1"),
          buyAmount: ethers.utils.parseEther("1").div(4),
          userId: BigNumber.from(2),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          minFundingThreshold: ethers.utils.parseEther("5"),
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      await easyAuction.settleAuction(auctionId);
      await expect(() =>
        easyAuction.claimFromParticipantOrder(
          auctionId,
          sellOrders.map((order) => encodeOrder(order)),
        ),
      ).to.changeTokenBalances(
        biddingToken,
        [user_2],
        [sellOrders[0].sellAmount.add(sellOrders[1].sellAmount)],
      );
    });
    it("checks that claiming only works after the finishing of the auction", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").add(1),
          buyAmount: ethers.utils.parseEther("1"),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await expect(
        easyAuction.claimFromParticipantOrder(
          auctionId,
          sellOrders.map((order) => encodeOrder(order)),
        ),
      ).to.be.revertedWith("Auction not yet finished");
      await closeAuction(easyAuction, auctionId);
      await expect(
        easyAuction.claimFromParticipantOrder(
          auctionId,
          sellOrders.map((order) => encodeOrder(order)),
        ),
      ).to.be.revertedWith("Auction not yet finished");
    });
    it("checks the claimed amounts for a partially matched buyOrder", async () => {
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
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      const { clearingOrder: price } = await calculateClearingPrice(
        easyAuction,
        auctionId,
      );
      await easyAuction.settleAuction(auctionId);

      const receivedAmounts = toReceivedFunds(
        await easyAuction.callStatic.claimFromParticipantOrder(auctionId, [
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
            .sub(initialAuctionOrder.sellAmount),
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
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);
      await closeAuction(easyAuction, auctionId);
      await easyAuction.settleAuction(auctionId);
      const receivedAmounts = toReceivedFunds(
        await easyAuction.callStatic.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[2]),
        ]),
      );
      expect(receivedAmounts.biddingTokenAmount).to.equal(
        sellOrders[2].sellAmount,
      );
      expect(receivedAmounts.auctioningTokenAmount).to.equal("0");
    });
    it("checks the claimed amounts for a fully matched buyOrder", async () => {
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
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      const { clearingOrder: price } = await calculateClearingPrice(
        easyAuction,
        auctionId,
      );
      await easyAuction.settleAuction(auctionId);

      const receivedAmounts = toReceivedFunds(
        await easyAuction.callStatic.claimFromParticipantOrder(auctionId, [
          encodeOrder(sellOrders[0]),
        ]),
      );
      expect(receivedAmounts.biddingTokenAmount).to.equal("0");
      expect(receivedAmounts.auctioningTokenAmount).to.equal(
        sellOrders[0].sellAmount.mul(price.buyAmount).div(price.sellAmount),
      );
    });
    it("checks that an order can not be used for claiming twice", async () => {
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
        {
          sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
          buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      await easyAuction.settleAuction(auctionId);
      await easyAuction.claimFromParticipantOrder(auctionId, [
        encodeOrder(sellOrders[0]),
      ]),
        await expect(
          easyAuction.claimFromParticipantOrder(auctionId, [
            encodeOrder(sellOrders[0]),
          ]),
        ).to.be.revertedWith("order is no longer claimable");
    });
  });
  it("checks that orders from different users can not be claimed at once", async () => {
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
      {
        sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
        buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
        userId: BigNumber.from(2),
      },
    ];
    const {
      auctioningToken,
      biddingToken,
    } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2], hre);

    const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
      easyAuction,
      {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
      },
    );
    await placeOrders(easyAuction, sellOrders, auctionId, hre);

    await closeAuction(easyAuction, auctionId);
    await easyAuction.settleAuction(auctionId);
    await expect(
      easyAuction.claimFromParticipantOrder(auctionId, [
        encodeOrder(sellOrders[0]),
        encodeOrder(sellOrders[1]),
      ]),
    ).to.be.revertedWith("only allowed to claim for same user");
  });
  it("checks the claimed amounts are summed up correctly for two orders", async () => {
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
      {
        sellAmount: ethers.utils.parseEther("1").mul(2).div(3).add(1),
        buyAmount: ethers.utils.parseEther("1").mul(2).div(3),
        userId: BigNumber.from(1),
      },
    ];
    const {
      auctioningToken,
      biddingToken,
    } = await createTokensAndMintAndApprove(easyAuction, [user_1, user_2], hre);

    const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
      easyAuction,
      {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
      },
    );
    await placeOrders(easyAuction, sellOrders, auctionId, hre);

    await closeAuction(easyAuction, auctionId);
    const { clearingOrder: price } = await calculateClearingPrice(
      easyAuction,
      auctionId,
    );
    await easyAuction.settleAuction(auctionId);

    const receivedAmounts = toReceivedFunds(
      await easyAuction.callStatic.claimFromParticipantOrder(auctionId, [
        encodeOrder(sellOrders[0]),
        encodeOrder(sellOrders[1]),
      ]),
    );
    expect(receivedAmounts.biddingTokenAmount).to.equal(
      sellOrders[0].sellAmount
        .add(sellOrders[1].sellAmount)
        .sub(
          initialAuctionOrder.sellAmount
            .mul(price.sellAmount)
            .div(price.buyAmount),
        ),
    );
    expect(receivedAmounts.auctioningTokenAmount).to.equal(
      initialAuctionOrder.sellAmount.sub(1),
    );
  });
  describe("settleAuctionAtomically", async () => {
    it("can not settle atomically, if it is not allowed", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(1),
        },
      ];
      const atomicSellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.499"),
          buyAmount: ethers.utils.parseEther("0.4999"),
          userId: BigNumber.from(2),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          isAtomicClosureAllowed: false,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      await expect(
        easyAuction.settleAuctionAtomically(
          auctionId,
          [atomicSellOrders[0].sellAmount],
          [atomicSellOrders[0].buyAmount],
          [queueStartElement],
          "0x",
        ),
      ).to.be.revertedWith("not allowed to settle auction atomically");
    });
    it("reverts, if more than one order is intended to be settled atomically", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(1),
        },
      ];
      const atomicSellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.49"),
          buyAmount: ethers.utils.parseEther("0.49"),
          userId: BigNumber.from(2),
        },
        {
          sellAmount: ethers.utils.parseEther("0.4"),
          buyAmount: ethers.utils.parseEther("0.4"),
          userId: BigNumber.from(2),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          isAtomicClosureAllowed: true,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      await expect(
        easyAuction.settleAuctionAtomically(
          auctionId,
          [atomicSellOrders[0].sellAmount, atomicSellOrders[1].sellAmount],
          [atomicSellOrders[0].buyAmount, atomicSellOrders[1].buyAmount],
          [queueStartElement, queueStartElement],
          "0x",
        ),
      ).to.be.revertedWith("Only one order can be placed atomically");
    });
    it("can not settle atomically, if precalculateSellAmountSum was used", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(1),
        },
      ];
      const atomicSellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.499"),
          buyAmount: ethers.utils.parseEther("0.4999"),
          userId: BigNumber.from(2),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          isAtomicClosureAllowed: true,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      await easyAuction.precalculateSellAmountSum(auctionId, 1);

      await expect(
        easyAuction.settleAuctionAtomically(
          auctionId,
          [atomicSellOrders[0].sellAmount],
          [atomicSellOrders[0].buyAmount],
          [queueStartElement],
          "0x",
        ),
      ).to.be.revertedWith("precalculateSellAmountSum is already too advanced");
    });
    it("allows an atomic settlement, if the precalculation are not yet beyond the price of the inserted order", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(1),
        },
      ];
      const atomicSellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.55"),
          userId: BigNumber.from(1),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          isAtomicClosureAllowed: true,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      await easyAuction.precalculateSellAmountSum(auctionId, 1);

      await easyAuction.settleAuctionAtomically(
        auctionId,
        [atomicSellOrders[0].buyAmount],
        [atomicSellOrders[0].sellAmount],
        [queueStartElement],
        "0x",
      );
      await claimFromAllOrders(easyAuction, auctionId, sellOrders);
      await claimFromAllOrders(easyAuction, auctionId, atomicSellOrders);
    });
    it("can settle atomically, if it is allowed", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(1),
        },
      ];
      const atomicSellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.4999"),
          buyAmount: ethers.utils.parseEther("0.4999"),
          userId: BigNumber.from(2),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          isAtomicClosureAllowed: true,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      await easyAuction
        .connect(user_2)
        .settleAuctionAtomically(
          auctionId,
          [atomicSellOrders[0].sellAmount],
          [atomicSellOrders[0].buyAmount],
          [queueStartElement],
          "0x",
        );
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder({
          sellAmount: sellOrders[0].sellAmount.add(
            atomicSellOrders[0].sellAmount,
          ),
          buyAmount: initialAuctionOrder.sellAmount,
          userId: BigNumber.from(0),
        }),
      );
    });
    it("can not settle auctions atomically, before auction finished", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(1),
        },
      ];
      const atomicSellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.4999"),
          buyAmount: ethers.utils.parseEther("0.4999"),
          userId: BigNumber.from(2),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          isAtomicClosureAllowed: true,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await expect(
        easyAuction
          .connect(user_2)
          .settleAuctionAtomically(
            auctionId,
            [atomicSellOrders[0].sellAmount],
            [atomicSellOrders[0].buyAmount],
            [queueStartElement],
            "0x",
          ),
      ).to.be.revertedWith("Auction not in solution submission phase");
    });
  });
  describe("registerUser", async () => {
    it("registers a user only once", async () => {
      await easyAuction.registerUser(user_1.address);
      await expect(easyAuction.registerUser(user_1.address)).to.be.revertedWith(
        "User already registered",
      );
    });
  });
  describe("cancelOrder", async () => {
    it("cancels an order", async () => {
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
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await expect(
        easyAuction.cancelSellOrders(auctionId, [encodeOrder(sellOrders[0])]),
      )
        .to.emit(biddingToken, "Transfer")
        .withArgs(
          easyAuction.address,
          user_1.address,
          sellOrders[0].sellAmount,
        );
    });
    it("does not allow to cancel a order, if it is too late", async () => {
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
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          orderCancellationEndDate: now + 60 * 60,
          auctionEndDate: now + 60 * 60 * 60,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await increaseTime(3601);
      await expect(
        easyAuction.cancelSellOrders(auctionId, [encodeOrder(sellOrders[0])]),
      ).to.be.revertedWith(
        "revert no longer in order placement and cancelation phase",
      );
      await closeAuction(easyAuction, auctionId);
      await expect(
        easyAuction.cancelSellOrders(auctionId, [encodeOrder(sellOrders[0])]),
      ).to.be.revertedWith(
        "revert no longer in order placement and cancelation phase",
      );
    });
    it("can't cancel orders twice", async () => {
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
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      // removes the order
      easyAuction.cancelSellOrders(auctionId, [encodeOrder(sellOrders[0])]);
      // claims 0 sellAmount tokens
      await expect(
        easyAuction.cancelSellOrders(auctionId, [encodeOrder(sellOrders[0])]),
      )
        .to.emit(biddingToken, "Transfer")
        .withArgs(easyAuction.address, user_1.address, 0);
    });
    it("prevents an order from canceling, if tx is not from owner", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(2).add(1),
          buyAmount: ethers.utils.parseEther("1").div(2),
          userId: BigNumber.from(2),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await expect(
        easyAuction.cancelSellOrders(auctionId, [encodeOrder(sellOrders[0])]),
      ).to.be.revertedWith("Only the user can cancel his orders");
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
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

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
        userId: BigNumber.from(1),
      };
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await closeAuction(easyAuction, auctionId);
      expect(
        await easyAuction.callStatic.getSecondsRemainingInBatch(auctionId),
      ).to.be.equal("0");
    });
  });
  describe("claimsFee", async () => {
    it("claims fees fully for a non-partially filled initialAuctionOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
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
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, user_3],
        hre,
      );

      const feeReceiver = user_3;
      const feeNumerator = 10;
      await easyAuction
        .connect(user_1)
        .setFeeParameters(feeNumerator, feeReceiver.address);

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);
      // resets the userId, as they are only given during function call.
      sellOrders = await getAllSellOrders(easyAuction, auctionId);

      await closeAuction(easyAuction, auctionId);
      await expect(() =>
        easyAuction.settleAuction(auctionId),
      ).to.changeTokenBalances(
        auctioningToken,
        [feeReceiver],
        [initialAuctionOrder.sellAmount.mul(feeNumerator).div("1000")],
      );

      // contract still holds sufficient funds to pay the participants fully
      await easyAuction.callStatic.claimFromParticipantOrder(
        auctionId,
        sellOrders.map((order) => encodeOrder(order)),
      );
    });
    it("claims also fee amount of zero, even when it is changed later", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
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
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, user_3],
        hre,
      );

      const feeReceiver = user_3;
      const feeNumerator = 0;
      await easyAuction
        .connect(user_1)
        .setFeeParameters(feeNumerator, feeReceiver.address);

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);
      // resets the userId, as they are only given during function call.
      sellOrders = await getAllSellOrders(easyAuction, auctionId);
      await easyAuction
        .connect(user_1)
        .setFeeParameters(10, feeReceiver.address);

      await closeAuction(easyAuction, auctionId);
      await expect(() =>
        easyAuction.settleAuction(auctionId),
      ).to.changeTokenBalances(
        auctioningToken,
        [feeReceiver],
        [BigNumber.from(0)],
      );

      // contract still holds sufficient funds to pay the participants fully
      await easyAuction.callStatic.claimFromParticipantOrder(
        auctionId,
        sellOrders.map((order) => encodeOrder(order)),
      );
    });
    it("claims fees fully for a partially filled initialAuctionOrder", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      let sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(4),
          buyAmount: ethers.utils.parseEther("1").div(4).sub(1),
          userId: BigNumber.from(3),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, user_3],
        hre,
      );

      const feeReceiver = user_3;
      const feeNumerator = 10;
      await easyAuction
        .connect(user_1)
        .setFeeParameters(feeNumerator, feeReceiver.address);

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);
      // resets the userId, as they are only given during function call.
      sellOrders = await getAllSellOrders(easyAuction, auctionId);

      await closeAuction(easyAuction, auctionId);
      await expect(() =>
        easyAuction.settleAuction(auctionId),
      ).to.changeTokenBalances(
        auctioningToken,
        [user_1, feeReceiver],
        [
          // since only 1/4th of the tokens were sold, the auctioneer
          // is getting 3/4th of the tokens plus 3/4th of the fee back
          initialAuctionOrder.sellAmount
            .mul(3)
            .div(4)
            .add(
              initialAuctionOrder.sellAmount
                .mul(feeNumerator)
                .div("1000")
                .mul(3)
                .div(4),
            ),
          initialAuctionOrder.sellAmount.mul(feeNumerator).div("1000").div(4),
        ],
      );
      // contract still holds sufficient funds to pay the participants fully
      await easyAuction.callStatic.claimFromParticipantOrder(
        auctionId,
        sellOrders.map((order) => encodeOrder(order)),
      );
    });
  });
  describe("setFeeParameters", async () => {
    it("can only be called by owner", async () => {
      const feeReceiver = user_3;
      const feeNumerator = 10;
      await expect(
        easyAuction
          .connect(user_2)
          .setFeeParameters(feeNumerator, feeReceiver.address),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("does not allow fees higher than 1.5%", async () => {
      const feeReceiver = user_3;
      const feeNumerator = 16;
      await expect(
        easyAuction
          .connect(user_1)
          .setFeeParameters(feeNumerator, feeReceiver.address),
      ).to.be.revertedWith("Fee is not allowed to be set higher than 1.5%");
    });
  });
});
