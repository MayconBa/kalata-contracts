// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "../interfaces/IFactory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/IRouter.sol";
import "../libraries/SafeDecimalMath.sol";

contract Router is OwnableUpgradeable, IRouter {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    struct Config {
        address factory;
        address busdAddress;
    }

    Config config;

    function initialize(address factory, address busdAddress) external virtual initializer {
        __Ownable_init();
        config = Config(factory, busdAddress);
    }

    function queryAssetPricesFromPool() override external view returns (
        address[] memory assets,
        uint[] memory prices
    ){
        (,,address[] memory addresses, address[] memory busdPairAddresses) = IFactory(config.factory).queryAssets();
        assets = addresses;
        prices = new uint[](assets.length);
        for (uint i = 0; i < busdPairAddresses.length; i++) {
            address assetAddress = addresses[i];
            (uint112 reserve0, uint112 reserve1,) = IUniswapV2Pair(busdPairAddresses[i]).getReserves();
            uint busdReserve = uint(config.busdAddress < assetAddress ? reserve0 : reserve1);
            uint assetReserve = uint(config.busdAddress < assetAddress ? reserve1 : reserve0);
            prices[i] = busdReserve.divideDecimal(assetReserve);
        }
    }
}
