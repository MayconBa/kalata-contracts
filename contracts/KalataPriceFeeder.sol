// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IOracle.sol";
import "./libraries/String.sol";
import "./libraries/SafeDecimalMath.sol";
import "./interfaces/IPriceConsumer.sol";

contract KalataPriceFeeder is OwnableUpgradeable, IPriceConsumer {
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

    function initialize() external initializer {
        __Ownable_init();
    }

    function registerAssets(address[] memory assets, address[] memory feeders) public onlyOwner {
        require(assets.length == feeders.length, "Invalid parameters");
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
        require(assets.length == prices.length, "Invalid parameters");
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
        require(asset != address(0) && price > 0, "_feedPrice: Invalid parameters");
        require(feeder == _assetFeederMap[asset], "_feedPrice:unauthorized");
        _assetPriceMap[asset] = PriceInfo({price : price, lastUpdatedTime : block.timestamp});
    }


    function queryFeeder(address asset) public view returns (address){
        require(asset != address(0), "Invalid address");
        return _assetFeederMap[asset];
    }


    function queryAllPrices() public view returns (address[] memory assets, uint[] memory prices, uint[] memory lastUpdatedTimes){
        uint length = _assets.length;
        assets = new address[](length);
        prices = new uint[](length);
        lastUpdatedTimes = new uint[](length);

        for (uint i = 0; i < length; i++) {
            address asset = _assets[i];
            PriceInfo memory priceInfo = _assetPriceMap[asset];
            assets[i] = asset;
            prices[i] = priceInfo.price;
            lastUpdatedTimes[i] = priceInfo.lastUpdatedTime;
        }
        return (assets, prices, lastUpdatedTimes);
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
        require(asset != address(0), "Invalid asset address");
        require(feeder != address(0), "Invalid feeder address");
        _assetFeederMap[asset] = feeder;
        _assets.push(asset);
    }
}
