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

    mapping(address => PriceInfo)  assetTokenPriceMap;
    mapping(address => address)  assetTokenFeederMap;
    address[] assetTokenArray;

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

    function registerAssets(address[] memory assetTokens, address[] memory feeders) override external onlyFactoryOrOwner {
        require(assetTokens.length == feeders.length, "Invalid parameters");
        for (uint i = 0; i < assetTokens.length; i++) {
            _registerAsset(assetTokens[i], feeders[i]);
        }
    }

    function registerAsset(address assetToken, address feeder) override external onlyFactoryOrOwner {
        _registerAsset(assetToken, feeder);
    }

    function _registerAsset(address assetToken, address feeder) internal virtual {
        require(assetToken != address(0), "Invalid assetToken address");
        require(feeder != address(0), "Invalid feeder address");
        assetTokenFeederMap[assetToken] = feeder;
        assetTokenArray.push(assetToken);
    }

    function feedPrices(address[] calldata assetTokens, uint[] calldata prices) override external {
        require(assetTokens.length == prices.length, "Invalid parameters");
        address feeder = _msgSender();
        for (uint i; i < assetTokens.length; i++) {
            _feedPrice(feeder, assetTokens[i], prices[i]);
        }
    }

    function feedPrice(address assetToken, uint price) override external {
        _feedPrice(_msgSender(), assetToken, price);
    }

    function _feedPrice(address feeder, address assetToken, uint price) internal {
        require(assetToken != address(0) && price > 0, "_feedPrice: Invalid parameters");
        require(feeder == assetTokenFeederMap[assetToken], "_feedPrice:unauthorized");
        assetTokenPriceMap[assetToken] = PriceInfo({price : price, lastUpdatedTime : block.timestamp});
    }

    function readPrice(address token) internal virtual view returns (uint price, uint lastUpdatedTime){
        if (config.defaultDenominateToken == token) {
            price = SafeDecimalMath.unit();
            lastUpdatedTime = 2 ** 256 - 1;
        } else {
            price = assetTokenPriceMap[token].price;
            lastUpdatedTime = assetTokenPriceMap[token].lastUpdatedTime;
        }
    }


    function queryFeeder(address assetToken) override external view returns (address){
        require(assetToken != address(0), "Invalid address");
        return assetTokenFeederMap[assetToken];
    }

    //assetToken: Asset for which to get price
    //denominateToken: (HumanAddr / 'uusd') ,Asset in which price will be denominated
    function queryPrice(address assetToken, address denominateToken) override external view returns (uint relativePrice, uint lastUpdatedTime, uint denominateLastUpdatedTime){
        require(assetToken != address(0), "Invalid assetToken address");
        require(denominateToken != address(0), "Invalid denominateToken address");
        uint tokenPrice;
        uint denominateTokenPrice;
        (tokenPrice, lastUpdatedTime) = readPrice(assetToken);
        (denominateTokenPrice, denominateLastUpdatedTime) = readPrice(denominateToken);
        relativePrice = tokenPrice.divideDecimal(denominateTokenPrice);
    }

    function queryAllPrices() override external view returns (address[] memory assetTokens, uint[] memory prices, uint[] memory lastUpdatedTimes){
        uint length = assetTokenArray.length;
        assetTokens = new address[](length);
        prices = new uint[](length);
        lastUpdatedTimes = new uint[](length);

        for (uint i = 0; i < length; i++) {
            address assetToken = assetTokenArray[i];
            PriceInfo memory priceInfo = assetTokenPriceMap[assetToken];
            assetTokens[i] = assetToken;
            prices[i] = priceInfo.price;
            lastUpdatedTimes[i] = priceInfo.lastUpdatedTime;
        }
        return (assetTokens, prices, lastUpdatedTimes);
    }


}