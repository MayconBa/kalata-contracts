const {readContracts, saveContracts} = require("../utils/resources")
const {readBUSD, saveBUSD, readAssets, saveAssets, readWebAssets, saveWebAssets, readKala, saveKala, readWBNB, saveWBNB} = require("../utils/assets")
const {toUnitString} = require("../utils/maths")
const {loadToken, loadUniswapV2Factory, ZERO_ADDRESS, waitReceipt, waitPromise, deployToken} = require("../utils/contract")
const {stringToBytes32} = require('../utils/bytes')

let deployedAssets, deployedWebAssets;
let uniswapV2Factory, deployedContracts, kalataOracleInstance,
    factoryInstance, routerInstance, stakingInstance,
    mintInstance,
    chainlinkOracleInstance,
    collateralInstance, oracleInstance;
let usdToken, usdInfo
let config;

async function init(hre) {
    console.log('init begin')
    let [deployer] = await hre.ethers.getSigners();
    deployedAssets = readAssets(hre) || {};
    uniswapV2Factory = await loadUniswapV2Factory(hre);
    usdInfo = readBUSD(hre);
    usdToken = await loadToken(hre, usdInfo.address);
    deployedContracts = readContracts(hre) || {};
    deployedWebAssets = readWebAssets(hre) || {};
    config = require('./config')[hre.network.name]

    function loadContract(name) {
        let {abi, address} = deployedContracts[name]
        return new hre.ethers.Contract(address, abi, deployer);
    }

    factoryInstance = loadContract("Factory");
    routerInstance = loadContract("Router");
    kalataOracleInstance = loadContract("KalataOracle");
    oracleInstance = loadContract("Oracle");
    stakingInstance = loadContract("Staking");
    collateralInstance = loadContract("Collateral");
    mintInstance = loadContract("Mint");
    chainlinkOracleInstance = loadContract("ChainlinkOracle");
    console.log('init end')
}


async function addKalaPair(hre, force = false) {
    console.log('addKalaPair begin')
    let kala = readKala(hre);
    if (!kala.pair || force) {
        let pair = await uniswapV2Factory.getPair(kala.address, usdToken.address);
        if (pair === ZERO_ADDRESS) {
            await waitReceipt(uniswapV2Factory.createPair(kala.address, usdToken.address));
            pair = await uniswapV2Factory.getPair(kala.address, usdToken.address)
        }
        kala.pair = pair;
        saveKala(hre, kala);

        deployedWebAssets = readWebAssets(hre) || {};
        deployedWebAssets[kala.symbol] = {
            name: kala.name,
            symbol: kala.symbol,
            address: kala.address,
            pair: kala.pair,
            png: `https://app.kalata.io/media/assets/KALA.png`,
            svg: `https://app.kalata.io/media/assets/KALA.svg`,
            stakable: true,
            tradable: true,
            minable: false,
            claimTimeLimit: true,
            rewardLockable: false,
            isPair: true,
        }
        saveWebAssets(hre, deployedWebAssets);
        console.log('addKalaPair', kala.pair);

        await waitPromise(factoryInstance.updateWeight(kala.address, config.assetWeights.KALA), 'factoryInstance.updateWeight for kala')
    }
    console.log('addKalaPair end')
}


