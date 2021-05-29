const got = require('got');

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


module.exports = {
    requestSinaStockPrices,
    requestGtimgStockPrices,
    loadCrptoCurrency
}
