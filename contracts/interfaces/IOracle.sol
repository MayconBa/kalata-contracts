pragma solidity >=0.6.0;

import "./IPriceConsumer.sol";

interface IOracle is IPriceConsumer {
    function queryAllPrices() external view returns (
        address[] memory assets,
        uint[] memory prices,
        uint[] memory lastUpdatedTimes
    );
}