async function addWBNBPair(hre) {
    console.log('addWBNBPair begin')
    deployedWebAssets = readWebAssets(hre) || {};
    let wbnb = readWBNB(hre);
    if (!wbnb.pair) {
        let pair = await uniswapV2Factory.getPair(wbnb.address, usdToken.address);
        if (pair === ZERO_ADDRESS) {
            await waitReceipt(uniswapV2Factory.createPair(wbnb.address, usdToken.address));
            pair = await uniswapV2Factory.getPair(wbnb.address, usdToken.address)
        }
        wbnb.pair = pair;
        saveWBNB(hre, wbnb);
        deployedWebAssets[wbnb.symbol] = {
            name: wbnb.name,
            symbol: wbnb.symbol,
            address: wbnb.address,
            pair: wbnb.pair,
            png: `https://app.kalata.io/media/assets/WBNB.png`,
            svg: `https://app.kalata.io/media/assets/WBNB.svg`,
            stakable: false,
            tradable: true,
            minable: false,
            claimTimeLimit: false,
            rewardLockable: false,
            isPair: true,
        }
        saveWebAssets(hre, deployedWebAssets);
        console.log('addWBNBPair', wbnb.pair);
        let receipt = await routerInstance.addExtraAsset(wbnb.address)
        console.log("routerInstance.addExtraAsset for wbnb", receipt.hash)
        await oracleInstance.registerAssets([wbnb.address])
    }
    console.log('addWBNBPair end')

}


async function deployPair(hre, {name, symbol, type, initialSupply, sinaCode, gtimgCode, coingeckoCoinId, weight}) {
    console.log('deployPair begin', name)
    let assetInfo = deployedAssets[symbol] || {name, symbol, type, deploy: true, sinaCode, gtimgCode, coingeckoCoinId}
    deployedAssets[symbol] = assetInfo;
    if (assetInfo.deploy) {
        let bytes32Name = stringToBytes32(name);
        let bytes32Symbol = stringToBytes32(symbol);
        let factoryConfig = await factoryInstance.queryConfig();
        if (factoryConfig.baseToken.toUpperCase() !== usdToken.address.toUpperCase()) {
            console.error("factory.baseToken != usdToken", factoryConfig.baseToken, usdToken.address)
            process.exit(503);
        }
        if (!assetInfo.address) {
            let token = await deployToken(hre, name, symbol, 0);
            assetInfo.address = token.address;
            saveAssets(hre, deployedAssets);
        }
        if (!assetInfo.pair) {
            let pair = await uniswapV2Factory.getPair(assetInfo.address, usdToken.address);
            if (pair === ZERO_ADDRESS) {
                await waitPromise(uniswapV2Factory.createPair(assetInfo.address, usdToken.address), `create pair for ${name}`);
                pair = await uniswapV2Factory.getPair(assetInfo.address, usdToken.address)
            }
            assetInfo.pair = pair;
            saveAssets(hre, deployedAssets);
        }
        await waitPromise(
            factoryInstance.registerAsset(
                assetInfo.address,
                assetInfo.pair,
                bytes32Name,
                bytes32Symbol,
                config.mintAuctionDiscount,
                config.minCollateralRatio,
                weight.toString(),
                {gasLimit: 2500000}
            ), `factoryInstance.registerAsset for ${name}`
        )
        assetInfo.deploy = false;
        saveAssets(hre, deployedAssets);
        let receipt = await oracleInstance.registerAssets([assetInfo.address], {gasLimit: 2500000});
        console.log(`oracleInstance.registerAssets for ${symbol}`, receipt.hash);
    }
    deployedWebAssets[symbol] = {
        name, symbol,
        address: assetInfo.address,
        pair: assetInfo.pair,
        png: `https://app.kalata.io/media/assets/${symbol.substring(1)}.png`,
        svg: `https://app.kalata.io/media/assets/${symbol.substring(1)}.svg`,
        stakable: true,
        tradable: true,
        minable: true,
        claimTimeLimit: false,
        rewardLockable: false,
        isPair: true
    }
    saveWebAssets(hre, deployedWebAssets);
    console.log('deployPair end', name)
}

async function registerKalataOracle(hre) {
    console.log('registerKalataOracle begin')
    if (deployedContracts['KalataOracle'].assetRegistered) {
        return;
    }
    let [deployer] = await hre.ethers.getSigners();
    let assets = Object.values(deployedAssets).map(asset => asset.address);
    let feeders = assets.map(() => deployer.address);
    let receipt = await kalataOracleInstance.registerAssets(assets, feeders, {gasLimit: 2500000});
    console.log("kalataOracleInstance.registerAssets,", receipt.hash)
    deployedContracts['KalataOracle'].assetRegistered = true
    saveContracts(hre, deployedContracts)
    console.log('registerKalataOracle end')
}

