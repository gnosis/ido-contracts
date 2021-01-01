import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";

export async function closeAuction(
  instance: Contract,
  auctionId: BigNumber,
): Promise<void> {
  const time_remaining = (
    await instance.getSecondsRemainingInBatch(auctionId)
  ).toNumber();
  await increaseTime(time_remaining + 1);
}

export async function increaseTime(duration: number): Promise<void> {
  ethers.provider.send("evm_increaseTime", [duration]);
  ethers.provider.send("evm_mine", []);
}

export async function sendTxAndGetReturnValue<T>(
  contract: Contract,
  fnName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
): Promise<T> {
  const result = await contract.callStatic[fnName](...args);
  await contract.functions[fnName](...args);
  return result;
}
