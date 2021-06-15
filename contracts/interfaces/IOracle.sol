// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;


///The Oracle Contract exposes an interface for accessing the latest reported price for mAssets. Price quotes are kept up-to-date by oracle feeders that are tasked with periodically fetching exchange rates from reputable sources and reporting them to the Oracle contract.
///Prices are only considered valid for 60 seconds. If no new prices are published after the data has expired, Kalata will disable CDP operations (mint, burn, deposit, withdraw) until the price feed resumes.
interface IOracle {
    struct Config {
        address factory;
        address defaultDenominateToken;
    }

    struct PriceInfo {
        uint price;
        uint lastUpdatedTime;
    }


    function setFactory(address factory) external;

    function registerAssets(address[] memory assets, address[] memory feeders) external;

    function registerAsset(address asset, address feeder) external;

    function feedPrice(address asset, uint price) external;

    function feedPrices(address[] calldata adddresses, uint[] calldata prices) external;

    function queryFeeder(address asset) external view returns (address);

    function queryPriceByDenominate(address asset, address denominateAsset) external view returns (
        uint relativePrice,
        uint lastUpdatedTime,
        uint denominateLastUpdatedTime
    );

    function queryAllPrices() external view returns (
        address[] memory assets,
        uint[] memory prices,
        uint[] memory lastUpdatedTimes
    );

    function queryPrice(address asset) external view returns (
        uint price,
        uint lastUpdatedTime
    );
}


