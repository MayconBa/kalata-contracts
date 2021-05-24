const hre = require("hardhat");
const got = require('got');
const {readContracts} = require("../utils/resources");
const {toUnitString} = require("../utils/maths")

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


function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}


async function requestSinaStockPrices(assets) {
    async function request(codes) {
        let url = `http://hq.sinajs.cn/?list=${codes}`;
        console.log(url);
        const response = await got(url);
        const result = {};
        for (let line of response.body.replace(/var hq_str_/gi, "").split(";").map(item => item.trim()).filter(item => item.length > 0)) {
            result[line.trim().split("=")[0]] = line.split(",")[1];
        }
        return result;
    }


    let codes = Object.values(assets).filter(item => item.sinaCode).map(item => item.sinaCode);
    const prices = await request(codes.join(","));
    if (codes.length !== Object.keys(prices).length) {
        console.error("sina-feeder-error,please check");
    }
    return Object.values(assets).filter(asset => prices[asset.sinaCode]).map(asset => {
        return {address: asset.address, price: prices[asset.sinaCode]};
    })

}


async function requestGtimgStockPrices(assets) {
    async function request(codes) {
        let url = `https://qt.gtimg.cn/q=${codes}`;
        console.log(url);
        const response = await got(url);
        const result = {};
        for (let line of response.body.split(";").map(item => item.trim()).filter(item => item.length > 0)) {
            result[line.trim().split("=")[0].replace(/v_/gi, "")] = line.split("~")[3];
        }
        return result;
    }

    let codes = Object.values(assets).filter(item => item.gtimgCode).map(item => item.gtimgCode);

    const prices = await request(codes.join(","));
    if (codes.length !== Object.keys(prices).length) {
        console.error("gtimg-feeder-error,please check");
    }
    return Object.values(assets).filter(asset => prices[asset.gtimgCode]).map(asset => {
        return {address: asset.address, price: prices[asset.gtimgCode]};
    })

}


main()
    .then(() => console.log("Oracle feeder schedule job started"))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
