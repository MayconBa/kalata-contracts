// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "./interfaces/IRouter.sol";
import "./libraries/SafeDecimalMath.sol";
import "./interfaces/IFactory.sol";

contract Router is OwnableUpgradeable, IRouter {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    address private _uniswapFactory;
    address private _factory;
    address private _busdAddress;
    address private _kalaAddress;
    address[] private _extraAssets;

    function addExtraAsset(address asset) override external onlyOwner {
        for (uint i = 0; i < _extraAssets.length; i++) {
            if (_extraAssets[i] == asset) {
                return;
            }
        }
        _extraAssets.push(asset);
        emit AddExtraAsset(msg.sender, asset);
    }


    function removeExtraAsset(address asset) override external onlyOwner {
        for (uint i = 0; i < _extraAssets.length; i++) {
            if (_extraAssets[i] == asset) {
                if (i < _extraAssets.length - 1) {
                    _extraAssets[i] = _extraAssets[_extraAssets.length - 1];
                }
                delete _extraAssets[_extraAssets.length - 1];
                break;
            }
        }
        emit RemoveExtraAsset(msg.sender, asset);
    }

    function queryExtraAssets() override external view returns (address[]  memory) {
        return _extraAssets;
    }

    function initialize(address uniswapFactory, address factory, address busdAddress, address kalaAddress) external initializer {
        __Ownable_init();
        _updateConfig(uniswapFactory, factory, busdAddress, kalaAddress);
    }

    function updateConfig(address uniswapFactory, address factory, address busdAddress, address kalaAddress) override external {
        _updateConfig(uniswapFactory, factory, busdAddress, kalaAddress);
    }

    function queryConfig() override external view returns (address uniswapFactory, address factory, address busdAddress, address kalaAddress){
        uniswapFactory = _uniswapFactory;
        factory = _factory;
        busdAddress = _busdAddress;
        kalaAddress = _kalaAddress;
    }

    function _updateConfig(address uniswapFactory, address factory, address busdAddress, address kalaAddress) private {
        require(
            uniswapFactory != address(0) && factory != address(0) && busdAddress != address(0) && kalaAddress != address(0),
            "Router: _UPDATE_CONFIG_INVALD_PARAMETERS"
        );
        _uniswapFactory = uniswapFactory;
        _factory = factory;
        _busdAddress = busdAddress;
        _kalaAddress = kalaAddress;
        emit UpdateConfig(msg.sender, uniswapFactory, factory, busdAddress, kalaAddress);
    }

    function queryAssetPricesFromPool() override external view returns (
        address[] memory assets,
        uint[] memory prices
    ){
        (,,address[] memory addresses,) = IFactory(_factory).queryAssets();
        assets = new address[](addresses.length + 1 + _extraAssets.length);
        prices = new uint[](addresses.length + 1 + _extraAssets.length);
        uint index = 0;
        assets[index++] = _kalaAddress;
        for (uint i = 0; i < addresses.length; i++) {
            assets[index++] = addresses[i];
        }
        for (uint i = 0; i < _extraAssets.length; i++) {
            assets[index++] = _extraAssets[i];
        }
        for (uint i = 0; i < assets.length; i++) {
            address assetAddress = assets[i];
            address pairAddress = IUniswapV2Factory(_uniswapFactory).getPair(assetAddress, _busdAddress);
            if (pairAddress != address(0)) {
                (uint112 reserve0, uint112 reserve1,) = IUniswapV2Pair(pairAddress).getReserves();
                uint busdReserve = uint(_busdAddress < assetAddress ? reserve0 : reserve1);
                uint assetReserve = uint(_busdAddress < assetAddress ? reserve1 : reserve0);
                prices[i] = assetReserve > 0 ? busdReserve.divideDecimal(assetReserve) : 0;
            }
        }
    }
}
