// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IRouter.sol";
import "./libraries/SafeDecimalMath.sol";
import "./interfaces/IFactory.sol";

contract Router is OwnableUpgradeable, IRouter {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    struct Config {
        address uniswapFactory;
        address factory;
        address busdAddress;
        address kalaAddress;
    }

    Config private config;
    address[] private extraAssets;

    function addExtraAsset(address asset) override external onlyOwner {
        for (uint i = 0; i < extraAssets.length; i++) {
            if (extraAssets[i] == asset) {
                return;
            }
        }
        extraAssets.push(asset);
        emit AddExtraAsset(msg.sender, asset);
    }


    function removeExtraAsset(address asset) override external onlyOwner {
        for (uint i = 0; i < extraAssets.length; i++) {
            if (extraAssets[i] == asset) {
                if (i < extraAssets.length - 1) {
                    extraAssets[i] = extraAssets[extraAssets.length - 1];
                }
                delete extraAssets[extraAssets.length - 1];
                break;
            }
        }
        emit RemoveExtraAsset(msg.sender, asset);
    }

    function queryExtraAssets() override external view returns (address[]  memory) {
        return extraAssets;
    }

    function initialize(address uniswapFactory, address factory, address busdAddress, address kalaAddress) external initializer {
        __Ownable_init();
        config = Config(uniswapFactory, factory, busdAddress, kalaAddress);
    }

    function queryAssetPricesFromPool() override external view returns (
        address[] memory assets,
        uint[] memory prices
    ){
        (,,address[] memory addresses,) = IFactory(config.factory).queryAssets();
        assets = new address[](addresses.length + 1 + extraAssets.length);
        prices = new uint[](addresses.length + 1 + extraAssets.length);
        uint index = 0;
        assets[index++] = config.kalaAddress;
        for (uint i = 0; i < addresses.length; i++) {
            assets[index++] = addresses[i];
        }
        for (uint i = 0; i < extraAssets.length; i++) {
            assets[index++] = extraAssets[i];
        }
        for (uint i = 0; i < assets.length; i++) {
            address assetAddress = assets[i];
            address pairAddress = IUniswapV2Factory(config.uniswapFactory).getPair(assetAddress, config.busdAddress);
            if (pairAddress != address(0)) {
                (uint112 reserve0, uint112 reserve1,) = IUniswapV2Pair(pairAddress).getReserves();
                uint busdReserve = uint(config.busdAddress < assetAddress ? reserve0 : reserve1);
                uint assetReserve = uint(config.busdAddress < assetAddress ? reserve1 : reserve0);
                prices[i] = assetReserve > 0 ? busdReserve.divideDecimal(assetReserve) : 0;
            }
        }
    }
}
