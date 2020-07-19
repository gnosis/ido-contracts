/**
 * Typings for `truffle-assertions` package.
 */

declare module "truffle-assertions" {
  import { TransactionReceipt } from "web3-core";

  class InvalidTxResultError extends Error {}

  interface ErrorType {
    REVERT: "revert";
    INVALID_OPCODE: "invalid opcode";
    OUT_OF_GAS: "out of gas";
    INVALID_JUMP: "invalid JUMP";
  }

  type ErrorTypeValue = ErrorType[keyof ErrorType];

  interface TransactionResult {
    tx: string;
    receipt: TransactionReceipt;
    logs: Truffle.TransactionLog<Truffle.AnyEvent>[];
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

    passes: (asyncFn: Promise<unknown>, message?: string) => void;
    fails: (
      asyncFn: Promise<unknown>,
      errorType: ErrorTypeValue,
      reason?: string,
      message?: string,
    ) => void;
    reverts: (
      asyncFn: Promise<unknown>,
      reason?: string,
      message?: string,
    ) => void;

    ErrorType: ErrorType;
    InvalidTxResultError: InvalidTxResultError;
  }

  const truffleAssert: TruffleAssert;
  export = truffleAssert;
}
