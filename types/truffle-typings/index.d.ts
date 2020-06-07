/**
 * Include generated truffle typings for tests.
 */

/// <reference types="../../build/truffle-typings/types" />

export * from "../../build/truffle-typings";

declare global {
  namespace Truffle {
    interface Artifacts {
      require(name: string): Truffle.Contract<unknown>;
    }

    interface ScriptCallback {
      (err?: string | Error): void;
    }
  }
}
