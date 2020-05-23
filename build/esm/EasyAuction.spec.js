const EasyAuction = artifacts.require("EasyAuction.sol");
const ERC20 = artifacts.require("ERC20Mintable.sol");
import BN from "bn.js";
import truffleAssert from "truffle-assertions";
function toAuctionDataResult(result) {
    return {
        sellToken: result[0],
        buyToken: result[1],
        auctionEndDate: result[2],
        sellOrder: result[3],
        clearingPriceOrder: result[4],
        volumeClearingPriceOrder: result[5],
    };
}
const { encodeOrder, queueStartElement, sendTxAndGetReturnValue, closeAuction, } = require("./utilities");
contract("IterableOrderedOrderSet", async (accounts) => {
    const [user_1, user_2, user_3] = accounts;
    let easyAuction;
    let buyToken;
    let sellToken;
    beforeEach(async () => {
        easyAuction = await EasyAuction.new();
    });
    describe("initiate Auction", async () => {
        it("initiateAuction stores the parameters correctly", async () => {
            buyToken = await ERC20.new("BT", "BT");
            await buyToken.mint(user_1, new BN(10).pow(new BN(30)));
            await buyToken.approve(easyAuction.address, new BN(10).pow(new BN(30)));
            sellToken = await ERC20.new("BT", "BT");
            await sellToken.mint(user_1, new BN(10).pow(new BN(30)));
            await sellToken.approve(easyAuction.address, new BN(10).pow(new BN(30)));
            const auctionId = await sendTxAndGetReturnValue(easyAuction.initiateAuction, sellToken.address, buyToken.address, 60 * 60, new BN(10).pow(new BN(18)), new BN(10).pow(new BN(18)));
            const auctionData = toAuctionDataResult(await easyAuction.auctionData(auctionId));
            assert.equal(auctionData.sellToken, sellToken.address);
            assert.equal(auctionData.buyToken, buyToken.address);
            assert.equal(auctionData.sellOrder, encodeOrder(0, new BN(10).pow(new BN(18)), new BN(10).pow(new BN(18))));
            //Todo assert.equal(auctionData.auctionEndDate);
            assert.equal(auctionData.clearingPriceOrder, encodeOrder(0, 0, 0));
            assert.equal(auctionData.volumeClearingPriceOrder.toNumber(), 0);
            assert.equal((await sellToken.balanceOf.call(easyAuction.address)).toString(), new BN(10).pow(new BN(18)).toString());
        });
    });
    describe("getUserId", async () => {
        it("creates new userIds", async () => {
            const userId_1 = await sendTxAndGetReturnValue(easyAuction.getUserId, user_1, {
                from: user_1,
            });
            const userId_2 = await sendTxAndGetReturnValue(easyAuction.getUserId, user_2, {
                from: user_2,
            });
            const userId_3 = await sendTxAndGetReturnValue(easyAuction.getUserId, user_1, {
                from: user_3,
            });
            assert.equal(userId_1, 0);
            assert.equal(userId_2, 1);
            assert.equal(userId_3, 0);
        });
    });
    describe("placeOrders", async () => {
        it("one can not place orders, if auction is not yet initiated", async () => {
            await truffleAssert.reverts(easyAuction.placeBuyOrders(0, [new BN(10).pow(new BN(18))], [new BN(10).pow(new BN(18)).add(new BN(1))], [queueStartElement]), "Auction no longer in order placement phase");
        });
        it("one can not place orders, if auction is over", async () => {
            buyToken = await ERC20.new("BT", "BT");
            await buyToken.mint(user_1, new BN(10).pow(new BN(30)));
            await buyToken.approve(easyAuction.address, new BN(10).pow(new BN(30)));
            sellToken = await ERC20.new("BT", "BT");
            await sellToken.mint(user_1, new BN(10).pow(new BN(30)));
            await sellToken.approve(easyAuction.address, new BN(10).pow(new BN(30)));
            const auctionId = await sendTxAndGetReturnValue(easyAuction.initiateAuction, sellToken.address, buyToken.address, 60 * 60, new BN(10).pow(new BN(18)), new BN(10).pow(new BN(18)));
            await closeAuction(easyAuction, auctionId);
            await truffleAssert.reverts(easyAuction.placeBuyOrders(0, [new BN(10).pow(new BN(18))], [new BN(10).pow(new BN(18)).add(new BN(1))], [queueStartElement]), "Auction no longer in order placement phase");
        });
        it("one can not place orders, with a worser or same rate", async () => {
            buyToken = await ERC20.new("BT", "BT");
            await buyToken.mint(user_1, new BN(10).pow(new BN(30)));
            await buyToken.approve(easyAuction.address, new BN(10).pow(new BN(30)));
            sellToken = await ERC20.new("BT", "BT");
            await sellToken.mint(user_1, new BN(10).pow(new BN(30)));
            await sellToken.approve(easyAuction.address, new BN(10).pow(new BN(30)));
            const auctionId = await sendTxAndGetReturnValue(easyAuction.initiateAuction, sellToken.address, buyToken.address, 60 * 60, new BN(10).pow(new BN(18)), new BN(10).pow(new BN(18)));
            await truffleAssert.reverts(easyAuction.placeBuyOrders(auctionId, [new BN(10).pow(new BN(18)).add(new BN(1))], [new BN(10).pow(new BN(18))], [queueStartElement]), "limit price not better than mimimal offer");
            await truffleAssert.reverts(easyAuction.placeBuyOrders(auctionId, [new BN(10).pow(new BN(18))], [new BN(10).pow(new BN(18))], [queueStartElement]), "limit price not better than mimimal offer");
        });
        it("places a new order and checks that tokens were transferred", async () => {
            buyToken = await ERC20.new("BT", "BT");
            await buyToken.mint(user_1, new BN(10).pow(new BN(30)));
            await buyToken.approve(easyAuction.address, new BN(10).pow(new BN(30)));
            sellToken = await ERC20.new("BT", "BT");
            await sellToken.mint(user_1, new BN(10).pow(new BN(30)));
            await sellToken.approve(easyAuction.address, new BN(10).pow(new BN(30)));
            const auctionId = await sendTxAndGetReturnValue(easyAuction.initiateAuction, sellToken.address, buyToken.address, 60 * 60, new BN(10).pow(new BN(18)), new BN(10).pow(new BN(18)));
            const balanceBeforeOrderPlacement = await buyToken.balanceOf(user_1);
            const sellAmount = new BN(10).pow(new BN(18)).add(new BN(1));
            const buyAmount = new BN(10).pow(new BN(18));
            await easyAuction.placeBuyOrders(auctionId, [buyAmount, buyAmount], [sellAmount, sellAmount.add(new BN(1))], [queueStartElement, queueStartElement]);
            assert.equal((await buyToken.balanceOf(easyAuction.address)).toString(), buyAmount.add(buyAmount).toString());
            assert.equal((await buyToken.balanceOf(user_1)).toString(), balanceBeforeOrderPlacement.sub(buyAmount).sub(buyAmount).toString());
        });
        it("fails, if transfers are failing", async () => {
            buyToken = await ERC20.new("BT", "BT");
            await buyToken.mint(user_1, new BN(10).pow(new BN(30)));
            await buyToken.approve(easyAuction.address, new BN(10).pow(new BN(30)));
            sellToken = await ERC20.new("BT", "BT");
            await sellToken.mint(user_1, new BN(10).pow(new BN(30)));
            await sellToken.approve(easyAuction.address, new BN(10).pow(new BN(30)));
            const auctionId = await sendTxAndGetReturnValue(easyAuction.initiateAuction, sellToken.address, buyToken.address, 60 * 60, new BN(10).pow(new BN(18)), new BN(10).pow(new BN(18)));
            const balanceBeforeOrderPlacement = await buyToken.balanceOf(user_1);
            const sellAmount = new BN(10).pow(new BN(18)).add(new BN(1));
            const buyAmount = new BN(10).pow(new BN(18));
            await buyToken.approve(easyAuction.address, new BN(0));
            await truffleAssert.reverts(easyAuction.placeBuyOrders(auctionId, [buyAmount, buyAmount], [sellAmount, sellAmount.add(new BN(1))], [queueStartElement, queueStartElement]), "transfer failed");
        });
    });
});
