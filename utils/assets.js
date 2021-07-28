const path = require('path');
const fs = require('fs');
const {readJson, saveJson} = require("./json")

function getResourceFolder(hre) {
    return path.resolve(hre.config.paths.root, "deployed", hre.network.name);
}


function getBNBPath(hre) {
    return path.resolve(getResourceFolder(hre), "wbnb.json");
}

function readWBNB(hre) {
    return readJson(getBNBPath(hre))
}

function saveWBNB(hre, content) {
    saveJson(getBNBPath(hre), content);
}

function getUSDPath(hre) {
    return path.resolve(getResourceFolder(hre), "busd.json");
}

function readBUSD(hre) {
    return readJson(getUSDPath(hre))
}

function saveBUSD(hre, content) {
    saveJson(getUSDPath(hre), content);
}

function getKalaPath(hre) {
    return path.resolve(getResourceFolder(hre), "kala.json");
}

function readKala(hre) {
    return readJson(getKalaPath(hre))
}

function saveKala(hre, content) {
    saveJson(getKalaPath(hre), content);
}

function getAssetsPath(hre) {
    return path.resolve(getResourceFolder(hre), "assets.json");
}

function readAssets(hre) {
    return readJson(getAssetsPath(hre))
}

function saveAssets(hre, content) {
    saveJson(getAssetsPath(hre), content);
}

function getWebAssetsPath(hre) {
    return path.resolve(getResourceFolder(hre), "webAssets.json");
}

function readWebAssets(hre) {
    return readJson(getWebAssetsPath(hre))
}

function saveWebAssets(hre, content) {
    saveJson(getWebAssetsPath(hre), content);
}

function getAddressSymbolMapping(hre) {
    let mapping = {};
    Object.values(readAssets(hre)).forEach(asset => {
        mapping[asset.address.toUpperCase()] = asset.symbol;
    })
    let kala = readKala(hre);
    mapping[kala.address.toUpperCase()] = kala.symbol;

    let busd = readBUSD(hre);
    mapping[busd.address.toUpperCase()] = busd.symbol;

    let wbnb = readWBNB(hre);
    mapping[wbnb.address.toUpperCase()] = wbnb.symbol;

    return mapping;

}


module.exports = {
    readWebAssets,
    saveWebAssets,
    saveAssets,
    readAssets,
    getKalaPath,
    readKala,
    saveKala,
    readWBNB,
    saveWBNB,
    readBUSD,
    saveBUSD,
    getAddressSymbolMapping
}
