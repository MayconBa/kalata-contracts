// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;


import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/IOracle.sol";

import "../libraries/String.sol";
import "../libraries/SafeDecimalMath.sol";


////https://api.coingecko.com/api/v3/coins/list?include_platform=false
////https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,01coin&vs_currencies=usd
contract Oracle is OwnableUpgradeable, IOracle {
    Config config;
    using String for string;
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    mapping(address => PriceInfo)  assetPriceMap;
    mapping(address => address)  assetFeederMap;
    address[] assetArray;

    modifier onlyFactoryOrOwner() {
        require(config.factory == _msgSender() || _msgSender() == owner(), "unauthorized,only oracle's owner/factory can perform");
        _;
    }

    function initialize(address factory, address defaultDenominateToken) external virtual initializer {
        __Ownable_init();
        require(factory != address(0) && defaultDenominateToken != address(0), "Invalid address");
        config = Config(factory, defaultDenominateToken);
    }

    function setFactory(address factory) override external onlyOwner {
        require(factory != address(0), "Invalid address");
        config.factory = factory;
    }

    function registerAssets(address[] memory assets, address[] memory feeders) override external onlyFactoryOrOwner {
        require(assets.length == feeders.length, "Invalid parameters");
        for (uint i = 0; i < assets.length; i++) {
            _registerAsset(assets[i], feeders[i]);
        }
    }

    function registerAsset(address asset, address feeder) override external onlyFactoryOrOwner {
        _registerAsset(asset, feeder);
    }

    function _registerAsset(address asset, address feeder) internal virtual {
        require(asset != address(0), "Invalid asset address");
        require(feeder != address(0), "Invalid feeder address");
        assetFeederMap[asset] = feeder;
        assetArray.push(asset);
    }

    function feedPrices(address[] calldata assets, uint[] calldata prices) override external {
        require(assets.length == prices.length, "Invalid parameters");
        address feeder = _msgSender();
        for (uint i; i < assets.length; i++) {
            _feedPrice(feeder, assets[i], prices[i]);
        }
    }

    function feedPrice(address asset, uint price) override external {
        _feedPrice(_msgSender(), asset, price);
    }

    function _feedPrice(address feeder, address asset, uint price) internal {
        require(asset != address(0) && price > 0, "_feedPrice: Invalid parameters");
        require(feeder == assetFeederMap[asset], "_feedPrice:unauthorized");
        assetPriceMap[asset] = PriceInfo({price : price, lastUpdatedTime : block.timestamp});
    }

    function readPrice(address token) internal virtual view returns (uint price, uint lastUpdatedTime){
        if (config.defaultDenominateToken == token) {
            price = SafeDecimalMath.unit();
            lastUpdatedTime = 2 ** 256 - 1;
        } else {
            price = assetPriceMap[token].price;
            lastUpdatedTime = assetPriceMap[token].lastUpdatedTime;
        }
    }


    function queryFeeder(address asset) override external view returns (address){
        require(asset != address(0), "Invalid address");
        return assetFeederMap[asset];
    }

    //asset: Asset for which to get price
    //denominateToken: (HumanAddr / 'uusd') ,Asset in which price will be denominated
    function queryPriceByDenominate(address asset, address denominateAsset) override external view returns (uint relativePrice, uint lastUpdatedTime, uint denominateLastUpdatedTime){
        require(asset != address(0), "Invalid asset address");
        require(denominateAsset != address(0), "Invalid denominateAsset address");
        uint tokenPrice;
        uint denominateTokenPrice;
        (tokenPrice, lastUpdatedTime) = readPrice(asset);
        (denominateTokenPrice, denominateLastUpdatedTime) = readPrice(denominateAsset);
        relativePrice = tokenPrice.divideDecimal(denominateTokenPrice);
    }

    function queryAllPrices() override external view returns (address[] memory assets, uint[] memory prices, uint[] memory lastUpdatedTimes){
        uint length = assetArray.length;
        assets = new address[](length);
        prices = new uint[](length);
        lastUpdatedTimes = new uint[](length);

        for (uint i = 0; i < length; i++) {
            address asset = assetArray[i];
            PriceInfo memory priceInfo = assetPriceMap[asset];
            assets[i] = asset;
            prices[i] = priceInfo.price;
            lastUpdatedTimes[i] = priceInfo.lastUpdatedTime;
        }
        return (assets, prices, lastUpdatedTimes);
    }

    function queryPrice(address asset) override external view returns (uint price, uint lastUpdatedTime){
        price = 0;
        lastUpdatedTime = 0;
        for (uint i = 0; i < assetArray.length; i++) {
            if (asset == assetArray[i]) {
                price = assetPriceMap[asset].price;
                lastUpdatedTime = assetPriceMap[asset].lastUpdatedTime;
                break;
            }
        }
    }
}