// KALA-BUSD LP, 随存随取, 收益每隔72小时领取一次, 领取或者存入LP,时间重置
async function registerKalaBUSDStaking(hre, force = false) {
    console.log('registerKalaBUSDStaking begin')
    const kala = readKala(hre);
    if (!kala.pairStakingRegistered || force) {
        let interval = config.kalaBusdPoolClaimInterval
        let params = [kala.address, kala.pair]
        await waitPromise(stakingInstance.registerAsset(...params, {gasLimit: 2500000}), "stakingInstance.registerAsset for KALA-BUSD pair")
        await waitPromise(stakingInstance.updateClaimIntervals([kala.address], [interval], {gasLimit: 2500000}), "stakingInstance.updateClaimIntervals for KALA-BUSD pair")
        kala.pairStakingRegistered = true;
        saveKala(hre, kala)
    }
    console.log('registerKalaBUSDStaking end')
}

async function updateUnlockSpeed(hre, force = false) {
    console.log('updateUnlockSpeed begin')
    const kala = readKala(hre);
    if (!kala.unlockSpeedRegistered || force) {
        let params = [stakingInstance.address, [kala.pair], [config.busdPoolRewardUnlockSpeed]];
        await waitPromise(collateralInstance.updateConfig(...params, {gasLimit: 2500000}), "collateralInstance.updateConfig for BUSD-KALA pair")
        kala.unlockSpeedRegistered = true;
        saveKala(hre, kala);
    }
    console.log('updateUnlockSpeed end')
}

// 增减BUSD挖矿KALA单币池, 随存随取. 收益锁定.  锁定的奖励,通过质押KALA-BUSD来解锁.
async function registerBUSDStaking(hre, force = false) {
    console.log('registerBUSDStaking begin')
    //const weight = toUnitString("3.9");
    const weight = toUnitString("1");
    const usdInfo = readBUSD(hre);
    if (!usdInfo.stakingRegistered || force) {
        const kala = readKala(hre);
        let receipt = await factoryInstance.updateWeight(usdInfo.address, weight, {gasLimit: 2500000});
        console.log("factoryInstance.updateWeight for BUSD", receipt.hash)

        receipt = await stakingInstance.registerAsset(usdInfo.address, ZERO_ADDRESS, {gasLimit: 2500000});
        console.log("stakingInstance.registerAsset for BUSD", receipt.hash)
        await updateUnlockSpeed(hre);
        //function updateCollateralAssetMapping(address[] memory assets, address[] memory collateralAssets)
        receipt = await stakingInstance.updateCollateralAssetMapping([usdInfo.address], [kala.pair], {gasLimit: 2500000});
        console.log("stakingInstance.updateCollateralAssetMapping for BUSD -> BUSD-KALA", receipt.hash)

        deployedWebAssets['BUSD'] = {
            name: "BUSD",
            symbol: "BUSD",
            address: usdInfo.address,
            pair: null,
            png: "https://app.kalata.io/media/assets/BUSD.png",
            svg: "https://app.kalata.io/media/assets/BUSD.svg",
            tradable: false,
            minable: false,
            stakable: true,
            claimTimeLimit: false,
            rewardLockable: true,
            isPair: false
        }
        saveWebAssets(hre, deployedWebAssets);
        usdInfo.stakingRegistered = true;
        saveBUSD(hre, usdInfo)
    }
    console.log('registerBUSDStaking end')

}

