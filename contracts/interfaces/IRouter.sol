// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

// Helper contract
interface IRouter {

    function queryAssetPricesFromPool() external view returns (
        address[] memory assets, //asset address
        uint[] memory prices //asset price
    );

}


