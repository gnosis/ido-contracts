import { EasyAuctionInstance } from "../types/truffle-typings";
export declare function waitForNSeconds(seconds: number, web3Provider?: import("web3").default): Promise<void>;
export declare function closeAuction(instance: EasyAuctionInstance, auctionId: number, web3Provider?: import("web3").default): Promise<void>;
export declare function sendTxAndGetReturnValue<T>(method: {
    sendTransaction: (...args: any[]) => Promise<string>;
    call: (...args: any[]) => Promise<T>;
}, ...args: any[]): Promise<T>;
export interface Order {
    userId: number;
    buyAmount: number;
    sellAmount: number;
}
