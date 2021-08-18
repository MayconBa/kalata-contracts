//npx hardhat run scripts\verification --network testnet --no-compile
const {bytesToString} = require("../utils/bytes");
const moment = require('moment')
const hre = require("hardhat");
const {readContracts} = require("../utils/resources");
const {waitReceipt, waitPromise, randomAddress, loadToken,} = require("../utils/contract");
const {readAssets, readBUSD, readKala, readWBNB, getAddressSymbolMapping} = require("../utils/assets");
const {toUnitString, humanBN, humanBNNumber, toUnit, toBN} = require("../utils/maths")
const Contract = require("web3-eth-contract");

let factoryInstance, oracleInstance, stakingInstance, mintInstance, uniswapRouterInstance,
    uniswapFactoryInstance, routerInstance, chainlinkOralceInstance, collateralInstance;
let deployedAssets, busdToken, kalaToken, wbnbToken;


async function loadAssetInstance(assetAddress) {
    const accounts = await hre.ethers.getSigners();
    const Artifact = await hre.artifacts.readArtifact('IBEP20Token');
    return new hre.ethers.Contract(assetAddress, Artifact.abi, accounts[0])
}


async function init() {
    busdToken = await loadAssetInstance(readBUSD(hre).address);
    kalaToken = await loadAssetInstance(readKala(hre).address);
    wbnbToken = await loadAssetInstance(readWBNB(hre).address);
    const deployedContracts = readContracts(hre);
    factoryInstance = await loadContract(deployedContracts, 'Factory');
    oracleInstance = await loadContract(deployedContracts, 'Oracle');
    stakingInstance = await loadContract(deployedContracts, 'Staking');
    uniswapRouterInstance = await loadContract(deployedContracts, 'UniswapV2Router02', 'IUniswapV2Router02');
    uniswapFactoryInstance = await loadContract(deployedContracts, 'UniswapV2Factory', 'IUniswapV2Factory');
    mintInstance = await loadContract(deployedContracts, 'Mint');
    routerInstance = await loadContract(deployedContracts, 'Router');
    chainlinkOralceInstance = await loadContract(deployedContracts, "ChainlinkOracle")
    collateralInstance = await loadContract(deployedContracts, 'Collateral')
    deployedAssets = readAssets(hre);
}


async function loadContract(deployedContracts, name, artifactName = null) {
    const accounts = await hre.ethers.getSigners();
    const signer = accounts[0];
    const factoryAddress = deployedContracts[name].address;

    const Artifact = await hre.artifacts.readArtifact(artifactName ? artifactName : name);
    return new hre.ethers.Contract(factoryAddress, Artifact.abi, signer)
}


async function startDistribute() {
    const deployedContracts = readContracts(hre);
    const factoryInstance = await loadContract(deployedContracts, 'Factory');
    let time = (await hre.web3.eth.getBlock("latest")).timestamp
    await waitPromise(factoryInstance.updateDistributeStartTime(time), "updateDistributeStartTime")

    let config = require("../publish/config")[hre.network.name];


}


module.exports = {
    startDistribute
}
