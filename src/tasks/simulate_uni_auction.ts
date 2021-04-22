import "hardhat-deploy";
import "@nomiclabs/hardhat-ethers";
import { BigNumber, Contract } from "ethers";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { queueStartElement } from "../priceCalculation";

const simulateUniAuction: () => void = () => {
  task(
    "simulateUniAuction",
    "Simulates selling uni on gnosis auction via governance mechanism",
  ).setAction(async (taskArgs, hardhatRuntime) => {
    ////////////////////////////////////////////////////////////////////////////////
    // 0th: Get contracts to be used
    ////////////////////////////////////////////////////////////////////////////////

    const easyAuction = await getGnosisAuction(hardhatRuntime);
    const uniTimeLock = await getUniswapTimeLockContract(hardhatRuntime);
    const uniGovernance = await getUniswapGovernanceContract(hardhatRuntime);
    const uniToken = await getUniToken(hardhatRuntime);
    const daiToken = await getDAIToken(hardhatRuntime);

    ////////////////////////////////////////////////////////////////////////////////
    // 1st: Propose Selling of UNI to treasury
    ////////////////////////////////////////////////////////////////////////////////

    const proposalId =
      Number((await uniGovernance.proposalCount()).toString()) + 1;
    const formerProposerAccount = "0x7e4A8391C728fEd9069B2962699AB416628B19Fa";
    await hardhatRuntime.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [formerProposerAccount],
    });
    const proposer = await hardhatRuntime.ethers.provider.getSigner(
      formerProposerAccount,
    );
    let now = (await hardhatRuntime.ethers.provider.getBlock("latest"))
      .timestamp;
    const currentBlock = (
      await hardhatRuntime.ethers.provider.getBlock("latest")
    ).number;
    const targets = [uniToken.address, easyAuction.address];
    const values = [0, 0];
    const signatures = [
      "approve(address,uint256)",
      "initiateAuction(address,address,uint256,uint256,uint96,uint96,uint256,uint256,bool,address,bytes)",
    ];
    const timeLockDelay = Number((await uniTimeLock.delay()).toString());
    const votingDelay =
      (Number((await uniGovernance.votingDelay()).toString()) +
        Number((await uniGovernance.votingPeriod()).toString())) *
      20;
    const _auctioningToken = uniToken.address;
    const _biddingToken = daiToken.address;
    //Later, these time values should be set explicitly
    const orderCancellationEndDate = now + timeLockDelay + votingDelay + 3600;
    const auctionEndDate = now + timeLockDelay + votingDelay + 3600;
    const auctionedSellAmount = hardhatRuntime.ethers.utils.parseEther(
      "1000000",
    );
    const minBuyAmount = auctionedSellAmount.mul(20);
    const minimumBiddingAmountPerOrder = 1000;
    const minFundingThreshold = 0;
    const isAtomicClosureAllowed = true;
    const accessManagerContract = "0x0000000000000000000000000000000000000000";
    const accessManagerContractData = "0x";

    const calldatas = [
      "0x" +
        uniToken.interface
          .encodeFunctionData("approve", [
            easyAuction.address,
            auctionedSellAmount,
          ])
          .substring(10),
      "0x" +
        easyAuction.interface
          .encodeFunctionData("initiateAuction", [
            _auctioningToken,
            _biddingToken,
            orderCancellationEndDate,
            auctionEndDate,
            auctionedSellAmount,
            minBuyAmount,
            minimumBiddingAmountPerOrder,
            minFundingThreshold,
            isAtomicClosureAllowed,
            accessManagerContract,
            accessManagerContractData,
          ])
          .substring(10),
    ];
    const description = "Selling uni token on Gnosis Auction";
    await uniGovernance
      .connect(proposer)
      .propose(targets, values, signatures, calldatas, description);

    ////////////////////////////////////////////////////////////////////////////////
    // 2nd: Voting from several accounts to majority
    ////////////////////////////////////////////////////////////////////////////////
    let proposalInfo = await uniGovernance.callStatic.proposals(proposalId);

    const startBlock = proposalInfo.startBlock;
    for (let i = 0; i < startBlock - currentBlock + 2; i++) {
      await hardhatRuntime.ethers.provider.send("evm_mine", []);
    }
    // fund delegate
    await proposer.sendTransaction({
      to: "0x686B4535FF6573cef3FF37419A4fc6Ac775Ec7ea",
      value: hardhatRuntime.ethers.utils.parseEther("0.5"),
    });
    await proposer.sendTransaction({
      to: "0xe02457a1459b6C49469Bf658d4Fe345C636326bF",
      value: hardhatRuntime.ethers.utils.parseEther("0.5"),
    });
    await proposer.sendTransaction({
      to: "0xbbf3f1421D886E9b2c5D716B5192aC998af2012c",
      value: hardhatRuntime.ethers.utils.parseEther("0.5"),
    });

    await hardhatRuntime.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [formerProposerAccount],
    });
    const votingAccounts = [
      "0x47173B170C64d16393a52e6C480b3Ad8c302ba1e",
      "0xB045FA6893B26807298E93377Cbb92d7f37B19eB",
      "0x7e4A8391C728fEd9069B2962699AB416628B19Fa",
      "0x0ec9e8aA56E0425B60DEe347c8EFbaD959579D0F",
      "0x878f0822A9e77c1dD7883E543747147Be8D63C3B",
      "0x7D2d43E63666f45B40316b44212325625DbAEB40",
      "0x7D325A9C8F10758188641FE91cFD902499edC782",
      "0x09e783a4292dc39398654394372F3Ac2b0A628DC",
      "0x7eec35333afb0ab6996085727e1939f008840410",
      "0x686B4535FF6573cef3FF37419A4fc6Ac775Ec7ea",
      "0xe02457a1459b6C49469Bf658d4Fe345C636326bF",
      "0x2B1Ad6184a6B0fac06bD225ed37C2AbC04415fF4",
      "0xbbf3f1421D886E9b2c5D716B5192aC998af2012c",
    ];
    for (const voter of votingAccounts) {
      await hardhatRuntime.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [voter],
      });
      const voter_account = await hardhatRuntime.ethers.provider.getSigner(
        voter,
      );
      await uniGovernance.connect(voter_account).castVote(proposalId, true);
      await hardhatRuntime.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [voter],
      });
    }
    ////////////////////////////////////////////////////////////////////////////////
    // 4th: Queue Proposal
    ////////////////////////////////////////////////////////////////////////////////
    const newCurrentBlock = (
      await hardhatRuntime.ethers.provider.getBlock("latest")
    ).number;
    const endBlock = proposalInfo.endBlock;
    for (let i = 0; i < endBlock - newCurrentBlock + 2; i++) {
      await hardhatRuntime.ethers.provider.send("evm_mine", []);
    }
    await hardhatRuntime.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [formerProposerAccount],
    });
    await uniGovernance.connect(proposer).queue(proposalId);
    await hardhatRuntime.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [formerProposerAccount],
    });
    ////////////////////////////////////////////////////////////////////////////////
    // 5th: Execute Proposal
    ////////////////////////////////////////////////////////////////////////////////
    proposalInfo = await uniGovernance.proposals(proposalId);
    const eta = proposalInfo.eta;
    now = (await hardhatRuntime.ethers.provider.getBlock("latest")).timestamp;
    await hardhatRuntime.ethers.provider.send("evm_increaseTime", [eta - now]);
    await hardhatRuntime.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [formerProposerAccount],
    });
    await uniGovernance.connect(proposer).execute(proposalId);
    await hardhatRuntime.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [formerProposerAccount],
    });
    ////////////////////////////////////////////////////////////////////////////////
    // 6th: Participate in auction
    ////////////////////////////////////////////////////////////////////////////////
    const auctionId = await easyAuction.auctionCounter();
    const daiBidder = "0xD624790fC3E318Ce86f509Ecf69DF440B3fc328D";
    await hardhatRuntime.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [daiBidder],
    });
    const bidder = await hardhatRuntime.ethers.provider.getSigner(daiBidder);
    const biddingAmount = hardhatRuntime.ethers.utils.parseEther("35000000");
    await daiToken.connect(bidder).approve(easyAuction.address, biddingAmount);
    await easyAuction
      .connect(bidder)
      .placeSellOrders(
        auctionId,
        [biddingAmount.div(BigNumber.from(30))],
        [biddingAmount],
        [queueStartElement],
        "0x",
      );

    now = (await hardhatRuntime.ethers.provider.getBlock("latest")).timestamp;
    await hardhatRuntime.ethers.provider.send("evm_increaseTime", [
      auctionEndDate - now,
    ]);
    await easyAuction.connect(bidder).settleAuction(auctionId);

    ////////////////////////////////////////////////////////////////////////////////
    // 8th: Observe sell proceeds in the DAO multisig
    ////////////////////////////////////////////////////////////////////////////////
    const boughtDAI = await daiToken.balanceOf(uniTimeLock.address);
    console.log(
      "Uniswap treasury bought: ",
      boughtDAI.div(hardhatRuntime.ethers.utils.parseEther("1")).toString(),
      " DAI for ",
      auctionedSellAmount
        .div(hardhatRuntime.ethers.utils.parseEther("1"))
        .toString(),
      " UNI",
    );
  });
};

