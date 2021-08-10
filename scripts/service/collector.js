const got = require('got');
const {fromUnit} = require("../../utils/maths");
const {readContracts} = require("../../utils/resources");
const {loadContract} = require("../../utils/contract");
const {getAddressSymbolMapping} = require("../../utils/assets");
const {logger} = require("./logger");

//const URL = 'http://localhost:8089/api/finance/symbol/updatePrices';

async function collectPrices(hre) {
    const [signer] = await hre.ethers.getSigners();
    const {address} = readContracts(hre)['Router'];
    const routerInstance = await loadContract(hre, 'Router', address, signer) //new h
    let addressSymbolMap = getAddressSymbolMapping(hre);
    let {assets, prices} = await routerInstance.queryAssetPricesFromPool().catch(e => {
        logger.error("routerInstance.queryAssetPricesFromPool() :${e}")
    });
    let requestBody = [];
    for (let i = 0; i < prices.length; i++) {
        let address = assets[i];
        let price = parseFloat(fromUnit(prices[i].toString()));
        //let price=1.0000;
        let symbol = addressSymbolMap[address.toUpperCase()];
        requestBody.push({symbol, price})
    }
    //console.log(requestBody);
    const URL = `https://testnet.kalata.io/api/finance/symbol/updatePrices`;
    const {body} = await got.post(URL, {json: requestBody,});
    logger.info(`Collector:${JSON.stringify({url: URL, request: requestBody, response: body})}`,)
}

module.exports = {
    collectPrices
};



