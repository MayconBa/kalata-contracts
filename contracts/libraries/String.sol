// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

library String {
    function equals(string calldata a, string calldata b) internal pure returns (bool) {
        bytes memory bytesA = bytes(a);
        bytes memory bytesB = bytes(b);
        return bytesB.length == bytesB.length ? keccak256(bytesA) == keccak256(bytesB) : false;
    }

    function convertToBytes32(string memory _source) internal pure returns (bytes32 result) {
        bytes memory tempEmptyStringTest = bytes(_source);
        if (tempEmptyStringTest.length == 0) {
            return 0x0;
        }
        assembly {
            result := mload(add(_source, 32))
        }
    }
}