export { simulateUniAuction };

export async function getUniswapTimeLockContract({
  ethers,
}: HardhatRuntimeEnvironment): Promise<Contract> {
  const timeLock = new Contract(
    "0x1a9C8182C09F50C8318d769245beA52c32BE35BC",
    '[{"inputs":[{"internalType":"address","name":"admin_","type":"address"},{"internalType":"uint256","name":"delay_","type":"uint256"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"txHash","type":"bytes32"},{"indexed":true,"internalType":"address","name":"target","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"},{"indexed":false,"internalType":"string","name":"signature","type":"string"},{"indexed":false,"internalType":"bytes","name":"data","type":"bytes"},{"indexed":false,"internalType":"uint256","name":"eta","type":"uint256"}],"name":"CancelTransaction","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"txHash","type":"bytes32"},{"indexed":true,"internalType":"address","name":"target","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"},{"indexed":false,"internalType":"string","name":"signature","type":"string"},{"indexed":false,"internalType":"bytes","name":"data","type":"bytes"},{"indexed":false,"internalType":"uint256","name":"eta","type":"uint256"}],"name":"ExecuteTransaction","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"newAdmin","type":"address"}],"name":"NewAdmin","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"newDelay","type":"uint256"}],"name":"NewDelay","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"newPendingAdmin","type":"address"}],"name":"NewPendingAdmin","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"txHash","type":"bytes32"},{"indexed":true,"internalType":"address","name":"target","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"},{"indexed":false,"internalType":"string","name":"signature","type":"string"},{"indexed":false,"internalType":"bytes","name":"data","type":"bytes"},{"indexed":false,"internalType":"uint256","name":"eta","type":"uint256"}],"name":"QueueTransaction","type":"event"},{"payable":true,"stateMutability":"payable","type":"fallback"},{"constant":true,"inputs":[],"name":"GRACE_PERIOD","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"MAXIMUM_DELAY","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"MINIMUM_DELAY","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[],"name":"acceptAdmin","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"admin","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"target","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"},{"internalType":"string","name":"signature","type":"string"},{"internalType":"bytes","name":"data","type":"bytes"},{"internalType":"uint256","name":"eta","type":"uint256"}],"name":"cancelTransaction","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"delay","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"target","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"},{"internalType":"string","name":"signature","type":"string"},{"internalType":"bytes","name":"data","type":"bytes"},{"internalType":"uint256","name":"eta","type":"uint256"}],"name":"executeTransaction","outputs":[{"internalType":"bytes","name":"","type":"bytes"}],"payable":true,"stateMutability":"payable","type":"function"},{"constant":true,"inputs":[],"name":"pendingAdmin","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"target","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"},{"internalType":"string","name":"signature","type":"string"},{"internalType":"bytes","name":"data","type":"bytes"},{"internalType":"uint256","name":"eta","type":"uint256"}],"name":"queueTransaction","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"name":"queuedTransactions","outputs":[{"internalType":"bool","name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"uint256","name":"delay_","type":"uint256"}],"name":"setDelay","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"pendingAdmin_","type":"address"}],"name":"setPendingAdmin","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"}]',
  ).connect(ethers.provider);

  return timeLock;
}

