const path = require('path');
const fs = require('fs');
const {readJson, saveJson} = require("./json")

function getResourceFolder(hre) {
    //console.log('hre.config', hre.config)
    return path.resolve(hre.config.paths.root, "publish", "deployed", hre.network.name);
}

function deleteResource(hre) {
    fs.rmdirSync(getResourceFolder(hre), {recursive: true});
}


function getContractsPath(hre) {
    return path.resolve(getResourceFolder(hre), "contracts.json");
}


function updateWebContracts(hre, key, value) {
    let filePath = path.resolve(getResourceFolder(hre), "webContracts.json");
    let json = readJson(filePath) || {};
    json[key] = value;
    saveJson(filePath, json);
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
    updateWebContracts,
}
