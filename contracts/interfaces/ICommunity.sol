// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

///The Community Contract holds the funds of the Community Pool, which can be spent through a governance poll.
interface ICommunity {
    struct Config {
        //Governance contract
        address governance;

        // Kalata Token address
        address govToken;

        //@dev spend limit per each `spend` request
        uint spendLimit;
    }


    //Can only be issued by the owner. Updates the Community Contract's configuration.
    function updateConfig(address governance, address govToken, uint spendLimit) external;

    /// Spend
    /// Owner can execute spend operation to send `amount` of KALA token to `recipient` for community purpose
    function spend(address recipient, uint amount) external;

    function queryConfig() external returns (address governance, address govToken, uint spendLimit);

    event UpdateConfig(address governance, uint spendLimit);
    event Spend(address recipient, uint amount);
}


