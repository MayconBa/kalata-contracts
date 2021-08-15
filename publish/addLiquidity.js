const {saveWBNB} = require("../utils/assets");
const {readWBNB} = require("../utils/assets");
const {readAssets, saveAssets, readWebAssets, saveWebAssets, readKala, saveKala, readBUSD} = require("../utils/assets")
const {toUnit, humanBN} = require("../utils/maths")
const {loadToken, loadUniswapV2Router02, waitReceipt, waitPromise} = require("../utils/contract")
const {queryPricesFromSina} = require("../utils/equity")

const config = require('./config')

async function addLiquidityForKAssets(hre) {
    console.log('addLiquidityForKAssets begin')
    let deployedAssets = readAssets(hre) || {};
    let [deployer] = await hre.ethers.getSigners();
    for (const asset of Object.values(deployedAssets)) {
        if (!asset.pool && asset.type === 'stock') {
            let {sinaCode, address} = asset;
            let price = (await queryPricesFromSina(sinaCode))[sinaCode];
            let assetAmount = 1;
            let busdAmount = price * assetAmount;
            assetAmount = toUnit(assetAmount);
            busdAmount = toUnit(busdAmount);
            let receipt = await addLiquidity(hre, deployer, address, assetAmount, busdAmount, true)
            console.log(`addLiquidity for ${asset['symbol']}, busdAmount:${humanBN(busdAmount)},assetAmount:${humanBN(assetAmount)},hash:${receipt.hash}`)
            asset.pool = {
                busd: busdAmount.toString(),
                asset: assetAmount.toString()
            }
            saveAssets(hre, deployedAssets);
        }
    }
    console.log('addLiquidityForKAssets end')
}

async function addLiquidityForWBNB(hre) {
    console.log('addLiquidityForWBNB begin')
    let [deployer] = await hre.ethers.getSigners();
    let wbnb = readWBNB(hre);
    if (!wbnb.pool) {
        let price = 352;
        let assetAmount = 1;
        let busdAmount = price * assetAmount;
        assetAmount = toUnit(assetAmount);
        busdAmount = toUnit(busdAmount);
        let receipt = await addLiquidity(hre, deployer, wbnb.address, assetAmount, busdAmount);
        console.log(`addLiquidity for WBNB, busdAmount:${humanBN(busdAmount)},assetAmount:${humanBN(assetAmount)},hash:${receipt.hash}`)
        wbnb.pool = {busd: busdAmount.toString(), asset: assetAmount.toString()}
        saveWBNB(hre, wbnb);
    }
    console.log('addLiquidityForWBNB end')
}

async function addLiquidityForKala(hre, config) {
    console.log('addLiquidityForKala begin')
    let [deployer] = await hre.ethers.getSigners();
    let kala = readKala(hre);
    if (!kala.pool) {
        let price = config.kalaPrice;
        let assetAmount = 1;
        let busdAmount = price * assetAmount;
        assetAmount = toUnit(assetAmount);
        busdAmount = toUnit(busdAmount);
        let receipt = await addLiquidity(hre, deployer, kala.address, assetAmount, busdAmount);
        console.log(`addLiquidity for KALA, busdAmount:${humanBN(busdAmount)},assetAmount:${humanBN(assetAmount)},hash:${receipt.hash}`)
        kala.pool = {busd: busdAmount.toString(), asset: assetAmount.toString()}
        saveKala(hre, kala);
    }
    console.log('addLiquidityForKala end')
}

async function addLiquidity(hre, lpOwner, assetAddress, assetAmount, usdAmount, mintAsset = false) {
    if (!assetAddress) {
        return;
    }
    console.log('addLiquidity begin')
    console.log('usd amount',humanBN(usdAmount));
    let usdToken = await loadToken(hre, readBUSD(hre).address);
    let assetToken = await loadToken(hre, assetAddress);
    console.log("1111111111")
    if (mintAsset) {
        console.log("aaaaaaaaaaaaa")
        await waitPromise(
            assetToken.mint(lpOwner.address, assetAmount.toString(), {gasLimit: 2500000}),
            `${assetToken.address} mint ${assetAmount.toString()} for ${lpOwner.address}`
        );
        console.log("bbbbbbbbbbbbb")
    } else {
        await waitReceipt(assetToken.transfer(lpOwner.address, assetAmount.toString(), {gasLimit: 2500000}));
    }

    await waitReceipt(usdToken.transfer(lpOwner.address, usdAmount.toString(), {gasLimit: 2500000}));

    let [to, deadline] = [lpOwner.address, (await hre.web3.eth.getBlock("latest")).timestamp + 160];
    console.log("2222222222")
    let callerUsdToken = await loadToken(hre, usdToken.address, lpOwner);
    let callerAssetToken = await loadToken(hre, assetToken.address, lpOwner);

    let [assetAmountDesired, usdAmountDesired] = [assetAmount, usdAmount];
    let [assetAmountMin, usdAmounMin] = [assetAmountDesired, usdAmountDesired];
    let callerRouter = await loadUniswapV2Router02(hre, lpOwner);
    console.log("3333333333")
    await waitReceipt(callerUsdToken.approve(callerRouter.address, usdAmountDesired.toString(), {gasLimit: 2500000}));
    await waitReceipt(callerAssetToken.approve(callerRouter.address, assetAmountDesired.toString(), {gasLimit: 2500000}));

    console.log("44444444")
    let receipt = await callerRouter.addLiquidity(usdToken.address, assetToken.address,
        usdAmountDesired.toString(),
        assetAmountDesired.toString(),
        usdAmounMin.toString(),
        assetAmountMin.toString(),
        to,
        deadline, {gasLimit: 2500000}
    ).catch(e => {
        console.error(`uniswapV2Router02.addLiquidity, ${e}`);
    });

    await receipt.wait()
    console.log("55555555555")
    console.log('addLiquidity end')
    return receipt
}

async function addLiquidityForAll(hre) {
    await addLiquidityForKAssets(hre);
    const config = require('./config')[hre.network.name]
    if (config.enableWBNB) {
        await addLiquidityForWBNB(hre);
    }
    await addLiquidityForKala(hre, config);
}

module.exports = {
    addLiquidityForAll
}
