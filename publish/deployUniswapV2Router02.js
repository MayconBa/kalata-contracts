const {saveContracts, readContracts,} = require("../utils/resources")
const {readWBNB} = require("../utils/assets")
const {updateWebContracts} = require("../utils/resources");
const CONTRACT_CLASS = "UniswapV2Router02";

async function deploy(hre) {
    let deployedContracts = readContracts(hre) || {};
    const {abi, bytecode} = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");
    const {abi: interfaceAbi} = await hre.artifacts.readArtifact("IUniswapV2Router02");
    const accounts = await hre.ethers.getSigners();
    let deployer = accounts[0];
    let deployedContract = deployedContracts[CONTRACT_CLASS] || {name: CONTRACT_CLASS, deployer: deployer.address, abi, bytecode, deploy: true};
    if (deployedContract.deploy) {
        const factory = deployedContracts['UniswapV2Factory'].address;
        const WETH = readWBNB(hre).address;
        let UniswapV2Router02 = new hre.web3.eth.Contract(abi, null, {data: bytecode});
        let result = await UniswapV2Router02.deploy({data: bytecode, arguments: [factory, WETH]}).send({from: deployer.address,});
        let address = result._address;
        deployedContract.address = address;
        deployedContract.initialize = {factory, WETH};
        console.log(`${CONTRACT_CLASS} deployed to network ${hre.network.name} with address ${address}`);
        deployedContract.deploy = false;
        deployedContracts[CONTRACT_CLASS] = deployedContract
        saveContracts(hre, deployedContracts);
    }
    updateWebContracts(hre, CONTRACT_CLASS, {address: deployedContract.address, abi: interfaceAbi});
}

module.exports = {
    deploy
}
