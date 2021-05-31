const {saveContracts, readContracts,  } = require("../utils/resources")
const {readBNB} = require("../utils/assets")
const UniswapV2Router02Artifact = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");
const {updateWebContracts} = require("../utils/resources");
const CONTRACT_CLASS = "UniswapV2Router02";

async function deploy(hre) {
    let deployedContracts = readContracts(hre) || {};
    const {abi, bytecode} = UniswapV2Router02Artifact;
    const {abi: interfaceAbi} = await hre.artifacts.readArtifact("IUniswapV2Router02");
    const accounts = await hre.ethers.getSigners();
    let deployer = accounts[0];
    let deployedContract = deployedContracts[CONTRACT_CLASS] || {name: CONTRACT_CLASS, address: null, initialize: null, deployer: deployer.address, abi, bytecode, deploy: true, upgradable: false};
    if (deployedContract.deploy) {
        const factory = deployedContracts['UniswapV2Factory'].address;
        const WETH = readBNB(hre).address;
        let UniswapV2Router02 = new hre.web3.eth.Contract(abi, null, {data: bytecode});
        let result = await UniswapV2Router02.deploy({data: bytecode, arguments: [factory, WETH]}).send({
            from: deployer.address,
            //gas: 1500000,
            //gasPrice: '30000000000000'
        });
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
