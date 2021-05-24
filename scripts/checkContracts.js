//npx hardhat run script\checkContracts.js --network testnet --no-compile

const {bytesToString} = require("../utils/bytes");

const hre = require("hardhat");
const got = require('got');
const {readContracts} = require("../utils/resources");
const {toUnitString, humanBN, humanBNNumber} = require("../utils/maths")

async function main() {
    await checkAll();
    await new Promise(resolve => setTimeout(resolve, 2 * 1000));

}

async function loadContract(deployedContracts, name) {
    const accounts = await hre.ethers.getSigners();
    const signer = accounts[0];
    const factoryAddress = deployedContracts[name].address;
    const Artifact = await hre.artifacts.readArtifact(name);
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

async function checkQueryAllPrices(oracleInstance) {
    let result = await oracleInstance.queryAllPrices();
    let assets = result['assets'];
    let prices = result['prices'];
    for (let i = 0; i < assets.length; i++) {
        console.log(assets[i], humanBNNumber(prices[i]))
    }
}


async function loadPairInstance(pairAddress) {
    const accounts = await hre.ethers.getSigners();
    const Artifact = await hre.artifacts.readArtifact('IUniswapV2Pair');
    return new hre.ethers.Contract(pairAddress, Artifact.abi, accounts[0])
}


async function checkReserves(asset) {
    const pairInstance = await loadPairInstance(asset.pair);
    let result = await pairInstance.getReserves();
    console.log("pool:", asset.symbol, humanBNNumber(result['reserve0']), humanBNNumber(result['reserve1']));
}

async function checkAll() {
    const deployedContracts = readContracts(hre);
    const factoryInstance = await loadContract(deployedContracts, 'Factory');
    const oracleInstance = await loadContract(deployedContracts, 'Oracle');
    let assets = await checkQueryAssets(factoryInstance);
    await checkQueryAllPrices(oracleInstance);

    for (const asset of assets) {
        await checkReserves(asset);
    }


}


main()
    .then(() => console.log(" "))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
