// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

/**
 * @dev Wrappers over Solidity's uintXX/intXX casting operators with added overflow
 * checks.
 *
 * Logic was copied and modified from here: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/SafeCast.sol
 */
library SafeCast {
    function toUint96(uint256 value) internal pure returns (uint96) {
        require(value < 2**96, "SafeCast: value doesn't fit in 96 bits");
        return uint96(value);
    }

    function toUint64(uint256 value) internal pure returns (uint64) {
        require(value < 2**64, "SafeCast: value doesn't fit in 64 bits");
        return uint64(value);
    }
}
