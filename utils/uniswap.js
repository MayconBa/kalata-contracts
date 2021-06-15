const hre = require("hardhat");
const {humanBN} = require('./maths')

async function addLiquidity(uniswapRouter, lp, tokenA, tokenB, tokenAAmount, tokenBAmount) {
    await tokenA.connect(lp).approve(uniswapRouter.address, tokenAAmount.toString());
    await tokenB.connect(lp).approve(uniswapRouter.address, tokenBAmount.toString());

    //console.log(`addLiquidity,tokenAAmount:${humanBN(tokenAAmount)}, allowanceA:${humanBN(await tokenA.allowance(lp.address,uniswapRouter.address))},balanceOfA:${humanBN(await tokenA.balanceOf(lp.address))}`);
    //console.log(`addLiquidity,tokenBAmount:${humanBN(tokenBAmount)}, allowanceB:${humanBN(await tokenB.allowance(lp.address,uniswapRouter.address))},balanceOfB:${humanBN(await tokenB.balanceOf(lp.address))}`);

    let deadline = (await hre.web3.eth.getBlock("latest")).timestamp + 16000;
    await uniswapRouter.connect(lp).addLiquidity(
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
