//npx hardhat run script\checkContracts.js --network testnet --no-compile

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
    console.log(assets)
    console.log('queryAssets', JSON.stringify(assets));
}

async function checkQueryAllPrices(oracleInstance) {
    let result = await oracleInstance.queryAllPrices();
    let assets = result['assets'];
    let prices = result['prices'];
    for (let i = 0; i < assets.length; i++) {
        console.log(assets[i], humanBNNumber(prices[i]))
    }
}

async function checkAll() {

    const deployedContracts = readContracts(hre);

    const factoryInstance = await loadContract(deployedContracts, 'Factory');
    const oracleInstance = await loadContract(deployedContracts, 'Oracle');

    await checkQueryAssets(factoryInstance);
    await checkQueryAllPrices(oracleInstance);


}


main()
    .then(() => console.log(" "))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
