const {saveWBNB} = require("../utils/assets");
const {readWBNB} = require("../utils/assets");
const {readAssets, saveAssets, readWebAssets, saveWebAssets, readKala, saveKala, readBUSD} = require("../utils/assets")
const {toUnit, humanBN} = require("../utils/maths")
const {loadToken, loadUniswapV2Router02, waitReceipt, waitPromise} = require("../utils/contract")
const {queryPricesFromSina} = require("../utils/equity")


async function addLiquidityForKAssets(hre) {
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
}

async function addLiquidityForWBNB(hre) {
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
}

async function addLiquidityForKala(hre) {
    let [deployer] = await hre.ethers.getSigners();
    let kala = readKala(hre);
    if (!kala.pool) {
        let price = 0.27;
        let assetAmount = 1;
        let busdAmount = price * assetAmount;
        assetAmount = toUnit(assetAmount);
        busdAmount = toUnit(busdAmount);
        let receipt = await addLiquidity(hre, deployer, kala.address, assetAmount, busdAmount);
        console.log(`addLiquidity for KALA, busdAmount:${humanBN(busdAmount)},assetAmount:${humanBN(assetAmount)},hash:${receipt.hash}`)
        kala.pool = {busd: busdAmount.toString(), asset: assetAmount.toString()}
        saveKala(hre, kala);
    }
}

async function addLiquidity(hre, lpOwner, assetAddress, assetAmount, usdAmount, mintAsset = false) {
    if (!assetAddress) {
        return;
    }
    let usdToken = await loadToken(hre, readBUSD(hre).address);
    let assetToken = await loadToken(hre, assetAddress);
    if (mintAsset) {
        await waitPromise(assetToken.mint(lpOwner.address, assetAmount.toString()), `${assetToken.address} mint ${assetAmount.toString()} for ${lpOwner.address}`);
    } else {
        await waitReceipt(assetToken.transfer(lpOwner.address, assetAmount.toString()));
    }
    await waitReceipt(usdToken.transfer(lpOwner.address, usdAmount.toString()));
    let [to, deadline] = [lpOwner.address, (await hre.web3.eth.getBlock("latest")).timestamp + 160];

    let callerUsdToken = await loadToken(hre, usdToken.address, lpOwner);
    let callerAssetToken = await loadToken(hre, assetToken.address, lpOwner);

    let [assetAmountDesired, usdAmountDesired] = [assetAmount, usdAmount];
    let [assetAmountMin, usdAmounMin] = [assetAmountDesired, usdAmountDesired];
    let callerRouter = await loadUniswapV2Router02(hre, lpOwner);

    await waitReceipt(callerUsdToken.approve(callerRouter.address, usdAmountDesired.toString(), {gasLimit: 2500000}));
    await waitReceipt(callerAssetToken.approve(callerRouter.address, assetAmountDesired.toString(), {gasLimit: 2500000}));
    let receipt = await callerRouter.addLiquidity(usdToken.address, assetToken.address,
        usdAmountDesired.toString(),
        assetAmountDesired.toString(),
        usdAmounMin.toString(),
        assetAmountMin.toString(),
        to,
        deadline, {gasLimit: 9500000}
    ).catch(e => {
        console.error(`uniswapV2Router02.addLiquidity, ${e}`);
    });
    await receipt.wait()
    return receipt
}

async function addLiquidityForAll(hre) {
    await addLiquidityForKAssets(hre);
    await addLiquidityForWBNB(hre);
    await addLiquidityForKala(hre);
}

module.exports = {
    addLiquidityForAll
}
