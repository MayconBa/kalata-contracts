const got = require('got');
const {fromUnit} = require("../../utils/maths");
const {readContracts} = require("../../utils/resources");
const {loadContract} = require("../../utils/contract");
const {readAssets, readKala} = require("../../utils/assets");
const {logger} = require("./logger");

//const URL = 'http://localhost:8089/api/finance/symbol/updatePrices';
const URL = 'https://api.kalata.io/api/finance/symbol/updatePrices';


async function collectPrices(hre) {
    const [signer] = await hre.ethers.getSigners();
    let kala = await readKala(hre);
    const {address} = readContracts(hre)['Router'];
    const routerInstance = await loadContract(hre, 'Router', address, signer) //new h
    let addressSymbolMap = {}
    for (const asset of Object.values(readAssets(hre))) {
        addressSymbolMap[asset.address] = asset.symbol;
    }
    //console.log(routerInstance)
    let {prices, assets} = await routerInstance.queryAssetPricesFromPool().catch(e => {
        console.error("myerror:", e)
    });
    let requestBody = [];
    for (let i = 0; i < prices.length; i++) {
        let address = assets[i];
        let price = parseFloat(fromUnit(prices[i].toString())) ;
        //let price=1.0000;
        let symbol = kala.address.toUpperCase() === address.toUpperCase() ? kala.symbol : addressSymbolMap[address];
        requestBody.push({symbol, price})
    }

    const {body} = await got.post(URL, {json: requestBody,});
    logger.info(`Collector:${JSON.stringify({url: URL, request: requestBody, response: body})}`,)
}

module.exports = {
    collectPrices
};



