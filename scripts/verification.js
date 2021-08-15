//npx hardhat run scripts\verification --network testnet --no-compile
const {bytesToString} = require("../utils/bytes");
const moment = require('moment')
const hre = require("hardhat");
const {readContracts} = require("../utils/resources");
const {waitReceipt, waitPromise, randomAddress,} = require("../utils/contract");
const {readAssets, readBUSD, readKala, readWBNB, getAddressSymbolMapping} = require("../utils/assets");
const {toUnitString, humanBN, humanBNNumber, toUnit, toBN} = require("../utils/maths")
const Contract = require("web3-eth-contract");

let factoryInstance, oracleInstance, stakingInstance, mintInstance, uniswapRouterInstance,
    uniswapFactoryInstance, routerInstance, chainlinkOralceInstance, collateralInstance;
let deployedAssets, busdToken, kalaToken, wbnbToken;

async function main() {
    await init();
    console.log(`${1.0/(72.0*3600/3)}`)
    //await queryAllPositions();
    await new Promise(resolve => setTimeout(resolve, 2 * 1000));
}


async function queryAllPositions() {
    let {idxes, positionOwners, collateralTokens, collateralAmounts, assetTokens, assetAmounts} = await mintInstance.queryAllPositions('0x28D89B837BFDb5DD386988F06C87BEB3ab5DC8C0');
    for (let i = 0; i < idxes.length; i++) {
        console.log(idxes[i].toString(), positionOwners[i].toString(), collateralTokens[i].toString(), collateralAmounts[i].toString(), assetTokens[i].toString(), assetAmounts[i].toString())
    }

}

async function distribute() {
    await waitPromise(factoryInstance.distribute(), "distribute")

}


async function queryDistributionSchedules() {
    let {startTimes, endTimes, amounts} = await factoryInstance.queryDistributionSchedules();
    for (let i = 0; i < startTimes.length; i++) {
        let startTime = parseInt(startTimes[i].toString());
        let endTime = parseInt(endTimes[i].toString());
        let duration = endTime - startTime;
        let hours = duration / 3600;
        console.log(duration, hours, humanBN(amounts[i]), humanBN(amounts[i]) / hours)
    }
}

async function collateralDeposit() {

    let kalaPair = readKala(hre).pair;
    let amount = toUnitString("0.01");
    let [account] = await hre.ethers.getSigners();

    // const Contract = require('web3-eth-contract');
    // console.log(hre.network.provider)
    // Contract.setProvider(hre.network.provider)
    // let {Collateral} = readContracts(hre);
    // let instance = new Contract(Collateral.abi, Collateral.address);

    // //let receipt = await instance.methods.deposit(kalaPair, amount).send({from: account.address});
    // //console.log('receipt1', receipt)
    // console.log("start")
    // await instance.methods.deposit(kalaPair, amount).send({from: account.address}).on("receipt", function (receipt) {
    //     console.log('receipt2', receipt)
    // });
    // console.log("end")

    let receipt = await collateralInstance.deposit(kalaPair, amount);
    let confirmations = await receipt.wait();
    console.log(confirmations.events.filter(item => item.event === "Deposit").map(item => item.args))


}


async function init() {
    busdToken = await loadAssetInstance(readBUSD(hre).address);
    kalaToken = await loadAssetInstance(readKala(hre).address);
    wbnbToken = await loadAssetInstance(readWBNB(hre).address);
    const deployedContracts = readContracts(hre);
    factoryInstance = await loadContract(deployedContracts, 'Factory');
    oracleInstance = await loadContract(deployedContracts, 'Oracle');
    stakingInstance = await loadContract(deployedContracts, 'Staking');
    uniswapRouterInstance = await loadContract(deployedContracts, 'UniswapV2Router02', 'IUniswapV2Router02');
    uniswapFactoryInstance = await loadContract(deployedContracts, 'UniswapV2Factory', 'IUniswapV2Factory');
    mintInstance = await loadContract(deployedContracts, 'Mint');
    routerInstance = await loadContract(deployedContracts, 'Router');
    chainlinkOralceInstance = await loadContract(deployedContracts, "ChainlinkOracle")
    collateralInstance = await loadContract(deployedContracts, 'Collateral')
    deployedAssets = readAssets(hre);
}


