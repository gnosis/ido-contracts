/// This file does not represent extensive unit tests, but rather just demonstrates an example
import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import hre, { ethers, waffle } from "hardhat";
import "@nomiclabs/hardhat-ethers";

import {
  queueStartElement,
  createTokensAndMintAndApprove,
} from "../../src/priceCalculation";
import { domain } from "../../src/tasks/utils";

import { createAuctionWithDefaults } from "./defaultContractInteractions";

describe("AccessManager - integration tests", async () => {
  const [user_1, user_2] = waffle.provider.getWallets();
  let easyAuction: Contract;
  let allowListManager: Contract;
  let testDomain: any;
  beforeEach(async () => {
    const EasyAuction = await ethers.getContractFactory("EasyAuction");

    easyAuction = await EasyAuction.deploy();
    const AllowListManger = await ethers.getContractFactory(
      "AllowListOffChainManaged",
    );
    allowListManager = await AllowListManger.deploy();
    const { chainId } = await ethers.provider.getNetwork();
    testDomain = domain(chainId, allowListManager.address);
  });
  describe("domainSeparator", () => {
    it("should have an EIP-712 domain separator", async () => {
      expect(await allowListManager.domainSeparator()).to.equal(
        ethers.utils._TypedDataEncoder.hashDomain(testDomain),
      );
    });
  });
  describe("AccessManager - placing order in easyAuction with auctioneer signature", async () => {
    it("integration test: places a new order and checks that tokens were transferred - with whitelisting", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );
      const auctionId: BigNumber = await createAuctionWithDefaults(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          allowListManager: allowListManager.address,
        },
      );

      const auctioneerMessage = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["bytes32", "address", "uint256"],
          [
            ethers.utils._TypedDataEncoder.hashDomain(testDomain),
            user_2.address,
            auctionId,
          ],
        ),
      );
      const auctioneerSignature = await user_1.signMessage(
        ethers.utils.arrayify(auctioneerMessage),
      );
      const sig = ethers.utils.splitSignature(auctioneerSignature);
      const auctioneerSignatureEncoded = ethers.utils.defaultAbiCoder.encode(
        ["uint8", "bytes32", "bytes32"],
        [sig.v, sig.r, sig.s],
      );

      const balanceBeforeOrderPlacement = await biddingToken
        .connect(user_2)
        .balanceOf(user_1.address);
      const sellAmount = ethers.utils.parseEther("1").add(1);
      const buyAmount = ethers.utils.parseEther("1");

      await easyAuction
        .connect(user_2)
        .placeSellOrders(
          auctionId,
          [buyAmount, buyAmount],
          [sellAmount, sellAmount.add(1)],
          [queueStartElement, queueStartElement],
          auctioneerSignatureEncoded,
        );
      const transferredbiddingTokenAmount = sellAmount.add(sellAmount.add(1));

      expect(
        await biddingToken.connect(user_2).balanceOf(easyAuction.address),
      ).to.equal(transferredbiddingTokenAmount);
      expect(
        await biddingToken.connect(user_2).balanceOf(user_2.address),
      ).to.equal(
        balanceBeforeOrderPlacement.sub(transferredbiddingTokenAmount),
      );
    });
    it("integration test: places a new order and checks that allowListing prevents the tx", async () => {
      const AllowListManager = await ethers.getContractFactory(
        "AllowListOffChainManaged",
      );

      const allowListManager = await AllowListManager.deploy();
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );
      const auctionId: BigNumber = await createAuctionWithDefaults(
        easyAuction,
        {
          auctioningToken,
          biddingToken,
          allowListManager: allowListManager.address,
        },
      );

      const { chainId } = await ethers.provider.getNetwork();
      const testDomain = domain(chainId, allowListManager.address);
      const auctioneerMessage = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ["bytes32", "address", "uint256"],
          [
            ethers.utils._TypedDataEncoder.hashDomain(testDomain),
            user_2.address,
            auctionId,
          ],
        ),
      );
      // Signature will come from a wrong user: user_2 != owner of allowListManger;
      const auctioneerSignature = await user_2.signMessage(
        ethers.utils.arrayify(auctioneerMessage),
      );
      const sig = ethers.utils.splitSignature(auctioneerSignature);
      const auctioneerSignatureEncoded = ethers.utils.defaultAbiCoder.encode(
        ["uint8", "bytes32", "bytes32"],
        [sig.v, sig.r, sig.s],
      );

      const sellAmount = ethers.utils.parseEther("1").add(1);
      const buyAmount = ethers.utils.parseEther("1");
      await expect(
        easyAuction.placeSellOrders(
          auctionId,
          [buyAmount, buyAmount],
          [sellAmount, sellAmount.add(1)],
          [queueStartElement, queueStartElement],
          auctioneerSignatureEncoded,
        ),
      ).to.be.revertedWith("user not allowed to place order");
    });
  });
});
