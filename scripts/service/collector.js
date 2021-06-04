const got = require('got');
const {readContracts} = require("../../utils/resources");
const {loadContract} = require("../../utils/contract");
const {readAssets, readKala} = require("../../utils/assets");
const {humanBN} = require("../../utils/maths");
const {logger} = require("./logger");

const URL = 'http://localhost:8080/api/finance/symbol/price/update';

async function collectPrices(hre) {
    const [signer] = await hre.ethers.getSigners();
    let kala = await readKala(hre);

    const {address} = readContracts(hre)['Router'];
    const routerInstance = await loadContract(hre, 'Router', address, signer) //new h
    let addressSymbolMap = {}
    for (const asset of Object.values(readAssets(hre))) {
        addressSymbolMap[asset.address] = asset.symbol;
    }
    let {prices, assets} = await routerInstance.queryAssetPricesFromPool();
    let requestBody = [];
    for (let i = 0; i < prices.length; i++) {
        let address=assets[i];
        let price = parseFloat(humanBN(prices[i]));
        let symbol = kala.address.toUpperCase() === address.toUpperCase() ? kala.symbol : addressSymbolMap[address];
        requestBody.push({symbol, price})
    }
    const {body} = await got.post(URL, {json: requestBody,});
    logger.info(`Collector:${JSON.stringify({url: URL, request: requestBody, response: body})}`,)
}

module.exports = {
    collectPrices
};



