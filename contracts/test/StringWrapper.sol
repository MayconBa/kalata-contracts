// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "../libraries/String.sol";

contract StringWrapper {
    using String for string;

    function equals(string calldata a, string calldata b) external pure returns (bool) {
        return a.equals(b);
    }

    function convertToBytes32(string memory _source) external pure returns (bytes32) {
        return _source.convertToBytes32();
    }
}
