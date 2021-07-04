// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@chainlink/contracts/src/v0.7/interfaces/AggregatorV3Interface.sol";
import "./libraries/SafeDecimalMath.sol";
import "./interfaces/IPriceConsumer.sol";
import "./libraries/SafeDecimalMath.sol";

contract ChainlinkPriceConsumer is OwnableUpgradeable, IPriceConsumer {
    using SafeMath for uint;
    event RegisterFeeders(address[] assets, address[] feeders);

    mapping(address => address) _assetFeederMap;

    function initialize(address[] calldata assets, address[] calldata feeders) external initializer {
        __Ownable_init();
        registerFeeders(assets, feeders);
    }

    function registerFeeders(address[] calldata assets, address[] calldata feeders) public onlyOwner {
        require(assets.length == feeders.length, "Invalid parameters");
        for (uint i = 0; i < assets.length; i++) {
            _assetFeederMap[assets[i]] = feeders[i];
        }
        emit RegisterFeeders(assets, feeders);
    }

    function toDecimals18(uint value, uint decimals) private pure returns (uint){
        if (decimals == 18) {
            return value;
        } else if (decimals < 18) {
            return value.mul(uint(10).pow(uint(18).sub(decimals)));
        } else {
            return value.div(uint(10).pow(decimals.sub(18)));
        }
    }

    function queryPrice(address asset) override external view returns (uint price, uint lastUpdated) {
        price = 0;
        lastUpdated = 0;
        if (_assetFeederMap[asset] != address(0)) {
            AggregatorV3Interface aggregator = AggregatorV3Interface(_assetFeederMap[asset]);
            (,int answer,,uint updatedAt,) = aggregator.latestRoundData();
            price = toDecimals18(uint(answer < 0 ? 0 : answer), uint(aggregator.decimals()));
            lastUpdated = updatedAt;
        }
    }
}
