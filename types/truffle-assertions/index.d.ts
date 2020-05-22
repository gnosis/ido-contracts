/**
 * Typings for `truffle-assertions` package.
 */

declare module "truffle-assertions" {
  import "@openeth/truffle-typings";
  import { TransactionReceipt } from "web3-core";

  class InvalidTxResultError extends Error {}

  const enum ErrorType {
    REVERT = "revert",
    INVALID_OPCODE = "invalid opcode",
    OUT_OF_GAS = "out of gas",
    INVALID_JUMP = "invalid JUMP",
  }

  interface TransactionResult {
    tx: string;
    receipt: TransactionReceipt;
    logs: Truffle.TransactionLog[];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type FilterOrObject = ((data: any) => boolean) | any;

  interface TruffleAssert {
    eventEmitted: (
      result: TransactionResult,
      eventType: string,
      filterOrObject?: FilterOrObject,
      message?: string,
    ) => void;
    eventNotEmitted: (
      result: TransactionResult,
      eventType: string,
      filterOrObject?: FilterOrObject,
      message?: string,
    ) => void;
    prettyPrintEmittedEvents: (
      result: TransactionResult,
      indentationSize: number,
    ) => void;
    createTransactionResult: <T>(
      contract: Truffle.Contract<T>,
      transactionHash: string,
    ) => TransactionResult;

    passes: (asyncFn: Promise<{}>, message?: string) => void;
    fails: (
      asyncFn: Promise<{}>,
      errorType: ErrorType,
      reason?: string,
      message?: string,
    ) => void;
    reverts: (asyncFn: Promise<{}>, reason?: string, message?: string) => void;

    ErrorType: ErrorType;
    InvalidTxResultError: InvalidTxResultError;
  }

  const truffleAssert: TruffleAssert;
  export = truffleAssert;
}
