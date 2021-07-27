const {readContracts, saveContracts} = require("../utils/resources")
const UniswapV2FactoryArtifact = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const {updateWebContracts} = require("../utils/resources");

const CONTRACT_CLASS = "UniswapV2Factory";

async function deploy(hre) {

    const accounts = await hre.ethers.getSigners();
    let deployer = accounts[0];
    let feeToSetter = deployer.address;
    const {abi, bytecode} = UniswapV2FactoryArtifact;
    const {abi:intrefaceAbi} = await hre.artifacts.readArtifact("IUniswapV2Factory");
    let deployedContracts = readContracts(hre) || {};
    let deployedContract = deployedContracts[CONTRACT_CLASS] || {name: CONTRACT_CLASS, address: null, initialize: null, deployer: deployer.address, deploy: true, upgradable: false, abi, bytecode};
    if (deployedContract.deploy) {
        let UniswapV2Factory = new hre.web3.eth.Contract(abi, null, {data: bytecode});
        let result = await UniswapV2Factory.deploy({data: bytecode, arguments: [feeToSetter]}).send({
            from: deployer.address,
        });
        let address = result._address;
        deployedContract.address = address;
        deployedContract.initialize = {feeToSetter};
        console.log(`${CONTRACT_CLASS} deployed to network ${hre.network.name} with address ${address}`);
        deployedContract.deploy = false;
        deployedContracts[CONTRACT_CLASS] = deployedContract
        saveContracts(hre, deployedContracts);
    }
    updateWebContracts(hre, CONTRACT_CLASS, {address: deployedContract.address, abi:intrefaceAbi});

}


module.exports = {
    deploy
}
