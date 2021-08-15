pragma solidity >=0.6.0;

import "./SafeDecimalMath.sol";

library Math {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    function powDecimal(uint x, uint n) internal pure returns (uint) {
        uint result = SafeDecimalMath.unit();
        while (n > 0) {
            if (n % 2 != 0) {
                result = result.multiplyDecimal(x);
            }
            x = x.multiplyDecimal(x);
            n /= 2;
        }
        return result;
    }
}
