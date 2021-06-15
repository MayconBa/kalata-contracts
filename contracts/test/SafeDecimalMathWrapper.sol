// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "../libraries/SafeDecimalMath.sol";

contract SafeDecimalMathWrapper {
    using SafeDecimalMath for uint;

    function unit() public pure returns (uint) {
        return SafeDecimalMath.unit();
    }

    function preciseUnit() public pure returns (uint) {
        return SafeDecimalMath.preciseUnit();
    }

    function multiplyDecimal(uint x, uint y) public pure returns (uint) {
        return x.multiplyDecimal(y);
    }

    function multiplyDecimalRound(uint x, uint y) public pure returns (uint) {
        return x.multiplyDecimalRound(y);
    }

    function multiplyDecimalRoundPrecise(uint x, uint y) public pure returns (uint) {
        return x.multiplyDecimalRoundPrecise(y);
    }

    function divideDecimal(uint x, uint y) public pure returns (uint) {
        return x.divideDecimal(y);
    }

    function divideDecimalRound(uint x, uint y) public pure returns (uint) {
        return x.divideDecimalRound(y);
    }

    function divideDecimalRoundPrecise(uint x, uint y) public pure returns (uint) {
        return x.divideDecimalRoundPrecise(y);
    }

    function decimalToPreciseDecimal(uint i) public pure returns (uint) {
        return i.decimalToPreciseDecimal();
    }

    function preciseDecimalToDecimal(uint i) public pure returns (uint) {
        return i.preciseDecimalToDecimal();
    }
}
