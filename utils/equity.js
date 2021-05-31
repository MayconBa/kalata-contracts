const got = require('got');


async function queryPricesFromSina(codes) {
    let url = `https://hq.sinajs.cn/?list=${codes}`;
    const response = await got(url);
    const result = {};
    for (let line of response.body.replace(/var hq_str_/gi, "").split(";").map(item => item.trim()).filter(item => item.length > 0)) {
        result[line.trim().split("=")[0]] = line.split(",")[1];
    }
    console.log(`queryPricesFromSina,url:${url},response:${JSON.stringify(result)}`);
    return result;
}


async function queryPricesFromGtimg(codes) {
    let url = `https://qt.gtimg.cn/q=${codes}`;
    const response = await got(url);
    const result = {};
    for (let line of response.body.split(";").map(item => item.trim()).filter(item => item.length > 0)) {
        result[line.trim().split("=")[0].replace(/v_/gi, "")] = line.split("~")[3];
    }
    console.log(`queryPricesFromGtimg,url:${url},response:${JSON.stringify(result)}`);
    return result;
}


module.exports = {
    queryPricesFromSina,queryPricesFromGtimg
}
