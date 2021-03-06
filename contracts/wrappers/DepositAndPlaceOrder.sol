pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../EasyAuction.sol";
import "../interfaces/IWETH.sol";

contract DepositAndPlaceOrder {
    constructor(address easyAuctionAddress, address nativeTokenWrapper) public {
        IERC20(nativeTokenWrapper).approve(easyAuctionAddress, uint256(-1));
    }

    function depositAndPlaceOrder(
        address easyAuctionAddress,
        address nativeTokenWrapper,
        uint256 auctionId,
        uint96[] memory _minBuyAmounts,
        bytes32[] memory _prevSellOrders,
        bytes calldata allowListCallData
    ) external payable returns (uint64 userId) {
        uint96[] memory sellAmounts = new uint96[](1);
        require(msg.value < 2**96, "too much value sent");
        IWETH(nativeTokenWrapper).deposit.value(msg.value)();
        sellAmounts[0] = uint96(msg.value);
        return
            EasyAuction(easyAuctionAddress).placeSellOrdersOnBehalf(
                auctionId,
                _minBuyAmounts,
                sellAmounts,
                _prevSellOrders,
                allowListCallData,
                msg.sender
            );
    }
}
