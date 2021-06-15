// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "../libraries/Bytes32.sol";

contract Bytes32Wrapper {
    using Bytes32 for bytes32;

    function convertToString(bytes32 _bytes32) external pure returns (string memory) {
        return _bytes32.convertToString();
    }
}
