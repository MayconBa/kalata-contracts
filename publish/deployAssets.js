const {readContracts, saveContracts} = require("../utils/resources")
const {readBUSD, saveBUSD, readAssets, saveAssets, readWebAssets, saveWebAssets, readKala, saveKala, readWBNB, saveWBNB} = require("../utils/assets")
const {toUnit, toUnitString} = require("../utils/maths")
const {loadToken, loadUniswapV2Factory, ZERO_ADDRESS, waitReceipt} = require("../utils/contract")
const {stringToBytes32} = require('../utils/bytes')

let initialSupply = toUnit("980000000").toString();
let deployedAssets, deployedWebAssets;
let uniswapV2Factory, deployedContracts, kalataOracleInstance, factoryInstance, routerInstance, stakingInstance, collateralInstance, oracleInstance;
let usdToken, usdInfo;
let auctionDiscount = toUnit("0.80")
let minCollateralRatio = toUnit("1.5");
const defaultWeight = toUnitString("1");
const unlockSpeed = toUnitString("0.01");
const MOCK_ASSETS = {
    "kBIDU": {
        name: "Wrapped Kalata BIDU Token",
        symbol: "kBIDU",
        type: "stock",
        sinaCode: "gb_bidu",
        gtimgCode: "usBIDU",
        weight: defaultWeight,
        initialSupply
    },
    "kTSLA": {
        name: "Wrapped Kalata TSLA Token",
        symbol: "kTSLA",
        type: "stock",
        sinaCode: "gb_tsla",
        gtimgCode: "usTSLA",
        weight: defaultWeight,
        initialSupply
    },
    "kARKK": {
        name: "Wrapped Kalata ARKK Token",
        symbol: "kARKK",
        type: "stock",
        sinaCode: "gb_arkk",
        gtimgCode: "usARKK",
        weight: defaultWeight,
        initialSupply
    },
    "kSPCE": {
        name: "Wrapped Kalata SPCE Token",
        symbol: "kSPCE",
        type: "stock",
        sinaCode: "gb_spce",
        gtimgCode: "usSPCE",
        weight: defaultWeight,
        initialSupply
    },
    "kPACB": {
        name: "Wrapped Kalata PACB Token",
        symbol: "kPACB",
        type: "stock",
        sinaCode: "gb_pacb",
        gtimgCode: "usPACB",
        weight: defaultWeight,
        initialSupply
    },
}


async function init(hre) {
    let [deployer] = await hre.ethers.getSigners();
    deployedAssets = readAssets(hre) || {};
    uniswapV2Factory = await loadUniswapV2Factory(hre);
    usdInfo = readBUSD(hre);
    usdToken = await loadToken(hre, usdInfo.address);
    deployedContracts = readContracts(hre) || {};
    deployedWebAssets = readWebAssets(hre) || {};

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
}

async function addKalaPair(hre) {
    deployedWebAssets = readWebAssets(hre) || {};
    let kala = readKala(hre);
    if (!kala.pair) {
        let pair = await uniswapV2Factory.getPair(kala.address, usdToken.address);
        if (pair === ZERO_ADDRESS) {
            await waitReceipt(uniswapV2Factory.createPair(kala.address, usdToken.address));
            pair = await uniswapV2Factory.getPair(kala.address, usdToken.address)
        }
        kala.pair = pair;
        saveKala(hre, kala);
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
            /// 收益每隔72小时领取一次
            claimTimeLimit: true,
            rewardLockable: false,
        }
        saveWebAssets(hre, deployedWebAssets);
        console.log('addKalaPair', kala.pair);
    }
}


async function addWBNBPair(hre) {
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
        }
        saveWebAssets(hre, deployedWebAssets);
        console.log('addWBNBPair', wbnb.pair);
        let receipt = await routerInstance.addExtraAsset(wbnb.address)
        console.log("routerInstance.addExtraAsset for wbnb", receipt.hash)
        await oracleInstance.registerAssets([wbnb.address])
    }

}


