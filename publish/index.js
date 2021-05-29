const {deploy: deployOracle} = require("./deployOracle")
const {deploy: deployStaking} = require("./deployStaking")
const {deploy: deployGovernance} = require("./deployGovernance")
const {deploy: deployUniswapV2Factory} = require("./deployUniswapV2Factory")
const {deploy: deployUniswapV2Router02} = require("./deployUniswapV2Router02")
const {deploy: deployCollector} = require("./deployCollector")
const {deploy: deployCommunity} = require("./deployCommunity")
const {deploy: deployFactory} = require("./deployFactory")
const {deploy: deployMint} = require("./deployMint")
const {deploy: deployRouter} = require("./deployRouter")
const {deploy: deployKala} = require("./deployKala")
const {deploy: deployUSD} = require("./deployUSD")
const {deploy: deployBNB} = require("./deployBNB")
const {deploy: deployMockData} = require("./deployMockData")

async function deployAll(hre) {
    await deployUSD(hre);
    await deployBNB(hre);
    await deployKala(hre);
    await deployUniswapV2Factory(hre);
    await deployUniswapV2Router02(hre);
    await deployOracle(hre);
    await deployStaking(hre);
    await deployGovernance(hre);
    await deployCollector(hre);
    await deployCommunity(hre);
    await deployMint(hre);
    await deployFactory(hre);
    await deployRouter(hre);
}

module.exports = {
    deployOracle,
    deployStaking,
    deployGovernance,
    deployUniswapV2Factory,
    deployUniswapV2Router02,
    deployCollector,
    deployCommunity,
    deployFactory,
    deployMint,
    deployKala,
    deployAll,
    deployUSD,
    deployBNB,
    deployMockData,
}
