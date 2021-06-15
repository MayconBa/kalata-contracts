// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "./AbstractBEP20Token.sol";

//BEP20Token is initializable and upgradable
contract BEP20Token is Initializable, AbstractBEP20Token {
    function initialize(string memory tokenName, string memory tokenSymbol, uint tokenInitSupply) public virtual initializer {
        _initialize(tokenName, tokenSymbol, tokenInitSupply);
    }
}
