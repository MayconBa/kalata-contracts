// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;


///The Collector accumulates fee rewards generated from CDP withdrawal within the protocol,
///and  converts them into UST in order to purchase KALA from the KALA-UST Uniswap pool.
///The KALA is then sent to the Governance Contract to supply trading fee rewards for KALA stakers.
interface ICollector {

    struct Config {
        // Contract address of Kalata Governance
        address governance;

        address uniswapFactory;
        address uniswapRouter;

        address baseToken;
        address govToken;

    }

    function updateConfig(address governance, address uniswapFactory, address uniswapRouter, address baseToken, address govToken) external;

    function convert(address _assetToken) external;

    // Anyone can execute send function to receive staking token rewards
    function distribute() external;

    function queryConfig() external returns (address governance, address uniswapFactory, address uniswapRouter, address baseToken, address govToken);

    event Convert(address source, address target, uint amountIn, uint amountOut);
    event Distribute(address source, address target, uint amount);
}


