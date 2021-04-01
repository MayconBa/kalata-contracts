const hre = require("hardhat");

async function addLiquidity(uniswapRouter, lp, tokenA, tokenB, tokenAAmount, tokenBAmount) {
    await tokenA.approve(uniswapRouter.address, tokenAAmount.toString());
    await tokenB.approve(uniswapRouter.address, tokenBAmount.toString());
    let deadline = (await hre.web3.eth.getBlock("latest")).timestamp + 16000;
    await uniswapRouter.addLiquidity(
        tokenA.address,
        tokenB.address,
        tokenAAmount.toString(),
        tokenBAmount.toString(),
        tokenAAmount.toString(),
        tokenBAmount.toString(),
        lp.address,
        deadline, {gasLimit: 2500000}
    );
}

module.exports = {
    addLiquidity
}