// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "@openzeppelin/contracts/utils/Address.sol";

abstract contract SafeAccess {
    modifier nonContractAccess() {
        require(!Address.isContract(msg.sender), "CONTRACT_ACCESS_NOT_ALLOWED");
        _;
    }
}