async function deployPair(hre, {name, symbol, type, initialSupply, sinaCode, gtimgCode, coingeckoCoinId, weight}) {
    let [deployer] = await hre.ethers.getSigners();
    let assetInfo = deployedAssets[symbol] || {name, symbol, initialSupply: null, type, pool: null, address: null, pair: null, deploy: true, sinaCode, gtimgCode, coingeckoCoinId}
    let assetAddress = assetInfo.address;
    if (assetInfo.deploy) {
        let bytes32Name = stringToBytes32(name);
        let bytes32Symbol = stringToBytes32(symbol);
        let factoryConfig = await factoryInstance.queryConfig();
        if (factoryConfig.baseToken !== usdToken.address) {
            console.error("factory.baseToken != usdToken")
            process.exit(503);
        }
        if (assetInfo.address && assetInfo.pair) {
            await waitReceipt(factoryInstance.registerAsset(assetInfo.address, assetInfo.pair, bytes32Name, bytes32Symbol,
                auctionDiscount.toString(), minCollateralRatio.toString(), weight.toString())
            )
            console.log(`register asset ${symbol},${assetAddress}`);
        } else {
            await waitReceipt(factoryInstance.whitelist(bytes32Name, bytes32Symbol, auctionDiscount.toString(), minCollateralRatio.toString(), weight.toString()));
            assetAddress = await factoryInstance.queryToken(bytes32Symbol);
            console.log(`whitelist asset ${symbol},${assetAddress}`);
        }

        if (assetAddress === ZERO_ADDRESS) {
            console.error(`Asset ${symbol} deployed to network ${hre.network.name} with address ${assetAddress}`)
            process.exit(502);
        } else {
            assetInfo.address = assetAddress;
            //console.log(`Asset ${symbol} deployed to network ${hre.network.name} with address ${assetAddress}`);
            if (!assetInfo.initialSupply) {
                let assetToken = await loadToken(hre, assetAddress);
                await waitReceipt(assetToken.mint(deployer.address, initialSupply));
                assetInfo.initialSupply = initialSupply;
            }
            if (!assetInfo.pair) {
                assetInfo.pair = await uniswapV2Factory.getPair(usdToken.address, assetAddress);
                console.log(`Pair ${symbol}/${usdInfo.symbol} deployed to network ${hre.network.name} with address ${assetInfo.pair}`);
            }
            assetInfo.deploy = false;
            deployedAssets[symbol] = assetInfo;

        }
        saveAssets(hre, deployedAssets);
        let receipt = await oracleInstance.registerAssets([assetInfo.address]);
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
    }
    saveWebAssets(hre, deployedWebAssets);

}

async function registerKalataOracle(hre) {
    if (deployedContracts['KalataOracle'].assetRegistered) {
        return;
    }
    let [deployer] = await hre.ethers.getSigners();
    let assets = Object.values(deployedAssets).map(asset => asset.address);
    let feeders = assets.map(() => deployer.address);
    let receipt = await kalataOracleInstance.registerAssets(assets, feeders);
    console.log("kalataOracleInstance.registerAssets,", receipt.hash)
    deployedContracts['KalataOracle'].assetRegistered = true
    saveContracts(hre, deployedContracts)
}

// KALA-BUSD LP, 随存随取, 收益每隔72小时领取一次, 领取或者存入LP,时间重置
async function registerKalaBUSDStaking(hre) {
    const kala = readKala(hre);
    if (kala.pairStakingRegistered) {
        return;
    }
    let interval = 3600 * 72

    //function registerAsset(address asset, address pair) override external onlyFactoryOrOwner {
    let params = [kala.address, kala.pair]
    let receipt = await stakingInstance.registerAsset(...params);
    console.log("stakingInstance.registerAsset for KALA-BUSD pair", JSON.stringify(params), receipt.hash)

    //function updateClaimIntervals(address[] memory assets, uint[] memory intervals) external onlyOwner {
    params = [[kala.address], [interval]]
    receipt = await stakingInstance.updateClaimIntervals([kala.address], [interval]);

    console.log("stakingInstance.updateClaimIntervals for KALA-BUSD pair", JSON.stringify(params), receipt.hash)
    kala.pairStakingRegistered = true;
    saveKala(hre, kala)
}

// 增减BUSD挖矿KALA单币池, 随存随取. 收益锁定.  锁定的奖励,通过质押KALA-BUSD来解锁.
async function registerBUSDStaking(hre) {
    const usdInfo = readBUSD(hre);
    if (!usdInfo.stakingRegistered) {
        const kala = readKala(hre);
        let receipt = await factoryInstance.updateWeight(usdInfo.address, defaultWeight);
        console.log("factoryInstance.updateWeight for BUSD", receipt.hash)

        receipt = await stakingInstance.registerAsset(usdInfo.address, ZERO_ADDRESS);
        console.log("stakingInstance.registerAsset for BUSD", receipt.hash)

        //function updateConfig(address stakingContract, address[] memory assets, uint[] memory unlockSpeeds)
        let params = [stakingInstance.address, [kala.pair], [unlockSpeed]];
        receipt = await collateralInstance.updateConfig(...params);
        console.log("collateralInstance.updateConfig for BUSD-KALA pair", receipt.hash)

        //function updateCollateralAssetMapping(address[] memory assets, address[] memory collateralAssets)
        receipt = await stakingInstance.updateCollateralAssetMapping([usdInfo.address], [kala.pair]);
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
        }
        saveWebAssets(hre, deployedWebAssets);
        usdInfo.stakingRegistered = true;
        saveBUSD(hre, usdInfo)
    }

}


module.exports = {
    deploy: async (hre) => {
        await init(hre);
        await addKalaPair(hre);
        await addWBNBPair(hre);
        for (let asset of Object.values(MOCK_ASSETS)) {
            await deployPair(hre, {...asset});
        }
        await registerKalataOracle(hre);
        await registerBUSDStaking(hre);
        await registerKalaBUSDStaking(hre);
    }
}
