async function setBlockTimestamp(hre, time) {
    await hre.ethers.provider.send('evm_setNextBlockTimestamp', [time]);
    await hre.ethers.provider.send('evm_mine');
}

async function increaseBlockTimestamp(hre, time) {
    await setBlockTimestamp(hre, (await getBlockTimestamp(hre)) + time)
}

async function evmMine(hre, count) {
    for (let i = 0; i < count; i++) {
        await hre.ethers.provider.send('evm_mine');
    }
}


async function getBlockTimestamp(hre) {
    return (await hre.web3.eth.getBlock("latest")).timestamp;
}

async function getBlockNumber(hre) {
    return (await hre.web3.eth.getBlock("latest")).number;
}

module.exports = {
    setBlockTimestamp, getBlockTimestamp, increaseBlockTimestamp, evmMine,getBlockNumber
};

