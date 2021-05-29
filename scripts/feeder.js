const hre = require("hardhat");
const {readContracts} = require("../utils/resources");
const {toUnitString} = require("../utils/maths")
const {requestGtimgStockPrices, requestSinaStockPrices, loadCrptoCurrency} = require("../utils/equity")

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
