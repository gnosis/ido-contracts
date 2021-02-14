// SPDX-License-Identifier: LGPL-3.0-or-later
pragma solidity >=0.6.8;

library AllowListVerifierHelper {
    /// @dev Value returned by a call to `isAllowed` if the check
    /// was successfully. The value is defined as:
    /// bytes4(keccak256("isAllowed(address,uint256,bytes)"))
    bytes4 internal constant MAGICVALUE = 0x19a05a7e;
}

///
/// @dev Standardized interface for an allowList manager for easyAuction
/// The interface was inspired by EIP-1271
interface AllowListVerifier {
    /// @dev Should return whether the a specific user has access to an auction
    /// by returning the magic value from AllowListVerifierHelper
    function isAllowed(
        address _user,
        uint256 auctionId,
        bytes calldata _callData
    ) external view returns (bytes4);
}
