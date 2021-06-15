const fs = require('fs');

function readJson(file) {
    if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file));
    }
    return null
}

function saveJson(file, obj) {
    if (!fs.existsSync(file)) {
        const filePath = file.replace(/\\/gi, "/");
        let folder = filePath.substring(0, filePath.lastIndexOf("/"))
        fs.mkdirSync(folder, {recursive: true})
    }
    fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}


module.exports = {
    readJson, saveJson
}