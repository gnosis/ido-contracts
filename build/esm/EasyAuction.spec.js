const EasyAuction = artifacts.require("EasyAuction.sol");
const ERC20 = artifacts.require("ERC20.sol");
const { encodeOrder, queueStartElement, sendTxAndGetReturnValue, closeAuction, } = require("./utilities");
contract("IterableOrderedOrderSet", function () {
    let easyAuction;
    let buyToken;
    let sellToken;
    beforeEach(async () => {
        easyAuction = await EasyAuction.new();
    });
    it("e2e - places a lot of buyOrders and calculates the price", async () => {
        buyToken = await ERC20.new("BT", "BT");
        sellToken = await ERC20.new("BT", "BT");
        const auctionId = await sendTxAndGetReturnValue(easyAuction.initiateAuction, buyToken.address, sellToken.address, 60 * 60, (10 ** 18).toString(), 10 ** 18);
        const nrTests = 30;
        for (let i = 1; i < nrTests; i++) {
            const buyOrder = encodeOrder(1, i * 10 ** 18, Math.floor(10 ** 18 / (nrTests - 2)));
            let prevBuyOrder = encodeOrder(1, (i - 1) * 10 ** 18, Math.floor(10 ** 18 / (nrTests - 2)));
            if (i == 1) {
                prevBuyOrder = queueStartElement;
            }
            await easyAuction.placeBuyOrders(auctionId, [i * 10 ** 18], [Math.floor(10 ** 18 / (nrTests - 2))], [prevBuyOrder]);
        }
        await closeAuction(easyAuction, auctionId, web3);
        const ans = await easyAuction.calculatePrice.call(auctionId);
        console.log(ans);
        console.log(ans[0] + "/" + ans[1] + " = " + ans[0].div(ans[1]));
        await easyAuction.calculatePrice.call(auctionId);
    });
});
