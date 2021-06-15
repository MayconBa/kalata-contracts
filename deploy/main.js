module.exports = async (hre) => {
    const {deleteResource} = require("../utils/resources")
    const publish = require("../publish")

    if (hre.network.name === "hardhat") {
        deleteResource(hre);
    }

    if (hre.network.name === "mainnet" || hre.network.name === "mainnet") {
        console.log(`Please confirm to deploy ${hre.network.name}`)
        return;
    }
    await publish.deployAll(hre);
    await publish.deployMockData(hre);
};


