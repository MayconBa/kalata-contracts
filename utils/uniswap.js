const hre = require("hardhat");

async function addLiquidity(uniswapRouter, lp, tokenA, tokenB, tokenAAmount, tokenBAmount) {
    await tokenA.connect(lp).approve(uniswapRouter.address, tokenAAmount.toString());
    await tokenB.connect(lp).approve(uniswapRouter.address, tokenBAmount.toString());
    let deadline = (await hre.web3.eth.getBlock("latest")).timestamp + 16000;
    let receipt = await uniswapRouter.connect(lp).addLiquidity(
        tokenA.address,
        tokenB.address,
        tokenAAmount.toString(),
        tokenBAmount.toString(),
        tokenAAmount.toString(),
        tokenBAmount.toString(),
        lp.address,
        deadline, {gasLimit: 2500000}
    );
    await receipt.wait();
}

module.exports = {
    addLiquidity
}