async function verifyQueryAssetPricesFromPool() {
    let {assets, prices} = await routerInstance.queryAssetPricesFromPool();
    console.log(assets)
    console.log(prices)
    for (let i = 0; i < assets.length; i++) {
        let asset = assets[i].toUpperCase();
        let symbol = null;
        if (asset === kalaToken.address.toUpperCase()) {
            symbol = await kalaToken.symbol();
        } else if (asset === wbnbToken.address.toUpperCase()) {
            symbol = await wbnbToken.symbol();
        } else {
            symbol = Object.values(deployedAssets).filter(item => item.address.toUpperCase() === asset).map(item => item.symbol).find(() => true) || asset
        }
        console.log(`${symbol} => ${humanBN(prices[i])}`)
    }
}

async function verifyQueryAllPricesFromOracle() {
    let {assets, prices} = await oracleInstance.queryAllPrices();
    for (let i = 0; i < assets.length; i++) {
        let asset = assets[i].toUpperCase();
        let symbol = null;
        if (asset === kalaToken.address.toUpperCase()) {
            symbol = await kalaToken.symbol();
        } else if (asset === wbnbToken.address.toUpperCase()) {
            symbol = await wbnbToken.symbol();
        } else {
            symbol = Object.values(deployedAssets).filter(item => item.address.toUpperCase() === asset).map(item => item.symbol).find(() => true) || asset
        }
        console.log(`${symbol} => ${humanBN(prices[i])}`)
    }
}

async function verfiryCliamInterval(hre) {
    let mapping = getAddressSymbolMapping(hre);
    console.log(mapping)
    {
        let {assets, intervals} = await stakingInstance.queryClaimIntervals();
        for (let i = 0; i < assets.length; i++) {
            console.log(assets[i], mapping[assets[i].toUpperCase()], intervals[i].toString())
        }
    }
    console.log('----------------------------')
    {
        let staker = '0x948cCB51B4cC9Cefb12BE932960C60F00010c90E';
        let {assets, remaingClaimTimes} = await stakingInstance.queryRemaingClaimTimes(staker);
        for (let i = 0; i < assets.length; i++) {
            console.log(assets[i], mapping[assets[i].toUpperCase()], remaingClaimTimes[i].toString())
        }
    }

}

function getTokenMap() {
    let mapping = {}
    mapping[busdToken.address] = busdToken.symbol;
    mapping[kalaToken.address] = kalaToken.symbol;
    mapping[wbnbToken.address] = wbnbToken.symbol;
    Object.values(deployedAssets).forEach(asset => {
        mapping[asset.address] = asset.symbol;
    })
    return mapping;
}

async function verifyQueryAllStakes() {
    let mapping = getTokenMap();
    let {assets, pendingRewards, stakingAmounts} = await stakingInstance.queryStakes();
    for (let i = 0; i < assets.length; i++) {
        let assset = assets[i]
        console.log(mapping[assets[i]] || assets[i], humanBN(stakingAmounts[i]), humanBN(pendingRewards[i]))
    }

}


async function verifyChainlinkPrices(hre) {
    //https://docs.chain.link/docs/binance-smart-chain-addresses/
    let assets = [randomAddress(hre), randomAddress(hre)]
    let feeders = [
        '0x5e66a1775BbC249b5D51C13d29245522582E671C',//ADA,8 decimals
        '0x1a602D4928faF0A153A520f58B332f9CAFF320f7',//BTC / ETH, 18 decimals
    ]
    await waitPromise(chainlinkOralceInstance.registerFeeders(assets, feeders), 'chainlinkOralceInstance.registerFeeders');
    for (let asset of assets) {
        {
            let {price, lastUpdatedTime} = await chainlinkOralceInstance.queryPrice(asset);
            console.log(humanBN(price), lastUpdatedTime.toString())
        }
        {
            let {price, lastUpdatedTime} = await oracleInstance.queryPrice(asset);
            console.log(humanBN(price), lastUpdatedTime.toString())
        }
        console.log('---------')
    }
}

async function verifyOpenPosition(hre) {
    //function openPosition(address collateralToken, uint collateralAmount, address assetToken, uint collateralRatio) override external nonReentrant returns (uint){
    let collateralToken = busdToken.address;
    let collateralAmount = toUnitString("1111");
    let assetToken = deployedAssets['kTSLA'].address
    let collateralRatio = toUnitString("2.0")
    console.log(collateralToken, collateralAmount, assetToken, collateralRatio);
    await waitPromise(mintInstance.openPosition(collateralToken, collateralAmount, assetToken, collateralRatio, {gasLimit: 2500000}), "openPosition");
}


async function loadPairInstance(pairAddress) {
    const accounts = await hre.ethers.getSigners();
    const Artifact = await hre.artifacts.readArtifact('IUniswapV2Pair');
    return new hre.ethers.Contract(pairAddress, Artifact.abi, accounts[0])
}

