// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;


import "hardhat/console.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/ICollector.sol";
import "../interfaces/IERC20.sol";
import "../libraries/SafeDecimalMath.sol";

//The Collector accumulates fee rewards generated from CDP withdrawal  within the protocol,
//and  converts them into UST in order to purchase KALA from the KALA-UST Uniswap pool.
//The KALA is then sent to the Governance Contract to supply trading fee rewards for KALA stakers.

//All the fee rewards is collected in this contract.
//TODO,find out which contract collect the fee
contract Collector is OwnableUpgradeable, ICollector {
    using SafeMath for uint;
    Config config;


    function initialize(address governance, address uniswapFactory, address uniswapRouter, address baseToken, address govToken) external virtual initializer {
        __Ownable_init();
        _updateConfig(governance, uniswapFactory, uniswapRouter, baseToken, govToken);

    }

    function updateConfig(address governance, address uniswapFactory, address uniswapRouter, address baseToken, address govToken) override external onlyOwner {
        _updateConfig(governance, uniswapFactory, uniswapRouter, baseToken, govToken);
    }

    function _updateConfig(address governance, address uniswapFactory, address uniswapRouter, address baseToken, address govToken) internal virtual {
        config = Config({
        governance : governance,
        uniswapFactory : uniswapFactory,
        govToken : govToken,
        baseToken : baseToken,
        uniswapRouter : uniswapRouter
        });
    }

    /*
        Anyone can execute convert function to swap;
        collateral token currently only support UST;
        Depending on asset_token, performs one of the following:
            if asset_token is the KALA token, buys KALA off the KALA/UST Uniswap pool with the contract's UST balance
            if asset_token is an mAsset, sells the contract's balance of that mAsset for UST(collateral token) on Uniswap
     */
    function convert(address targetToken) override external {
        require(targetToken != address(0), "Invalid assetToken address");

        address pair = IUniswapV2Factory(config.uniswapFactory).getPair(config.baseToken, targetToken);

        require(pair != address(0), "Pair not found");

        if (config.govToken == targetToken) {
            // convert from baseToken(ust) to gov token(kala)
            uint baseTokenAmount = IERC20(config.baseToken).balanceOf(address(this));
            IERC20(config.baseToken).approve(config.uniswapRouter, baseTokenAmount);

            address[] memory path = new address[](2);
            path[0] = config.baseToken;
            path[1] = targetToken;

            uint [] memory amounts = IUniswapV2Router02(config.uniswapRouter).swapExactTokensForTokens(
                baseTokenAmount, 0, path, address(this), block.timestamp.add(60)
            );
            require(amounts.length == 2, "amounts' length should be 2");

            emit Convert(config.baseToken, targetToken, baseTokenAmount, amounts[1]);
        } else {
            // convert from asset token(such as kApple) to base token
            // asset token is collected during cdp withdrawal

            uint assetAmount = IERC20(targetToken).balanceOf(address(this));
            IERC20(targetToken).approve(config.uniswapRouter, assetAmount);

            address[] memory path = new address[](2);
            path[0] = targetToken;
            path[1] = config.baseToken;

            uint[] memory amounts = IUniswapV2Router02(config.uniswapRouter).swapExactTokensForTokens(
                assetAmount, 0, path, address(this), block.timestamp.add(60)
            );

            require(amounts.length == 2, "amounts' length should be 2");
            emit Convert(targetToken, config.baseToken, assetAmount, amounts[1]);
        }
    }


    // Sends to entire balance of collector's Kalata Tokens (KALA) to governance(Governance Contract) to supply trading fee rewards for KALA stakers.
    function distribute() override external {
        uint amount = IERC20(config.govToken).balanceOf(address(this));

        //send to Governance Contract
        IERC20(config.govToken).transfer(config.governance, amount);

        emit Distribute(config.govToken, config.governance, amount);

    }

    function queryConfig() override external view returns (
        address governance, address uniswapFactory, address uniswapRouter, address baseToken, address govToken
    ){
        Config memory m = config;
        governance = m.governance;
        uniswapFactory = m.uniswapFactory;
        govToken = m.govToken;
        baseToken = m.baseToken;
        uniswapRouter = m.uniswapRouter;
    }


}