export async function getUniswapGovernanceContract({
  ethers,
}: HardhatRuntimeEnvironment): Promise<Contract> {
  const contract = new Contract(
    "0x5e4be8Bc9637f0EAA1A755019e06A68ce081D58F",
    '[{"inputs":[{"internalType":"address","name":"timelock_","type":"address"},{"internalType":"address","name":"uni_","type":"address"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"id","type":"uint256"}],"name":"ProposalCanceled","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"id","type":"uint256"},{"indexed":false,"internalType":"address","name":"proposer","type":"address"},{"indexed":false,"internalType":"address[]","name":"targets","type":"address[]"},{"indexed":false,"internalType":"uint256[]","name":"values","type":"uint256[]"},{"indexed":false,"internalType":"string[]","name":"signatures","type":"string[]"},{"indexed":false,"internalType":"bytes[]","name":"calldatas","type":"bytes[]"},{"indexed":false,"internalType":"uint256","name":"startBlock","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"endBlock","type":"uint256"},{"indexed":false,"internalType":"string","name":"description","type":"string"}],"name":"ProposalCreated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"id","type":"uint256"}],"name":"ProposalExecuted","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"id","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"eta","type":"uint256"}],"name":"ProposalQueued","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"voter","type":"address"},{"indexed":false,"internalType":"uint256","name":"proposalId","type":"uint256"},{"indexed":false,"internalType":"bool","name":"support","type":"bool"},{"indexed":false,"internalType":"uint256","name":"votes","type":"uint256"}],"name":"VoteCast","type":"event"},{"constant":true,"inputs":[],"name":"BALLOT_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"DOMAIN_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"uint256","name":"proposalId","type":"uint256"}],"name":"cancel","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"uint256","name":"proposalId","type":"uint256"},{"internalType":"bool","name":"support","type":"bool"}],"name":"castVote","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"uint256","name":"proposalId","type":"uint256"},{"internalType":"bool","name":"support","type":"bool"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"castVoteBySig","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"uint256","name":"proposalId","type":"uint256"}],"name":"execute","outputs":[],"payable":true,"stateMutability":"payable","type":"function"},{"constant":true,"inputs":[{"internalType":"uint256","name":"proposalId","type":"uint256"}],"name":"getActions","outputs":[{"internalType":"address[]","name":"targets","type":"address[]"},{"internalType":"uint256[]","name":"values","type":"uint256[]"},{"internalType":"string[]","name":"signatures","type":"string[]"},{"internalType":"bytes[]","name":"calldatas","type":"bytes[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"uint256","name":"proposalId","type":"uint256"},{"internalType":"address","name":"voter","type":"address"}],"name":"getReceipt","outputs":[{"components":[{"internalType":"bool","name":"hasVoted","type":"bool"},{"internalType":"bool","name":"support","type":"bool"},{"internalType":"uint96","name":"votes","type":"uint96"}],"internalType":"struct GovernorAlpha.Receipt","name":"","type":"tuple"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"latestProposalIds","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"proposalCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"proposalMaxOperations","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"pure","type":"function"},{"constant":true,"inputs":[],"name":"proposalThreshold","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"pure","type":"function"},{"constant":true,"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"proposals","outputs":[{"internalType":"uint256","name":"id","type":"uint256"},{"internalType":"address","name":"proposer","type":"address"},{"internalType":"uint256","name":"eta","type":"uint256"},{"internalType":"uint256","name":"startBlock","type":"uint256"},{"internalType":"uint256","name":"endBlock","type":"uint256"},{"internalType":"uint256","name":"forVotes","type":"uint256"},{"internalType":"uint256","name":"againstVotes","type":"uint256"},{"internalType":"bool","name":"canceled","type":"bool"},{"internalType":"bool","name":"executed","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address[]","name":"targets","type":"address[]"},{"internalType":"uint256[]","name":"values","type":"uint256[]"},{"internalType":"string[]","name":"signatures","type":"string[]"},{"internalType":"bytes[]","name":"calldatas","type":"bytes[]"},{"internalType":"string","name":"description","type":"string"}],"name":"propose","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"uint256","name":"proposalId","type":"uint256"}],"name":"queue","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"quorumVotes","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"pure","type":"function"},{"constant":true,"inputs":[{"internalType":"uint256","name":"proposalId","type":"uint256"}],"name":"state","outputs":[{"internalType":"enum GovernorAlpha.ProposalState","name":"","type":"uint8"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"timelock","outputs":[{"internalType":"contract TimelockInterface","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"uni","outputs":[{"internalType":"contract UniInterface","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"votingDelay","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"pure","type":"function"},{"constant":true,"inputs":[],"name":"votingPeriod","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"pure","type":"function"}]',
  ).connect(ethers.provider);

  return contract;
}
export async function getUniToken({
  ethers,
}: HardhatRuntimeEnvironment): Promise<Contract> {
  const contract = new Contract(
    "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
    '[{"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"address","name":"minter_","type":"address"},{"internalType":"uint256","name":"mintingAllowedAfter_","type":"uint256"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"spender","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"delegator","type":"address"},{"indexed":true,"internalType":"address","name":"fromDelegate","type":"address"},{"indexed":true,"internalType":"address","name":"toDelegate","type":"address"}],"name":"DelegateChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"delegate","type":"address"},{"indexed":false,"internalType":"uint256","name":"previousBalance","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"newBalance","type":"uint256"}],"name":"DelegateVotesChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"minter","type":"address"},{"indexed":false,"internalType":"address","name":"newMinter","type":"address"}],"name":"MinterChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Transfer","type":"event"},{"constant":true,"inputs":[],"name":"DELEGATION_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"DOMAIN_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"PERMIT_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"address","name":"spender","type":"address"}],"name":"allowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"rawAmount","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"uint32","name":"","type":"uint32"}],"name":"checkpoints","outputs":[{"internalType":"uint32","name":"fromBlock","type":"uint32"},{"internalType":"uint96","name":"votes","type":"uint96"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"delegatee","type":"address"}],"name":"delegate","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"delegatee","type":"address"},{"internalType":"uint256","name":"nonce","type":"uint256"},{"internalType":"uint256","name":"expiry","type":"uint256"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"delegateBySig","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"delegates","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"getCurrentVotes","outputs":[{"internalType":"uint96","name":"","type":"uint96"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"uint256","name":"blockNumber","type":"uint256"}],"name":"getPriorVotes","outputs":[{"internalType":"uint96","name":"","type":"uint96"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"minimumTimeBetweenMints","outputs":[{"internalType":"uint32","name":"","type":"uint32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"dst","type":"address"},{"internalType":"uint256","name":"rawAmount","type":"uint256"}],"name":"mint","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"mintCap","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"minter","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"mintingAllowedAfter","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"nonces","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"numCheckpoints","outputs":[{"internalType":"uint32","name":"","type":"uint32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"rawAmount","type":"uint256"},{"internalType":"uint256","name":"deadline","type":"uint256"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"permit","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"minter_","type":"address"}],"name":"setMinter","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"dst","type":"address"},{"internalType":"uint256","name":"rawAmount","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"src","type":"address"},{"internalType":"address","name":"dst","type":"address"},{"internalType":"uint256","name":"rawAmount","type":"uint256"}],"name":"transferFrom","outputs":[{"internalType":"bool","name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"}]',
  ).connect(ethers.provider);

  return contract;
}
export async function getDAIToken({
  ethers,
}: HardhatRuntimeEnvironment): Promise<Contract> {
  const contract = new Contract(
    "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    '[{"inputs":[{"internalType":"uint256","name":"chainId_","type":"uint256"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"src","type":"address"},{"indexed":true,"internalType":"address","name":"guy","type":"address"},{"indexed":false,"internalType":"uint256","name":"wad","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":true,"inputs":[{"indexed":true,"internalType":"bytes4","name":"sig","type":"bytes4"},{"indexed":true,"internalType":"address","name":"usr","type":"address"},{"indexed":true,"internalType":"bytes32","name":"arg1","type":"bytes32"},{"indexed":true,"internalType":"bytes32","name":"arg2","type":"bytes32"},{"indexed":false,"internalType":"bytes","name":"data","type":"bytes"}],"name":"LogNote","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"src","type":"address"},{"indexed":true,"internalType":"address","name":"dst","type":"address"},{"indexed":false,"internalType":"uint256","name":"wad","type":"uint256"}],"name":"Transfer","type":"event"},{"constant":true,"inputs":[],"name":"DOMAIN_SEPARATOR","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"PERMIT_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"}],"name":"allowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"usr","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"usr","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"burn","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"guy","type":"address"}],"name":"deny","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"usr","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"mint","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"src","type":"address"},{"internalType":"address","name":"dst","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"move","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"nonces","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"holder","type":"address"},{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"nonce","type":"uint256"},{"internalType":"uint256","name":"expiry","type":"uint256"},{"internalType":"bool","name":"allowed","type":"bool"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"permit","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"usr","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"pull","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"usr","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"push","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"guy","type":"address"}],"name":"rely","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"dst","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"src","type":"address"},{"internalType":"address","name":"dst","type":"address"},{"internalType":"uint256","name":"wad","type":"uint256"}],"name":"transferFrom","outputs":[{"internalType":"bool","name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"version","outputs":[{"internalType":"string","name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"wards","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"}]',
  ).connect(ethers.provider);

  return contract;
}

