const hre = require("hardhat");
const {expect} = require("chai");
const {toUnit, toUnitString, divideDecimal} = require('../utils/maths')
const assert = require('../utils/assert')
const {deployToken, deployAndInitializeContract, loadContract} = require("../utils/contract")

let oracleInstance;
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

        //mock factory
        let factory = deployer.address;
        let baseAsset = usdToken.address;

        oracleInstance = await deployAndInitializeContract(hre, CONTRACT_NAME, [factory, baseAsset])
        expect(oracleInstance.address).to.properAddress;

        await oracleInstance.registerAsset(tokenOne.address, feeder.address)
        await oracleInstance.registerAsset(tokenTwo.address, feeder.address);
    });

    describe("Deployment", async () => {
        it("Should set the right owner", async () => {
            expect(await oracleInstance.owner()).to.equal(deployer.address);
        });
    });

    describe("Transactions", async () => {
        it("Test queryFeeder", async () => {
            for (let asset of [tokenOne, tokenTwo]) {
                let feederAddress = await oracleInstance.queryFeeder(asset.address);
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

            let feederOracleInstance = await loadContract(hre, CONTRACT_NAME, oracleInstance.address, feeder);
            await feederOracleInstance.feedPrices(tokens, prices);

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

        it("test queryPriceByDenominate", async () => {
            let tokenOnePrice = toUnit(Math.random() * 1000);
            let tokenTwoPrice = toUnit(Math.random() * 1000);

            let feederOracleInstance = await loadContract(hre, CONTRACT_NAME, oracleInstance.address, feeder);
            await feederOracleInstance.feedPrice(tokenOne.address, tokenOnePrice.toString());
            await feederOracleInstance.feedPrice(tokenTwo.address, tokenTwoPrice.toString());

            let [remoteTokenOnePrice,] = await oracleInstance.queryPriceByDenominate(tokenOne.address, usdToken.address);
            let [remoteTokenTwoPrice,] = await oracleInstance.queryPriceByDenominate(tokenTwo.address, usdToken.address);
            assert.bnEqual(tokenOnePrice, remoteTokenOnePrice);
            assert.bnEqual(tokenTwoPrice, remoteTokenTwoPrice);
            let [remotePrice, ...c] = await oracleInstance.queryPriceByDenominate(tokenOne.address, tokenTwo.address);
            assert.bnEqual(divideDecimal(tokenOnePrice, tokenTwoPrice), remotePrice);
        });


    });


});
