const hre = require("hardhat");
const {expect} = require("chai");
const {toUnit, toUnitString, divideDecimal} = require('../utils/maths')
const assert = require('../utils/assert')
const {deployToken, deployAndInitializeContract, loadContract} = require("../utils/contract")

let oracleInstance, kalataPriceFeederInstance;
let usdToken;
let deployer;
let tokenOne;
let tokenTwo;
let feeder;
const CONTRACT_NAME = 'Oracle';

describe(CONTRACT_NAME, () => {
    before(async () => {
        [deployer, feeder] = await hre.ethers.getSigners();
        usdToken = await deployToken(hre, "usd-token", "busd", toUnitString('1200000000000'));
        tokenOne = await deployToken(hre, "name1", "symbol1", 0);
        tokenTwo = await deployToken(hre, "name2", "symbol2", 0);
        kalataPriceFeederInstance = await deployAndInitializeContract(hre, "KalataOracle", [[], []])
        oracleInstance = await deployAndInitializeContract(hre, CONTRACT_NAME, [[kalataPriceFeederInstance.address]])
        expect(oracleInstance.address).to.properAddress;
        await kalataPriceFeederInstance.registerAsset(tokenOne.address, feeder.address)
        await kalataPriceFeederInstance.registerAsset(tokenTwo.address, feeder.address);

        await oracleInstance.registerAssets([tokenOne.address, tokenTwo.address])
    });

    describe("Deployment", async () => {
        it("Should set the right owner", async () => {
            expect(await oracleInstance.owner()).to.equal(deployer.address);
        });
    });

    describe("Transactions", async () => {
        it("Test queryFeeder", async () => {
            for (let asset of [tokenOne, tokenTwo]) {
                let feederAddress = await kalataPriceFeederInstance.queryFeeder(asset.address);
                expect(feeder.address).to.equal(feederAddress);
            }
        });

        it("Test feedPrices/queryAllPrices", async () => {
            let tokens = [];
            let prices = [];
            for (let asset of [tokenOne, tokenTwo]) {
                tokens.push(asset.address);
                prices.push(toUnitString(Math.random() * 1000));
            }
            await kalataPriceFeederInstance.connect(feeder).feedPrices(tokens, prices);
            let [queryAssets, queryPrices, queryUpdates] = await oracleInstance.queryAllPrices();
            expect(queryAssets.length).to.equal(queryPrices.length);
            expect(queryAssets.length).to.equal(queryUpdates.length);
            let queryPriceMap = {};
            for (let i = 0; i < queryAssets.length; i++) {
                queryPriceMap[queryAssets[i]] = queryPrices[i];
            }
            for (let i = 0; i < tokens.length; i++) {
                expect(prices[i]).to.equal(queryPriceMap[tokens[i]].toString());
            }
        });
    });
});
