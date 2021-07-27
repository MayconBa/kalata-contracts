// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IOracle.sol";
import "./libraries/String.sol";
import "./libraries/SafeDecimalMath.sol";
import "./interfaces/IPriceConsumer.sol";

contract KalataOracle is OwnableUpgradeable, IPriceConsumer {
    struct PriceInfo {
        uint price;
        uint lastUpdatedTime;
    }

    event RegisterAssets(address indexed sender, address[] assets, address[] feeders);
    event RegisterAsset(address indexed sender, address indexed asset, address feeder);
    event FeedPrice(address indexed sender, address indexed asset, uint price);
    event FeedPrices(address indexed sender, address[] adddresses, uint[] prices);

    using String for string;
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    mapping(address => PriceInfo)  private _assetPriceMap;
    mapping(address => address) private  _assetFeederMap;
    address[] private _assets;

    function initialize(address[] memory assets, address[] memory feeders) external initializer {
        __Ownable_init();
        registerAssets(assets, feeders);
    }

    function registerAssets(address[] memory assets, address[] memory feeders) public onlyOwner {
        require(assets.length == feeders.length, "KalataOracle: REGISTER_ASSETS_INVALID_PARAMS");
        for (uint i = 0; i < assets.length; i++) {
            _registerAsset(assets[i], feeders[i]);
        }
        emit RegisterAssets(msg.sender, assets, feeders);
    }

    function registerAsset(address asset, address feeder) public onlyOwner {
        _registerAsset(asset, feeder);
        emit RegisterAsset(msg.sender, asset, feeder);
    }

    function feedPrices(address[] calldata assets, uint[] calldata prices) public {
        require(assets.length == prices.length, "KalataOracle: FEED_PRICES_INVALID_PARAMS");
        address feeder = _msgSender();
        for (uint i; i < assets.length; i++) {
            _feedPrice(feeder, assets[i], prices[i]);
        }
        emit FeedPrices(msg.sender, assets, prices);
    }

    function feedPrice(address asset, uint price) public {
        _feedPrice(_msgSender(), asset, price);
        emit FeedPrice(msg.sender, asset, price);
    }

    function _feedPrice(address feeder, address asset, uint price) private {
        require(asset != address(0) && price > 0, "KalataOracle: _FEED_PRICE_INVALID_PARAMS");
        require(feeder == _assetFeederMap[asset], "KalataOracle: _FEED_PRICE_UNAUTHORIZED");
        _assetPriceMap[asset] = PriceInfo({price : price, lastUpdatedTime : block.timestamp});
    }


    function queryFeeder(address asset) public view returns (address){
        return _assetFeederMap[asset];
    }

    function queryFeeders() public view returns (address[] memory assets, address[] memory feeders){
        assets = _assets;
        feeders = new address[](assets.length);
        for (uint i = 0; i < assets.length; i++) {
            feeders[i] = _assetFeederMap[assets[i]];
        }
    }

    function queryPrice(address asset) override external view returns (uint price, uint lastUpdatedTime){
        price = 0;
        lastUpdatedTime = 0;
        for (uint i = 0; i < _assets.length; i++) {
            if (asset == _assets[i]) {
                price = _assetPriceMap[asset].price;
                lastUpdatedTime = _assetPriceMap[asset].lastUpdatedTime;
                break;
            }
        }
    }

    function _registerAsset(address asset, address feeder) private {
        require(asset != address(0) && feeder != address(0), "KalataOracle: _REGISTER_ASSET_INVALID_PARAMS");
        _assetFeederMap[asset] = feeder;
        _assets.push(asset);
    }
}
