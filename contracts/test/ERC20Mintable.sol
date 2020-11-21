pragma solidity >=0.6.8;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Mintable is ERC20 {
    constructor(string memory name, string memory symbol)
        public
        ERC20(symbol, name)
    {}

    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }
}
