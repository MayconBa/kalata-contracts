// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "../interfaces/ICollateral.sol";

contract ContractProxy {

    function callCollateralDeposit(address collateral, address asset, uint amount) public {
        ICollateral(collateral).deposit(asset, amount);
    }
}
