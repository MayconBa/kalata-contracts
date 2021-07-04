const {deploy: deployOracle} = require("./deployOracle")
const {deploy: deployStaking} = require("./deployStaking")
const {deploy: deployUniswapV2Factory} = require("./deployUniswapV2Factory")
const {deploy: deployUniswapV2Router02} = require("./deployUniswapV2Router02")
const {deploy: deployTimelock} = require("./deployTimelock")
const {deploy: deployFactory} = require("./deployFactory")
const {deploy: deployMint} = require("./deployMint")
const {deploy: deployRouter} = require("./deployRouter")
const {deploy: deployKala} = require("./deployKala")
const {deploy: deployBUSD} = require("./deployBUSD")
const {deploy: deployWBNB} = require("./deployWBNB")
const {deploy: deployMockData} = require("./deployMockData")

async function deployAll(hre) {
    await deployBUSD(hre);
    await deployKala(hre);
    await deployWBNB(hre);
    await deployTimelock(hre);
    await deployUniswapV2Factory(hre);
    await deployUniswapV2Router02(hre);
    await deployOracle(hre);
    await deployStaking(hre);
    await deployMint(hre);
    await deployFactory(hre);
    await deployRouter(hre);

}

module.exports = {
    deployOracle,
    deployStaking,
    deployUniswapV2Factory,
    deployUniswapV2Router02,
    deployFactory,
    deployMint,
    deployKala,
    deployAll,
    deployBUSD,
    //deployWBNB,
    deployTimelock,
    deployMockData,
}
