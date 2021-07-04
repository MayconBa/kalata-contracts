// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

// Helper contract
interface IRouter {

    function queryAssetPricesFromPool() external view returns (
        address[] memory assets, //asset address
        uint[] memory prices //asset price
    );

    function addExtraAsset(address asset) external;

    function removeExtraAsset(address asset) external;

    function queryExtraAssets() external view returns (address[] memory);

    event AddExtraAsset(address indexed sender, address indexed asset);
    event RemoveExtraAsset(address indexed sender, address indexed asset);

}


