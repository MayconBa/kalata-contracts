const publish = require("../publish");
module.exports = async (hre) => {
    const {deleteResource} = require("../utils/resources")
    const publish = require("../publish")

    if (hre.network.name === "hardhat") {
        deleteResource(hre);
    }

    await publish.deployAll(hre);
    await publish.deployAssets(hre);
    await publish.addLiquidityForAll(hre)
};


