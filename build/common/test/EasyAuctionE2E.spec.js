"use strict";
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
const EasyAuction = artifacts.require("EasyAuction.sol");
const ERC20 = artifacts.require("ERC20Mintable.sol");
const bn_js_1 = __importDefault(require("bn.js"));
const {
  encodeOrder,
  queueStartElement,
  sendTxAndGetReturnValue,
  closeAuction,
} = require("./utilities");
contract("IterableOrderedOrderSet", (accounts) =>
  __awaiter(void 0, void 0, void 0, function* () {
    const [user_1] = accounts;
    let easyAuction;
    let buyToken;
    let sellToken;
    beforeEach(() =>
      __awaiter(void 0, void 0, void 0, function* () {
        easyAuction = yield EasyAuction.new();
      })
    );
    it("e2e - places a lot of buyOrders and calculates the price to test gas usage of claculatePrice", () =>
      __awaiter(void 0, void 0, void 0, function* () {
        buyToken = yield ERC20.new("BT", "BT");
        yield buyToken.mint(
          user_1,
          new bn_js_1.default(10).pow(new bn_js_1.default(30))
        );
        yield buyToken.approve(
          easyAuction.address,
          new bn_js_1.default(10).pow(new bn_js_1.default(30))
        );
        sellToken = yield ERC20.new("BT", "BT");
        yield sellToken.mint(
          user_1,
          new bn_js_1.default(10).pow(new bn_js_1.default(30))
        );
        yield sellToken.approve(
          easyAuction.address,
          new bn_js_1.default(10).pow(new bn_js_1.default(30))
        );
        const auctionId = yield sendTxAndGetReturnValue(
          easyAuction.initiateAuction,
          buyToken.address,
          sellToken.address,
          60 * 60,
          new bn_js_1.default(10).pow(new bn_js_1.default(18)),
          new bn_js_1.default(10).pow(new bn_js_1.default(18))
        );
        const nrTests = 5;
        for (let i = 1; i < nrTests; i++) {
          const buyOrder = encodeOrder(
            1,
            new bn_js_1.default(i).mul(
              new bn_js_1.default(10).pow(new bn_js_1.default(18))
            ),
            new bn_js_1.default(10)
              .pow(new bn_js_1.default(18))
              .div(new bn_js_1.default(nrTests - 2))
          );
          let prevBuyOrder = encodeOrder(
            1,
            new bn_js_1.default(i - 1).mul(
              new bn_js_1.default(10).pow(new bn_js_1.default(18))
            ),
            new bn_js_1.default(10)
              .pow(new bn_js_1.default(18))
              .div(new bn_js_1.default(nrTests - 2))
          );
          if (i == 1) {
            prevBuyOrder = queueStartElement;
          }
          yield easyAuction.placeBuyOrders(
            auctionId,
            [
              new bn_js_1.default(i).mul(
                new bn_js_1.default(10).pow(new bn_js_1.default(18))
              ),
            ],
            [
              new bn_js_1.default(10)
                .pow(new bn_js_1.default(18))
                .div(new bn_js_1.default(nrTests - 2)),
            ],
            [prevBuyOrder]
          );
        }
        yield closeAuction(easyAuction, auctionId, web3);
        const ans = yield easyAuction.calculatePrice.call(auctionId);
        console.log(ans);
        console.log(ans[0] + "/" + ans[1] + " = " + ans[0].div(ans[1]));
        yield easyAuction.calculatePrice(auctionId);
      }));
  })
);
