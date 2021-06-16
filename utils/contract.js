const {readContracts} = require("./resources")

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';


async function waitReceipt(promise) {
    let receipt = await promise;
    return await receipt.wait()
}

async function deploy(hre, name, contractFacotryOptions) {
    const ContractClass = await hre.ethers.getContractFactory(name, contractFacotryOptions || {});
    let instance = await ContractClass.deploy();
    await instance.deployed();
    return instance;
}


async function deployUniswapV2Factory(hre, feeToSetterAddress) {
    let [deployer] = await hre.ethers.getSigners();
    const {abi, bytecode} = require("@uniswap/v2-core/build/UniswapV2Factory.json");
    let UniswapV2Factory = new hre.web3.eth.Contract(abi, null, {data: bytecode});
    let result = await UniswapV2Factory.deploy({data: bytecode, arguments: [feeToSetterAddress]}).send({
        from: deployer.address,
    });

    return await loadContractByAbi(hre, abi, result._address, deployer);
}

async function deployUniswapV2Router02(hre, uniswapV2FactoryAddress, wethAddress) {
    let [deployer] = await hre.ethers.getSigners();
    const {abi, bytecode} = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");
    let UniswapV2Router02 = new hre.web3.eth.Contract(abi, null, {data: bytecode});
    let result = await UniswapV2Router02.deploy({data: bytecode, arguments: [uniswapV2FactoryAddress, wethAddress]}).send({
        from: deployer.address,
    });
    return await loadContractByAbi(hre, abi, result._address, deployer);
}

async function deployAndInitializeContract(hre, contractName, initializeParameters) {
    let instance = await deploy(hre, contractName);
    await instance.initialize(...initializeParameters);
    return instance;
}

async function deployToken(hre, name, symbol, initialSupply) {
    const contractFactory = await hre.ethers.getContractFactory("BEP20Token");
    const instance = await hre.upgrades.deployProxy(contractFactory, [name, symbol, initialSupply], {initializer: 'initialize'});
    await instance.deployed();
    return instance;
}


async function estiamteGasAndCallMethod(instance, methodName, params) {
    return await instance[methodName](...params, {
        gasLimit: (await instance.estimateGas[methodName](...params)).toString()
    })
}

async function loadContract(hre, contractName, contractAddress, signer) {
    // const accounts = await hre.ethers.getSigners();
    const Artifact = await hre.artifacts.readArtifact(contractName);
    //return new hre.ethers.Contract(address || readContracts(hre)[contractName].address, Artifact.abi, accounts[0]);
    return await loadContractByAbi(hre, Artifact.abi, contractAddress || readContracts(hre)[contractName].address, signer);
}

async function loadUniswapV2Factory(hre, signer) {
    const {abi} = require("@uniswap/v2-core/build/UniswapV2Factory.json");
    return await loadContractByAbi(hre, abi, readContracts(hre)['UniswapV2Factory'].address, signer);
}

async function loadUniswapV2Router02(hre, signer) {
    const {abi} = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");
    return await loadContractByAbi(hre, abi, readContracts(hre)['UniswapV2Router02'].address, signer);
}


async function loadContractByAbi(hre, abi, contractAddress, signer) {
    const accounts = await hre.ethers.getSigners();
    return new hre.ethers.Contract(contractAddress, abi, signer || accounts[0]);
}


async function loadToken(hre, contractAddress, signer) {
    return await loadContract(hre, "BEP20Token", contractAddress, signer);
}

async function loadPair(hre, contractAddress, signer) {
    const {abi} = require("@uniswap/v2-core/build/UniswapV2Pair.json");
    return await loadContractByAbi(hre, abi, contractAddress, signer);
}

function randomAddress(hre) {
    return hre.web3.eth.accounts.create().address;
}


module.exports = {
    ZERO_ADDRESS,
    deploy,
    loadContract,
    loadToken,
    estiamteGasAndCallMethod,
    deployToken,
    loadPair,
    loadUniswapV2Factory,
    loadUniswapV2Router02,
    deployAndInitializeContract,
    deployUniswapV2Factory,
    deployUniswapV2Router02,
    randomAddress,
    waitReceipt
};


