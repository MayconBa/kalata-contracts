pragma solidity >=0.6.0;

import "./IBEP20.sol";

interface IBEP20Token is IBEP20 {

    function mint(address account, uint256 amount) external;

    function burn(address account, uint256 amount) external;

    function registerMinters(address[] memory minters) external;

    function clearMinters() external;

}
