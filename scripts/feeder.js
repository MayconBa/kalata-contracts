const hre = require("hardhat");
const {readContracts} = require("../utils/resources");
const {toUnitString} = require("../utils/maths")
const {queryPricesFromSina, queryPricesFromGtimg} = require("../utils/equity")
const got = require('got');

async function main() {
    while (true) {
        await loadAndFeed();
        //每5分钟更新一次价格
        await new Promise(resolve => setTimeout(resolve, 300 * 1000));
    }
}

async function loadAndFeed() {
    const allAssets = Object.values(require(`../publish/deployed/${hre.network.name}/assets.json`))
    let stockPrices = await loadStockPrices(allAssets.filter(item => item.type === "stock"));
    let crptoCurrencyPrices = await loadCrptoCurrency(allAssets.filter(item => item.type === "crptoCurrency"));
    await feedPrices([...stockPrices, ...crptoCurrencyPrices]);
}


async function requestSinaStockPrices(assets) {
    let codes = Object.values(assets).filter(item => item.sinaCode).map(item => item.sinaCode);
    const prices = await queryPricesFromSina(codes.join(","));
    if (codes.length !== Object.keys(prices).length) {
        console.error("sina-feeder-error,please check");
    }
    return Object.values(assets).filter(asset => prices[asset.sinaCode]).map(asset => {
        return {address: asset.address, price: prices[asset.sinaCode]};
    })

}


async function loadCrptoCurrency(assets) {
    let pairs = []
    if (assets.length > 0) {
        let ids = assets.map(item => item.coingeckoCoinId).join(",");
        let url = `https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&ids=${ids}`;
        console.log(url);
        const response = await got(url);
        if (response.statusCode === 200) {
            let result = JSON.parse(response.body);
            for (let {coingeckoCoinId, address} of assets) {
                let price = (result[coingeckoCoinId] || {})['usd'];
                if (price) {
                    pairs.push({address, price})
                }

            }
        }
    }
    return pairs
}

async function requestGtimgStockPrices(assets) {
    let codes = Object.values(assets).filter(item => item.gtimgCode).map(item => item.gtimgCode);
    const prices = await queryPricesFromGtimg(codes.join(","));
    if (codes.length !== Object.keys(prices).length) {
        console.error("gtimg-feeder-error,please check");
    }
    return Object.values(assets).filter(asset => prices[asset.gtimgCode]).map(asset => {
        return {address: asset.address, price: prices[asset.gtimgCode]};
    })

}


async function feedPrices(addressPricePairs) {
    if (addressPricePairs.length === 0) {
        console.error("nothing to feed,please check");
    }
    console.log('start feeding');
    const accounts = await hre.ethers.getSigners();
    const signer = accounts[0];
    const deployedContracts = readContracts(hre);
    const oracleAddress = deployedContracts['Oracle'].address;

    const Artifact = await hre.artifacts.readArtifact("Oracle");
    const oracleInstance = new hre.ethers.Contract(oracleAddress, Artifact.abi, signer);

    let addresses = addressPricePairs.map(item => item.address);
    let prices = addressPricePairs.map(item => toUnitString(item.price));
    await oracleInstance.feedPrices(addresses, prices);
    let [queryAssets, queryPrices, queryUpdates] = await oracleInstance.queryAllPrices();
    const queryResult = JSON.stringify(queryAssets.map((token, index) => {
        return {token, price: queryPrices[index].toString(), lastUpdateTime: queryUpdates[index].toString()}
    }));
    console.log(queryResult);
}


async function loadStockPrices(assets) {
    if (assets.length > 0) {
        const requesters = shuffleArray([requestSinaStockPrices, requestGtimgStockPrices]);
        for (let requester of requesters) {
            let prices = await requester(assets);
            if (prices.length > 0) {
                return prices
            }
        }
    }
    return []
}


function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}


main()
    .then(() => console.log("Oracle feeder schedule job started"))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
