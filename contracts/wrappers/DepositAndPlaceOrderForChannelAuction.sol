pragma solidity >=0.6.8;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../ChannelAuction.sol";
import "../interfaces/IWETH.sol";

contract DepositAndPlaceOrderForChannelAuction {
    ChannelAuction public immutable channelAuction;
    IWETH public immutable nativeTokenWrapper;

    constructor(address channelAuctionAddress, address _nativeTokenWrapper)
        public
    {
        nativeTokenWrapper = IWETH(_nativeTokenWrapper);
        channelAuction = ChannelAuction(channelAuctionAddress);
        IERC20(_nativeTokenWrapper).approve(channelAuctionAddress, uint256(-1));
    }

    function depositAndPlaceOrder(
        uint256 auctionId,
        uint96 _minBuyAmount,
        bytes32 _prevSellOrder
    ) external payable {
        require(msg.value < 2**96, "too much value sent");
        nativeTokenWrapper.deposit{value: msg.value}();
        uint96 sellAmount = uint96(msg.value);

        channelAuction.placeSellOrdersOnBehalf(
            auctionId,
            _minBuyAmount,
            sellAmount,
            _prevSellOrder,
            msg.sender
        );
    }
}
