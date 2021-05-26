//npx hardhat run script\checkContracts.js --network testnet --no-compile
const {bytesToString} = require("../utils/bytes");
const hre = require("hardhat");
const {readContracts} = require("../utils/resources");
const {readAssets} = require("../utils/assets");
const {toUnitString, humanBN, humanBNNumber} = require("../utils/maths")

async function main() {
    const deployedContracts = readContracts(hre);
    const factoryInstance = await loadContract(deployedContracts, 'Factory');
    const oracleInstance = await loadContract(deployedContracts, 'Oracle');
    const uniswapRouterInstance = await loadContract(deployedContracts, 'UniswapV2Router02', 'IUniswapV2Router02');
    const uniswapFactoryInstance = await loadContract(deployedContracts, 'UniswapV2Factory', 'IUniswapV2Factory');

    const deployedAssets = readAssets(hre);
    console.log(deployedAssets);

    // let assets = await checkQueryAssets(factoryInstance);
    // await checkQueryAllPrices(oracleInstance);
    // for (const asset of assets) {
    //     await checkReserves(asset);
    // }

    await new Promise(resolve => setTimeout(resolve, 2 * 1000));

}

async function loadPairInstance(pairAddress) {
    const Artifact = await hre.artifacts.readArtifact('IUniswapV2Pair');
    return new hre.ethers.Contract(pairAddress, Artifact.abi)
}

async function loadAssetInstance(assetAddress) {
    const Artifact = await hre.artifacts.readArtifact('IBEP20Token');
    return new hre.ethers.Contract(assetAddress, Artifact.abi)
}


async function loadContract(deployedContracts, name, artifactName = null) {
    const accounts = await hre.ethers.getSigners();
    const signer = accounts[0];
    const factoryAddress = deployedContracts[name].address;
    const Artifact = await hre.artifacts.readArtifact(artifactName ? artifactName : name);
    return new hre.ethers.Contract(factoryAddress, Artifact.abi, signer)
}

async function checkQueryAssets(factoryInstance) {
    let assets = await factoryInstance.queryAssets();
    let result = assets['names'].map((name, index) => {
        return {
            name: bytesToString(name),
            symbol: bytesToString(assets['symbols'][index]),
            address: assets['addresses'][index],
            pair: assets['busdPairAddresses'][index]
        }
    })
    console.log(result);
    return result;

}

// https://hackmd.io/zDybBWVAQN67BkFujyf52Q#13-%E8%B4%AD%E4%B9%B0Buy
async function doBuy(uniswapRouterInstance) {
    let busdAmount = toUnitString("")
}

async function checkQueryAllPrices(oracleInstance) {
    let result = await oracleInstance.queryAllPrices();
    let assets = result['assets'];
    let prices = result['prices'];
    for (let i = 0; i < assets.length; i++) {
        console.log(assets[i], humanBNNumber(prices[i]))
    }
}


async function checkReserves(asset) {
    const pairInstance = await loadPairInstance(asset.pair);
    let result = await pairInstance.getReserves();
    console.log("pool:", asset.symbol, humanBNNumber(result['reserve0']), humanBNNumber(result['reserve1']));
}


main()
    .then(() => console.log(" "))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
