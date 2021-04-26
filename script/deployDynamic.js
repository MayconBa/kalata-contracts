const { ethers, upgrades } = require("hardhat");

async function main() {
    const Receiver = await ethers.getContractFactory("Receiver");
    const receiver = await Receiver.deploy();

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });