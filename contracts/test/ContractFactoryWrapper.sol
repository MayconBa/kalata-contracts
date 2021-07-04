// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

//import "hardhat/console.sol";
import "../libraries/ContractFactory.sol";
import "../libraries/Bytes32.sol";
import "../BEP20Token.sol";

contract ContractFactoryWrapper {
    using ContractFactory for bytes;
    using Bytes32 for bytes32;

    mapping(bytes32 => address) symbolAddressMap;

    function deploy(bytes memory code, bytes32 salt) external returns (address addr) {
        addr = code.deploy(salt);
    }

    function deployAsset(bytes32 name, bytes32 symbol, uint initSupply) external returns (address addr){
        bytes memory code = type(BEP20Token).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(name, symbol));
        addr = code.deploy(salt);
        BEP20Token(addr).initialize(name.convertToString(), symbol.convertToString(), initSupply);
        symbolAddressMap[symbol] = addr;
    }

    function getAddress(bytes32 symbol) external view returns (address){
        return symbolAddressMap[symbol];
    }
}