async function updateDistributionSchedules(hre, force) {
    console.log('updateDistributionSchedules begin')
    let factoryInfo = deployedContracts['Factory'];
    if (!factoryInfo.scheduleUpdated || force) {
        const schedules = config.distributeSchedule;
        let startTimes = schedules.map(item => item.start);
        let endTimes = schedules.map(item => item.end);
        let amounts = schedules.map(item => item.amount);
        await waitPromise(factoryInstance.updateDistributionSchedules(startTimes, endTimes, amounts), 'updateDistributionSchedules')
        factoryInfo.scheduleUpdated = true;
        saveContracts(hre, deployedContracts);
    }
    console.log('updateDistributionSchedules end')
}

async function registerMintAssets(hre) {
    console.log('registerMintAssets begin')
    let assets = await readAssets(hre) || {};
    for (let asset of Object.values(assets).filter(item => item.minable)) {
        if (!asset.mintRegistered) {
            await waitPromise(
                mintInstance.registerAsset(asset.address, toUnitString("0.2"), toUnitString("1.5"), {gasLimit: 2500000}),
                `mintInstance.registerAsset for ${asset.symbol}`
            )
            asset.mintRegistered = true;
            saveAssets(hre, assets);
        }
        if (!asset.minterRegistered) {
            let token = await loadToken(hre, asset.address);
            await waitPromise(token.registerMinters([mintInstance.address]), `token.registerMinters for ${asset.symbol}`)
            asset.minterRegistered = true;
            saveAssets(hre, assets);
        }
    }
    console.log('registerMintAssets end')
}

async function updateWeight(hre) {
    //console.log('updateWeight begin')
    //let kala = readKala(hre);
    //await waitPromise(factoryInstance.updateWeight(kala.address, config.assetWeights.KALA), `factoryInstance.updateWeight for kala`)
    //const busd = readBUSD(hre);
    //await waitPromise(factoryInstance.updateWeight(busd.address, config.assetWeights.BUSD), `factoryInstance.updateWeight for busd`)
    //console.log('updateWeight end')

    await waitPromise(factoryInstance.updateWeight('0xAC637B0f9030436f21E2FfBDf104B45c7e4156CA', toUnitString("1")), `factoryInstance.updateWeight for busd`)



}

async function registerChinlinkFeeders(hre) {
    let deployedAssets = readAssets(hre) || {};
    for (let asset of Object.values(config.assets).filter(asset => asset.chinlinkFeeder)) {
        let deployedAsset = deployedAssets[asset.symbol]
        if (deployedAsset && !deployedAsset.chinlinkFeeder) {
            await waitPromise(
                chainlinkOracleInstance.registerFeeders([deployedAsset.address], [asset.chinlinkFeeder]),
                `chainlinkOracleInstance.registerFeeders for ${asset.symbol}`
            );
            deployedAsset.chinlinkFeeder = asset.chinlinkFeeder;
            saveAssets(hre, deployedAssets)
        }
    }
}


async function registerTokenMintersForKala(hre,force) {
    let kala = readKala(hre);
    if (!kala.minterRegistered||force) {
        let token = await loadToken(hre, kala.address);
        await waitPromise(token.clearMinters(), "kala.clearMinters")
        await waitPromise(token.registerMinters([mintInstance.address,factoryInstance.address]), "kala.registerMinters for Mint address")
        kala.minterRegistered = true
        saveKala(hre, kala);
    }

}

module.exports = {
    deploy: async (hre) => {
        await init(hre);
        await addKalaPair(hre, false);
        if (config.enableWBNB) {
            await addWBNBPair(hre);
        }
        for (let asset of Object.values(config.assets)) {
            await deployPair(hre, {...asset});
        }
        await registerKalataOracle(hre);
        await registerBUSDStaking(hre, false);
        await registerKalaBUSDStaking(hre, false);
        await registerMintAssets(hre);
        await updateDistributionSchedules(hre, false)
        await updateUnlockSpeed(hre, false)
        await registerChinlinkFeeders(hre);

        await registerTokenMintersForKala(hre,false);
        //await updateWeight(hre)

    }
}