export async function getGnosisAuction({
  ethers,
}: HardhatRuntimeEnvironment): Promise<Contract> {
  const contract = new Contract(
    "0x0b7fFc1f4AD541A4Ed16b40D8c37f0929158D101",
    '[{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"auctionId","type":"uint256"},{"indexed":false,"internalType":"uint96","name":"soldAuctioningTokens","type":"uint96"},{"indexed":false,"internalType":"uint96","name":"soldBiddingTokens","type":"uint96"},{"indexed":false,"internalType":"bytes32","name":"clearingPriceOrder","type":"bytes32"}],"name":"AuctionCleared","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"auctionId","type":"uint256"},{"indexed":true,"internalType":"uint64","name":"userId","type":"uint64"},{"indexed":false,"internalType":"uint96","name":"buyAmount","type":"uint96"},{"indexed":false,"internalType":"uint96","name":"sellAmount","type":"uint96"}],"name":"CancellationSellOrder","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"auctionId","type":"uint256"},{"indexed":true,"internalType":"uint64","name":"userId","type":"uint64"},{"indexed":false,"internalType":"uint96","name":"buyAmount","type":"uint96"},{"indexed":false,"internalType":"uint96","name":"sellAmount","type":"uint96"}],"name":"ClaimedFromOrder","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"auctionId","type":"uint256"},{"indexed":true,"internalType":"contract IERC20","name":"_auctioningToken","type":"address"},{"indexed":true,"internalType":"contract IERC20","name":"_biddingToken","type":"address"},{"indexed":false,"internalType":"uint256","name":"orderCancellationEndDate","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"auctionEndDate","type":"uint256"},{"indexed":false,"internalType":"uint64","name":"userId","type":"uint64"},{"indexed":false,"internalType":"uint96","name":"_auctionedSellAmount","type":"uint96"},{"indexed":false,"internalType":"uint96","name":"_minBuyAmount","type":"uint96"},{"indexed":false,"internalType":"uint256","name":"minimumBiddingAmountPerOrder","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"minFundingThreshold","type":"uint256"},{"indexed":false,"internalType":"address","name":"allowListContract","type":"address"},{"indexed":false,"internalType":"bytes","name":"allowListData","type":"bytes"}],"name":"NewAuction","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"auctionId","type":"uint256"},{"indexed":true,"internalType":"uint64","name":"userId","type":"uint64"},{"indexed":false,"internalType":"uint96","name":"buyAmount","type":"uint96"},{"indexed":false,"internalType":"uint96","name":"sellAmount","type":"uint96"}],"name":"NewSellOrder","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint64","name":"userId","type":"uint64"},{"indexed":true,"internalType":"address","name":"userAddress","type":"address"}],"name":"NewUser","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint64","name":"userId","type":"uint64"}],"name":"UserRegistration","type":"event"},{"inputs":[],"name":"FEE_DENOMINATOR","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"auctionAccessData","outputs":[{"internalType":"bytes","name":"","type":"bytes"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"auctionAccessManager","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"auctionCounter","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"auctionData","outputs":[{"internalType":"contract IERC20","name":"auctioningToken","type":"address"},{"internalType":"contract IERC20","name":"biddingToken","type":"address"},{"internalType":"uint256","name":"orderCancellationEndDate","type":"uint256"},{"internalType":"uint256","name":"auctionEndDate","type":"uint256"},{"internalType":"bytes32","name":"initialAuctionOrder","type":"bytes32"},{"internalType":"uint256","name":"minimumBiddingAmountPerOrder","type":"uint256"},{"internalType":"uint256","name":"interimSumBidAmount","type":"uint256"},{"internalType":"bytes32","name":"interimOrder","type":"bytes32"},{"internalType":"bytes32","name":"clearingPriceOrder","type":"bytes32"},{"internalType":"uint96","name":"volumeClearingPriceOrder","type":"uint96"},{"internalType":"bool","name":"minFundingThresholdNotReached","type":"bool"},{"internalType":"bool","name":"isAtomicClosureAllowed","type":"bool"},{"internalType":"uint256","name":"feeNumerator","type":"uint256"},{"internalType":"uint256","name":"minFundingThreshold","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"auctionId","type":"uint256"},{"internalType":"bytes32[]","name":"_sellOrders","type":"bytes32[]"}],"name":"cancelSellOrders","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"auctionId","type":"uint256"},{"internalType":"bytes32[]","name":"orders","type":"bytes32[]"}],"name":"claimFromParticipantOrder","outputs":[{"internalType":"uint256","name":"sumAuctioningTokenAmount","type":"uint256"},{"internalType":"uint256","name":"sumBiddingTokenAmount","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"auctionId","type":"uint256"},{"internalType":"bytes32","name":"order","type":"bytes32"}],"name":"containsOrder","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"feeNumerator","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"feeReceiverUserId","outputs":[{"internalType":"uint64","name":"","type":"uint64"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"auctionId","type":"uint256"}],"name":"getSecondsRemainingInBatch","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"user","type":"address"}],"name":"getUserId","outputs":[{"internalType":"uint64","name":"userId","type":"uint64"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"contract IERC20","name":"_auctioningToken","type":"address"},{"internalType":"contract IERC20","name":"_biddingToken","type":"address"},{"internalType":"uint256","name":"orderCancellationEndDate","type":"uint256"},{"internalType":"uint256","name":"auctionEndDate","type":"uint256"},{"internalType":"uint96","name":"_auctionedSellAmount","type":"uint96"},{"internalType":"uint96","name":"_minBuyAmount","type":"uint96"},{"internalType":"uint256","name":"minimumBiddingAmountPerOrder","type":"uint256"},{"internalType":"uint256","name":"minFundingThreshold","type":"uint256"},{"internalType":"bool","name":"isAtomicClosureAllowed","type":"bool"},{"internalType":"address","name":"accessManagerContract","type":"address"},{"internalType":"bytes","name":"accessManagerContractData","type":"bytes"}],"name":"initiateAuction","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"numUsers","outputs":[{"internalType":"uint64","name":"","type":"uint64"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"auctionId","type":"uint256"},{"internalType":"uint96[]","name":"_minBuyAmounts","type":"uint96[]"},{"internalType":"uint96[]","name":"_sellAmounts","type":"uint96[]"},{"internalType":"bytes32[]","name":"_prevSellOrders","type":"bytes32[]"},{"internalType":"bytes","name":"allowListCallData","type":"bytes"}],"name":"placeSellOrders","outputs":[{"internalType":"uint64","name":"userId","type":"uint64"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"auctionId","type":"uint256"},{"internalType":"uint96[]","name":"_minBuyAmounts","type":"uint96[]"},{"internalType":"uint96[]","name":"_sellAmounts","type":"uint96[]"},{"internalType":"bytes32[]","name":"_prevSellOrders","type":"bytes32[]"},{"internalType":"bytes","name":"allowListCallData","type":"bytes"},{"internalType":"address","name":"orderSubmitter","type":"address"}],"name":"placeSellOrdersOnBehalf","outputs":[{"internalType":"uint64","name":"userId","type":"uint64"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"auctionId","type":"uint256"},{"internalType":"uint256","name":"iterationSteps","type":"uint256"}],"name":"precalculateSellAmountSum","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"user","type":"address"}],"name":"registerUser","outputs":[{"internalType":"uint64","name":"userId","type":"uint64"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"newFeeNumerator","type":"uint256"},{"internalType":"address","name":"newfeeReceiverAddress","type":"address"}],"name":"setFeeParameters","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"auctionId","type":"uint256"}],"name":"settleAuction","outputs":[{"internalType":"bytes32","name":"clearingOrder","type":"bytes32"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"auctionId","type":"uint256"},{"internalType":"uint96[]","name":"_minBuyAmount","type":"uint96[]"},{"internalType":"uint96[]","name":"_sellAmount","type":"uint96[]"},{"internalType":"bytes32[]","name":"_prevSellOrder","type":"bytes32[]"},{"internalType":"bytes","name":"allowListCallData","type":"bytes"}],"name":"settleAuctionAtomically","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"}]',
  ).connect(ethers.provider);

  return contract;
}
