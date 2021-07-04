// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "./interfaces/IOracle.sol";
import "./libraries/String.sol";
import "./libraries/SafeDecimalMath.sol";
import "./interfaces/IPriceConsumer.sol";

////https://api.coingecko.com/api/v3/coins/list?include_platform=false
////https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,01coin&vs_currencies=usd
contract Oracle is OwnableUpgradeable, IOracle {
    using EnumerableSet for EnumerableSet.AddressSet;

    EnumerableSet.AddressSet private _priceConsumers;
    EnumerableSet.AddressSet private _assets;

    function initialize() external initializer {
        __Ownable_init();
    }

    function registerPriceConsumers(address[] memory priceConsumers) public onlyOwner {
        for (uint i = 0; i < priceConsumers.length; i++) {
            _priceConsumers.add(priceConsumers[i]);
        }
    }

    function registerAssets(address[] memory assets) public onlyOwner {
        for (uint i = 0; i < assets.length; i++) {
            _assets.add(assets[i]);
        }
    }

    function queryPrice(address asset) override external view returns (uint price, uint lastUpdatedTime){
        return _queryPrice(asset);
    }

    function queryAllPrices() override external view returns (address[] memory assets, uint[] memory prices, uint[] memory lastUpdatedTimes){
        uint length = _assets.length();
        assets = new address[](length);
        prices = new uint[](length);
        lastUpdatedTimes = new uint[](length);
        for (uint i = 0; i < length; i++) {
            address asset = _assets.at(i);
            (uint price,uint lastUpdatedTime) = _queryPrice(asset);
            assets[i] = asset;
            prices[i] = price;
            lastUpdatedTimes[i] = lastUpdatedTime;
        }
    }

    function _queryPrice(address asset) private view returns (uint price, uint lastUpdatedTime){
        price = 0;
        lastUpdatedTime = 0;
        for (uint i = 0; i < _priceConsumers.length(); i++) {
            (uint p,uint t) = IPriceConsumer(_priceConsumers.at(i)).queryPrice(asset);
            if (t > lastUpdatedTime) {
                price = p;
                lastUpdatedTime = t;
            }
        }
    }

}
