pragma solidity >=0.6.8;
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

/// Idea was first mentioned in the blog:
/// https://medium.com/@PhABC/off-chain-whitelist-with-on-chain-verification-for-ethereum-smart-contracts-1563ca4b8f11

contract AllowListOffChainManaged is Ownable {
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

    constructor() public Ownable() {
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

    function hasValidAccess(bytes calldata data, address sender) external view {
        uint8 _v;
        bytes32 _r;
        bytes32 _s;
        (_v, _r, _s) = abi.decode(data, (uint8, bytes32, bytes32));
        require(isValidAccessMessage(sender, _v, _r, _s), "access denied");
    }

    /*
     * @dev Verifies if message was signed by owner to give access to _add for this contract.
     *      Assumes Geth signature prefix.
     * @param _add Address of agent with access
     * @param _v ECDSA signature parameter v.
     * @param _r ECDSA signature parameters r.
     * @param _s ECDSA signature parameters s.
     * @return Validity of access message for a given address.
     */
    function isValidAccessMessage(
        address _add,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) public view returns (bool) {
        bytes32 hash = keccak256(abi.encode(domainSeparator, _add));
        return
            owner() ==
            ecrecover(
                keccak256(
                    abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)
                ),
                _v,
                _r,
                _s
            );
    }
}