async function loadAssetInstance(assetAddress) {
    const accounts = await hre.ethers.getSigners();
    const Artifact = await hre.artifacts.readArtifact('IBEP20Token');
    return new hre.ethers.Contract(assetAddress, Artifact.abi, accounts[0])
}


// https://hackmd.io/zDybBWVAQN67BkFujyf52Q#13-%E8%B4%AD%E4%B9%B0Buy
async function doBuy(deployedAssets, uniswapRouterInstance) {
    const accounts = await hre.ethers.getSigners();
    const walletAccount = accounts[0];
    const biduTokenReceiver = accounts[1]
    const busdToken = await loadAssetInstance(readBUSD(hre).address);
    const biduToken = await loadAssetInstance(deployedAssets['kBIDU'].address);

    let pairToken = await loadPairInstance(deployedAssets['kBIDU'].pair);
    let {reserve0, reserve1} = await pairToken.getReserves();

    let busdReserve = busdToken.address < biduToken.address ? reserve0 : reserve1;
    let biduReserve = busdToken.address < biduToken.address ? reserve1 : reserve0;

    console.log('busdReserve', busdReserve.toString(), humanBN(busdReserve));
    console.log('biduReserve', biduReserve.toString(), humanBN(biduReserve));
    //console.log(humanBN(busdReserve), humanBN(biduReserve));

    let buyBiduAmount = toUnit("20")

    console.log('buyBiduAmount', buyBiduAmount.toString());

    let amountIn = toBN(await uniswapRouterInstance.getAmountIn(buyBiduAmount.toString(), busdReserve.toString(), biduReserve.toString()))
    //console.log('required busd amount:', humanBN(amountIn));
    console.log('required busd amount:', amountIn.toString());

    // 0.1 slippage
    let amountInMax = amountIn.add(amountIn.div(toBN(10)));

    //console.log(humanBN(amountInMax))
    console.log("amountInMax:", amountInMax.toString());

    let allowance = toBN(await busdToken.allowance(walletAccount.address, uniswapRouterInstance.address));
    if (amountInMax.gte(allowance)) {
        await busdToken.connect(walletAccount).approve(uniswapRouterInstance.address, toUnitString("1000"));
        while (amountInMax.gte(allowance)) {
            allowance = toBN(await busdToken.allowance(walletAccount.address, uniswapRouterInstance.address));
            console.log("waiting 0.5 seconds for transaction to complete")
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    //console.log('balance(before buying)', humanBN(await biduToken.balanceOf(biduTokenReceiver.address)))
    console.log('balance(before buying)', (await biduToken.balanceOf(biduTokenReceiver.address)).toString())
    let path = [busdToken.address, biduToken.address];
    let receiver = biduTokenReceiver.address;
    console.log('path', path);
    let receipt = await uniswapRouterInstance.swapTokensForExactTokens(
        buyBiduAmount.toString(),// 需要购买的Asset数量
        amountInMax.toString(), // 保护参数, 限制最多花费多少BUSD,防止滑点太大.
        path, //[ busd,asset]
        receiver, // asset的接受者.
        new Date().getTime() //最迟交易时间,这也是保护参数
    )
    console.log("receipt.hash", receipt.hash);
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('balance(after buying)', (await biduToken.balanceOf(receiver)).toString())

}


async function loadContract(deployedContracts, name, artifactName = null) {
    const accounts = await hre.ethers.getSigners();
    const signer = accounts[0];
    const factoryAddress = deployedContracts[name].address;
    const Artifact = await hre.artifacts.readArtifact(artifactName ? artifactName : name);
    return new hre.ethers.Contract(factoryAddress, Artifact.abi, signer)
}

async function checkQueryAssets(factoryInstance) {
    let assets = await factoryInstance.queryAssets();
    let result = assets['names'].map((name, index) => {
        return {
            name: bytesToString(name),
            symbol: bytesToString(assets['symbols'][index]),
            address: assets['addresses'][index],
            pair: assets['busdPairAddresses'][index]
        }
    })
    console.log(result);
    return result;

}


async function checkQueryAllPrices(oracleInstance) {
    let result = await oracleInstance.queryAllPrices();
    let assets = result['assets'];
    let prices = result['prices'];
    for (let i = 0; i < assets.length; i++) {
        console.log(assets[i], humanBNNumber(prices[i]))
    }
}


async function checkReserves(asset) {
    const pairInstance = await loadPairInstance(asset.pair);
    let result = await pairInstance.getReserves();
    console.log("pool:", asset.symbol, humanBNNumber(result['reserve0']), humanBNNumber(result['reserve1']));
}


main()
    .then(() => console.log(" "))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
