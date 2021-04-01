// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

import "./IBEP20.sol";

interface IBEP20Token is IBEP20 {


    /** @dev Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     */
    function mint(address account, uint256 amount) external;

    /**
     * @dev Destroys `amount` tokens from `account`, reducing the
     * total supply.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     * - `account` must have at least `amount` tokens.
     */
    function burn(address account, uint256 amount) external;

    /**
        Mint/Factory/Gov should have permission to invoke mint/burn methods
    */
    function registerMinters(address[] memory minters) external;

    function clearMinters() external;

    function queryMinters() external view returns (address[] memory _minters);

}
