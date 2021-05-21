// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/ICommunity.sol";
import "../interfaces/IBEP20Token.sol";

/*
    The Community Contract holds the funds of the Community Pool, which can be spent through a governance poll.
    The Community owner is Governance contract
*/
contract Community is OwnableUpgradeable, ICommunity {

    Config config;

    modifier onlyGovernanceOrOwner() {
        require(config.governance == _msgSender() || owner() == _msgSender(), "Only governance or owner can perform!");
        _;
    }

    //parameter owner should be the Governance Contract address
    function initialize(address governance, address govToken, uint spendLimit) external virtual initializer {
        __Ownable_init();
        _updateConfig(governance, govToken, spendLimit);

    }

    //Can only be issued by the owner. Updates the Community Contract's configuration.
    function updateConfig(address governance, address govToken, uint spendLimit) override external onlyOwner {
        _updateConfig(governance, govToken, spendLimit);
        emit UpdateConfig(governance, spendLimit);
    }

    function _updateConfig(address governance, address govToken, uint spendLimit) private {
        require(governance != address(0) && govToken != address(0) && spendLimit != 0, "Invalid parameter(s)");
        config = Config({governance : governance, govToken : govToken, spendLimit : spendLimit});
    }


    // Can only be issued by the gov. Sends the amount of KALA tokens to the designated recipient for community purpose.
    function spend(address recipient, uint amount) external override onlyGovernanceOrOwner {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Invalid amount");
        require(config.spendLimit >= amount, "Cannot spend more than spendLimit");
        IBEP20Token(config.govToken).transfer(recipient, amount);
        emit Spend(recipient, amount);
    }

    function queryConfig() override external view returns (address governance, address govToken, uint spendLimit){
        Config memory m = config;
        governance = m.governance;
        govToken = m.govToken;
        spendLimit = m.spendLimit;
    }
}
