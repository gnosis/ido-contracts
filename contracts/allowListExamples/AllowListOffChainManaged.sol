pragma solidity >=0.6.8;
import "../interfaces/AllowListVerifier.sol";
import "../EasyAuction.sol";

// Idea was first mentioned in the blog:
// https://medium.com/@PhABC/off-chain-whitelist-with-on-chain-verification-for-ethereum-smart-contracts-1563ca4b8f11

contract AllowListOffChainManaged {
    /// @dev The EIP-712 domain type hash used for computing the domain
    /// separator.
    bytes32 private constant DOMAIN_TYPE_HASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );

    /// @dev The EIP-712 domain name used for computing the domain separator.
    bytes32 private constant DOMAIN_NAME = keccak256("AccessManager");

    /// @dev The EIP-712 domain version used for computing the domain separator.
    bytes32 private constant DOMAIN_VERSION = keccak256("v1");

    /// @dev The domain separator used for signing orders that gets mixed in
    /// making signatures for different domains incompatible. This domain
    /// separator is computed following the EIP-712 standard and has replay
    /// protection mixed in so that signed orders are only valid for specific
    /// GPv2 contracts.
    bytes32 public immutable domainSeparator;

    constructor() public {
        // NOTE: Currently, the only way to get the chain ID in solidity is
        // using assembly.
        uint256 chainId;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            chainId := chainid()
        }

        domainSeparator = keccak256(
            abi.encode(
                DOMAIN_TYPE_HASH,
                DOMAIN_NAME,
                DOMAIN_VERSION,
                chainId,
                address(this)
            )
        );
    }

    function isAllowed(
        address user,
        uint256 auctionId,
        bytes calldata callData
    ) external view returns (bytes4) {
        return isAllowedBy(user, auctionId, msg.sender, callData);
    }

    function isAllowedBy(
        address user,
        uint256 auctionId,
        address allower,
        bytes calldata callData
    ) public view returns (bytes4) {
        uint8 v;
        bytes32 r;
        bytes32 s;
        (v, r, s) = abi.decode(callData, (uint8, bytes32, bytes32));
        bytes32 hash = keccak256(abi.encode(domainSeparator, user, auctionId));
        address signer =
            ecrecover(
                keccak256(
                    abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)
                ),
                v,
                r,
                s
            );
        bytes memory allowListData =
            EasyAuction(allower).auctionAccessData(auctionId);
        if (abi.decode(allowListData, (address)) == signer) {
            return AllowListVerifierHelper.MAGICVALUE;
        } else {
            return bytes4(0);
        }
    }
}
