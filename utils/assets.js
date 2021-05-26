const path = require('path');
const fs = require('fs');
const {readJson, saveJson} = require("./json")

function getResourceFolder(hre) {
    return path.resolve(hre.config.paths.root, "publish", "deployed", hre.network.name);
}


function getBNBPath(hre) {
    return path.resolve(getResourceFolder(hre), "bnb.json");
}

function readBNB(hre) {
    return readJson(getBNBPath(hre))
}

function saveBNB(hre, content) {
    saveJson(getBNBPath(hre), content);
}

function getUSDPath(hre) {
    return path.resolve(getResourceFolder(hre), "usd.json");
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


module.exports = {
    getResourceFolder,
    readAssets,
    getKalaPath,
    readKala,
    saveKala,
    readBNB,
    saveBNB,
    readBUSD,
    saveBUSD,
}
