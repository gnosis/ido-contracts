// SPDX-License-Identifier: LGPL-3.0-or-later
pragma solidity >=0.6.8;
import "../interfaces/AllowListVerifier.sol";

contract StateChangingAllowListVerifier {
    bytes32 public test = bytes32(0);

    function isAllowed(
        address user,
        uint256 auctionId,
        bytes calldata callData
    ) external returns (bytes4) {
        test = keccak256(abi.encode(user, auctionId, callData));
        return AllowListVerifierHelper.MAGICVALUE;
    }
}
