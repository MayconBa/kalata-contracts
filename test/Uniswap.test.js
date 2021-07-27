const hre = require("hardhat");
const {expect} = require("chai");
const {
    deployUniswapV2Router02,
    deployUniswapV2Factory,
    randomAddress,
    deployToken,
    loadPair,
    getUniswapPairinitCodeHash
} = require("../utils/contract")
const {toUnitString, toUnit, fromUnit, toBN} = require("../utils/maths")
let deployer, account1;
let uniswapFactory, uniswapRouter;
let token1, token2, pair;

describe("Uniswap", () => {
    before(async () => {
        //console.log(await getUniswapPairinitCodeHash(hre));
        [deployer, account1] = await hre.ethers.getSigners();
        uniswapFactory = await deployUniswapV2Factory(hre, randomAddress(hre));
        uniswapRouter = await deployUniswapV2Router02(hre, uniswapFactory.address, randomAddress(hre));
        expect(uniswapFactory.address).to.properAddress;
        expect(uniswapRouter.address).to.properAddress;
        token1 = await deployToken(hre, "token1", "token1", toUnitString("1200000000"))
        token2 = await deployToken(hre, "token2", "token2", toUnitString("1200000000"))
        await uniswapFactory.createPair(token1.address, token2.address);
        let pairAddress = await uniswapFactory.getPair(token1.address, token2.address);
        pair = await loadPair(hre, pairAddress, deployer);
    });

    describe("createPair", async () => {
        it("pair address", async () => {
            let [tokenA, tokenB] = token1.address < token2.address ? [token1, token2] : [token2, token1];
            let tokenAAmount = toUnit("100000000");
            let tokenBAmount = toUnit("50000000");
            for (let i = 0; i < 5; i++) {
                let deadline = (await hre.web3.eth.getBlock("latest")).timestamp + 160;
                await tokenA.approve(uniswapRouter.address, tokenAAmount.toString());
                await tokenB.approve(uniswapRouter.address, tokenBAmount.toString());
                await uniswapRouter.addLiquidity(
                    tokenA.address,
                    tokenB.address,
                    tokenAAmount.toString(),
                    tokenBAmount.toString(),
                    tokenAAmount.toString(),
                    tokenBAmount.toString(),
                    deployer.address,
                    deadline, {gasLimit: 2500000}
                );
            }

            let amountIn = toUnit("2");
            let [reserveA, reserveB] = await pair.getReserves();
            let amountOutMin = await uniswapRouter.getAmountOut(amountIn.toString(), reserveA.toString(), reserveB.toString());

            amountOutMin = toBN(amountOutMin.toString()).sub(toUnit("0.01"));
            let path = [tokenA.address, tokenB.address];
            let buyer = account1.address;
            let deadline = (await hre.web3.eth.getBlock("latest")).timestamp + 160;

            await tokenA.approve(uniswapRouter.address, amountIn.toString());

            await uniswapRouter.swapExactTokensForTokens(amountIn.toString(), amountOutMin.toString(), path, buyer, deadline);
            let buyerBalanceAfter = await tokenB.balanceOf(buyer);

            expect(parseFloat(fromUnit(buyerBalanceAfter.toString()))).to.greaterThan(parseFloat(fromUnit(amountOutMin.toString())));
        });
    });

});
