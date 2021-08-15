const moment = require("moment");
const {loadToken} = require("../../utils/contract");
const {waitReceipt} = require("../../utils/contract");
const {humanBN} = require("../../utils/maths");
const {resolve} = require('path')
const {constants: {ZERO_BYTES32}} = require('@openzeppelin/test-helpers');
const {randomString} = require("../../utils/string");
const {readJson, saveJson} = require("../../utils/json");
const {readContracts} = require("../../utils/resources");
const {stringToBytes32} = require("../../utils/bytes");
const {loadContractByAbi} = require("../../utils/contract");
const {logger} = require('./logger')
const {readAssets, saveAssets, readWebAssets, saveWebAssets, readKala, saveKala, readBUSD} = require("../../utils/assets")

class Mint {
    constructor(hre) {
        this.hre = hre;
        const Contract = require('web3-eth-contract');
        Contract.setProvider(this.hre.network.provider)
        this.deployedContracts = readContracts(this.hre);
        this.network = this.hre.network.name;
    }

    async init() {
        let [signer] = await this.hre.ethers.getSigners();
        this.signer = signer;
        let deployedContracts = readContracts(this.hre);

        async function loadContract(hre, name) {
            let {abi, address} = deployedContracts[name];
            return await loadContractByAbi(hre, abi, address, signer);
        }

        this.mintInstance = await loadContract(this.hre, 'Mint');
        this.oracleInstance = await loadContract(this.hre, 'Oracle');
    }

    async doAuction() {
        const webAssets = Object.values(readWebAssets(this.hre)).filter(item => item.minable);
        for (let asset of webAssets) {
            let assetToken = await loadToken(this.hre, asset.address, this.signer);
            //let {price} = await this.oracleInstance.queryPrice(asset.address);
            //console.log(asset.symbol, humanBN(price));
            let {positionIdxes, positionOwners, positionCollaterals, positionCollateralAmounts, positionAssets, positionAssetAmounts}
                = await this.mintInstance.queryInvalidPositioins(asset.address);
            for (let i = 0; i < positionIdxes.length; i++) {
                let idx = positionIdxes[i];
                let owner = positionOwners[i];
                let collateral = positionCollaterals[i];
                let collateralAmount = positionCollateralAmounts[i];
                let asset = positionAssets[i];
                let assetAmount = positionAssetAmounts[i];
                let liquidateAssetAmount = assetAmount.div(2)
                await waitReceipt(assetToken.approve(this.mintInstance.address, liquidateAssetAmount.toString()))
                let receipt = await this.mintInstance.auction(idx, liquidateAssetAmount).catch(e => {
                    logger.error(`mint.auction :${e}`)
                });
                if (receipt) {
                    await receipt.wait().catch(e => {
                        logger.error(`mint.auction,receipt.wait :${e}`)
                    });
                    logger.info(`mint.auction :${receipt.hash}`)
                }

            }
        }
    }
}

module.exports = {
    Mint
};


