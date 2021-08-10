// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

// Helper contract
interface IRouter {

    event AddExtraAsset(address indexed sender, address indexed asset);
    event RemoveExtraAsset(address indexed sender, address indexed asset);
    event UpdateConfig(address indexed sender, address uniswapFactory, address factory, address busdAddress, address kalaAddress);

    function queryAssetPricesFromPool() external view returns (address[] memory assets, uint[] memory prices);

    function addExtraAsset(address asset) external;

    function removeExtraAsset(address asset) external;

    function queryExtraAssets() external view returns (address[] memory);

    function updateConfig(address uniswapFactory, address factory, address busdAddress, address kalaAddress) external;

    function queryConfig() external returns (address uniswapFactory, address factory, address busdAddress, address kalaAddress);

}


