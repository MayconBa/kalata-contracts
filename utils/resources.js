const path = require('path');
const fs = require('fs');
const {readJson, saveJson} = require("./json")

function getResourceFolder(hre) {
    return path.resolve(hre.config.paths.root, "publish", "deployed", hre.network.name);
}

function deleteResource(hre) {
    fs.rmdirSync(getResourceFolder(hre), {recursive: true});
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

function readUSD(hre) {
    return readJson(getUSDPath(hre))
}

function saveUSD(hre, content) {
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


function getContractsPath(hre) {
    return path.resolve(getResourceFolder(hre), "contracts.json");
}

function readContracts(hre) {
    return readJson(getContractsPath(hre))
}


function saveContracts(hre, content) {
    saveJson(getContractsPath(hre), content);
}


module.exports = {
    getResourceFolder,
    deleteResource,
    readContracts,
    saveContracts,
    getKalaPath,
    readKala,
    saveKala,
    readBNB, saveBNB,
    readUSD, saveUSD,
}