//npx hardhat run scripts\checkContracts.js --network testnet --no-compile
const {bytesToString} = require("../utils/bytes");
const hre = require("hardhat");
const {readContracts} = require("../utils/resources");
const {readAssets, readBUSD} = require("../utils/assets");
const {toUnitString, humanBN, humanBNNumber, toUnit, toBN} = require("../utils/maths")

async function main() {
    const deployedContracts = readContracts(hre);
    const factoryInstance = await loadContract(deployedContracts, 'Factory');
    const oracleInstance = await loadContract(deployedContracts, 'Oracle');
    const uniswapRouterInstance = await loadContract(deployedContracts, 'UniswapV2Router02', 'IUniswapV2Router02');
    const uniswapFactoryInstance = await loadContract(deployedContracts, 'UniswapV2Factory', 'IUniswapV2Factory');

    const deployedAssets = readAssets(hre);
    //console.log(deployedAssets);
    await doBuy(deployedAssets, uniswapRouterInstance);

    // let assets = await checkQueryAssets(factoryInstance);
    // await checkQueryAllPrices(oracleInstance);
    // for (const asset of assets) {
    //     await checkReserves(asset);
    // }

    await new Promise(resolve => setTimeout(resolve, 2 * 1000));

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

    console.log('busdReserve', busdReserve.toString());
    console.log('biduReserve', biduReserve.toString());
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
    console.log('path', path);
    let receipt = await uniswapRouterInstance.swapTokensForExactTokens(
        buyBiduAmount.toString(),// 需要购买的Asset数量
        amountInMax.toString(), // 保护参数, 限制最多花费多少BUSD,防止滑点太大.
        path, //[ busd,asset]
        biduTokenReceiver.address, // asset的接受者.
        new Date().getTime() //最迟交易时间,这也是保护参数
    )
    console.log("receipt.hash", receipt.hash);
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('balance(after buying)', (await biduToken.balanceOf(biduTokenReceiver.address)).toString())

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
