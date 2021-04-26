const hre = require("hardhat");
const {expect} = require("chai");
const {addLiquidity} = require('../utils/uniswap')
const {toUnit, toUnitString, toBN} = require('../utils/maths')
const {stringToBytes32} = require('../utils/bytes')
const {
    deployToken,
    deployAndInitializeContract,
    deployUniswapV2Router02,
    deployUniswapV2Factory,
    randomAddress,
    loadPair,
    ZERO_ADDRESS
} = require("../utils/contract")
const assert = require('../utils/assert')

let factoryInstance, oracleInstance, stakingInstance, mintInstance;
let baseToken, govToken, wethToken, appleToken;
let deployer;
let defaultConfig;
let account1, account2, account3, account4;
let uniswapFactory, uniswapRouter, govPair, applePair;
let mockedGovernance;

async function updateConfig(instance, config) {
    await instance.updateConfig(
        config.governance, config.mint, config.oracle, config.staking,
        config.uniswapFactory,
        config.baseToken, config.govToken
    )
}

function assertConfigEqual(config1, config2) {
    expect(config1.governance).to.equal(config2.governance);
    expect(config1.mint).to.equal(config2.mint);
    expect(config1.oracle).to.equal(config2.oracle);
    expect(config1.staking).to.equal(config2.staking);
    expect(config1.uniswapFactory).to.equal(config2.uniswapFactory);
    expect(config1.baseToken).to.equal(config2.baseToken);
    expect(config1.govToken).to.equal(config2.govToken);
}

const getWhitelistParams = (symbol, weight) => {
    return {
        name: stringToBytes32(symbol),
        symbol: stringToBytes32(symbol),
        oracleFeeder: deployer.address,
        auctionDiscount: toUnit("0.8").toString(),
        minCollateralRatio: toUnit("1.5").toString(),
        weight,
    }
};

const CONTRACT_NAME = 'Factory';
describe(CONTRACT_NAME, () => {
    before(async () => {
        [deployer, mockedGovernance, account1, account2, account3, account4] = await hre.ethers.getSigners();
        baseToken = await deployToken(hre, "usd-token", "busd", toUnitString('1200000000000'));
        govToken = await deployToken(hre, "kalata", "kala", toUnitString('1200000000000'));
        appleToken = await deployToken(hre, "Apple", "Apple", toUnitString('1200000000000'));
        wethToken = await deployToken(hre, "weth", "weth", 0);

        //mock collector
        let mockedCollectorAddress = randomAddress(hre);

        //mock factory first,then update the factory after factory is deployed
        let mockedFactoryAddress = mockedGovernance.address;


        //deploy uniswap factory
        uniswapFactory = await deployUniswapV2Factory(hre, deployer.address);
        expect(uniswapFactory.address).to.properAddress;

        //deploy uniswap router
        uniswapRouter = await deployUniswapV2Router02(hre, uniswapFactory.address, wethToken.address);
        expect(uniswapRouter.address).to.properAddress;

        //deploy oracle
        oracleInstance = await deployAndInitializeContract(hre, "Oracle", [mockedFactoryAddress, baseToken.address])
        expect(oracleInstance.address).to.properAddress;

        //deploy staking
        stakingInstance = await deployAndInitializeContract(hre, "Staking", [mockedFactoryAddress, govToken.address])

        //deploy mintInstance
        mintInstance = await deployAndInitializeContract(hre, "Mint", [
            mockedFactoryAddress,
            oracleInstance.address,
            mockedCollectorAddress,
            baseToken.address,
            toUnitString("0.015")
        ]);
        expect(stakingInstance.address).to.properAddress;

        defaultConfig = {
            governance: mockedGovernance.address,
            mint: mintInstance.address,
            oracle: oracleInstance.address,
            staking: stakingInstance.address,
            uniswapFactory: uniswapFactory.address,
            baseToken: baseToken.address,
            govToken: govToken.address,
        };

        factoryInstance = await deployAndInitializeContract(hre, CONTRACT_NAME, [
            defaultConfig.governance, defaultConfig.mint, defaultConfig.oracle, defaultConfig.staking, defaultConfig.uniswapFactory,
            defaultConfig.baseToken, defaultConfig.govToken
        ]);

        expect(factoryInstance.address).to.properAddress;

        await govToken.registerMinters([factoryInstance.address, mintInstance.address]);

        //After the factory is deployed, replace the mock factory with the deployed factory
        await oracleInstance.setFactory(factoryInstance.address);
        await mintInstance.setFactory(factoryInstance.address);
        await stakingInstance.setFactory(factoryInstance.address);


        await uniswapFactory.createPair(baseToken.address, govToken.address);
        await uniswapFactory.createPair(baseToken.address, appleToken.address);


        govPair = await loadPair(hre, await uniswapFactory.getPair(baseToken.address, govToken.address), deployer);
        applePair = await loadPair(hre, await uniswapFactory.getPair(baseToken.address, appleToken.address), deployer);

        let baseTokenPoolAmount = toUnit("30000000");


        await addLiquidity(uniswapRouter, deployer, baseToken, govToken, baseTokenPoolAmount, baseTokenPoolAmount.mul(toBN("2")));
        await addLiquidity(uniswapRouter, deployer, baseToken, appleToken, baseTokenPoolAmount, baseTokenPoolAmount.mul(toBN("5")),);
    });

    describe("revokeAsset", async () => {

        it("check permissions", async () => {
            expect(factoryInstance.connect(account4).revokeAsset(randomAddress(hre), 1)).to.revertedWith("unauthorized");
        });

        it("revokeAsset", async () => {
            let params = getWhitelistParams("mockRevokeToken", 32);
            await factoryInstance.whitelist(...Object.values(params));
            let tokenAddress = await factoryInstance.queryToken(params.symbol);
            let totalWeight = await factoryInstance.queryTotalWeight();
            await factoryInstance.revokeAsset(tokenAddress, toUnitString("12.5"));
            expect(await factoryInstance.queryWeight(tokenAddress)).equal(0);
            expect(await factoryInstance.queryTotalWeight()).equal(totalWeight - params.weight);
        });
    });

    describe("Deployment", async () => {
        it("Should set the right owner", async () => {
            expect(await factoryInstance.owner()).to.equal(deployer.address);
        });
    });
    describe("updateConfig", async () => {
        it("check permissions", async () => {
            expect(updateConfig(factoryInstance.connect(account1), defaultConfig)).to.revertedWith("Ownable: caller is not the owner");
        });

        it("Invalid parameters", async () => {
            expect(updateConfig(factoryInstance, {...defaultConfig, governance: ZERO_ADDRESS})).to.revertedWith("Invalid governance address");
            expect(updateConfig(factoryInstance, {...defaultConfig, mint: ZERO_ADDRESS})).to.revertedWith("Invalid mint address");
            expect(updateConfig(factoryInstance, {...defaultConfig, oracle: ZERO_ADDRESS})).to.revertedWith("Invalid oracle address");
            expect(updateConfig(factoryInstance, {...defaultConfig, staking: ZERO_ADDRESS})).to.revertedWith("Invalid staking address");
            expect(updateConfig(factoryInstance, {...defaultConfig, uniswapFactory: ZERO_ADDRESS})).to.revertedWith("Invalid uniswapFactory address");
            expect(updateConfig(factoryInstance, {...defaultConfig, baseToken: ZERO_ADDRESS})).to.revertedWith("Invalid baseToken address");
            expect(updateConfig(factoryInstance, {...defaultConfig, govToken: ZERO_ADDRESS})).to.revertedWith("Invalid govToken address");
        });
        it("update", async () => {
            let newConfig = {
                governance: randomAddress(hre),
                mint: randomAddress(hre),
                oracle: randomAddress(hre),
                staking: randomAddress(hre),
                uniswapFactory: randomAddress(hre),
                baseToken: randomAddress(hre),
                govToken: randomAddress(hre),
            };
            await updateConfig(factoryInstance, newConfig);
            assertConfigEqual(newConfig, await factoryInstance.queryConfig());

            await updateConfig(factoryInstance, defaultConfig);
            assertConfigEqual(defaultConfig, await factoryInstance.queryConfig());
        });
    });
    describe("updateDistributionSchedules", async () => {
        let startTimes = [21600, 31557600, 63093600, 94629600]
        let endTimes = [31557600, 63093600, 94629600, 126165600]
        let amounts = [toUnitString(549000), toUnitString(274500), toUnitString(137250), toUnitString(68625)]
        it("check permissions", async () => {
            expect(factoryInstance.connect(account1).updateDistributionSchedules(startTimes, endTimes, amounts)).to.revertedWith("Ownable: caller is not the owner");
        });

        it("Invalid arguments", async () => {
            expect(factoryInstance.updateDistributionSchedules([1], [2, 3], [toUnitString("12")])).to.revertedWith("Invalid arguments");
        });
        it("update", async () => {
            await factoryInstance.updateDistributionSchedules(startTimes, endTimes, amounts);
            let schedules = await factoryInstance.queryDistributionSchedules();
            expect(schedules['startTimes'].map(item => item.toString()).join(",")).to.equal(startTimes.join(","));
            expect(schedules['endTimes'].map(item => item.toString()).join(",")).to.equal(endTimes.join(","));
            expect(schedules['amounts'].map(item => item.toString()).join(",")).to.equal(amounts.join(","));
        });
    });
    describe("updateWeight", async () => {
        it("check permission", async () => {
            expect(factoryInstance.connect(account1).updateWeight(appleToken.address, 12)).to.revertedWith("Unauthorized,need governace/owner to perform.");
        });

        it("update", async () => {
            //governance should have the right to update weight
            let govAccountInstance = await factoryInstance.connect(mockedGovernance);
            let weight = 12;
            govAccountInstance.updateWeight(appleToken.address, weight)
            expect(await govAccountInstance.queryWeight(appleToken.address)).to.equal(weight)

            //deployer should have hte right to update weight
            weight = 5;
            factoryInstance.updateWeight(appleToken.address, weight)
            expect(await factoryInstance.queryWeight(appleToken.address)).to.equal(weight)
        });
    });
    describe("whitelist", async () => {
        const getWhitelistParams = () => {
            let [name, symbol] = ["apple", "apple"];
            return {
                name: stringToBytes32(name),
                symbol: stringToBytes32(symbol),
                oracleFeeder: deployer.address,
                auctionDiscount: toUnit("0.8").toString(),
                minCollateralRatio: toUnit("1.5").toString(),
                weight: 5,
            }
        };
        it("check permissions", async () => {
            expect(factoryInstance.connect(account3).whitelist(
                ...Object.values(getWhitelistParams())
            )).to.revertedWith("unauthorized,need governace/owner to perform");
        });

        it("whitelist", async () => {
            let params = getWhitelistParams();
            await factoryInstance.whitelist(...Object.values(getWhitelistParams()));

            let assetAddress = await factoryInstance.queryToken(params.symbol);
            expect(assetAddress).to.properAddress;

            let pair = await uniswapFactory.getPair(baseToken.address, assetAddress);
            expect(pair).to.properAddress;

            let assetConfig = await mintInstance.queryAssetConfig(assetAddress);
            expect(assetConfig.auctionDiscount.toString()).to.equal(params.auctionDiscount);
            expect(assetConfig.minCollateralRatio.toString()).to.equal(params.minCollateralRatio);


            let feeder = await oracleInstance.queryFeeder(assetAddress);
            expect(feeder).to.equal(params.oracleFeeder);

            let stakingPool = await stakingInstance.queryStake(assetAddress);
            expect(stakingPool.stakingToken).to.equal(pair);
            expect(stakingPool.pendingReward.toString()).to.equal('0');
            expect(stakingPool.stakingAmount.toString()).to.equal('0');
            expect(stakingPool.rewardIndex.toString()).to.equal('0');

        });
    });
    it("distribute", async () => {
        const getParams = (symbol, weight) => {
            return {
                name: stringToBytes32(symbol),
                symbol: stringToBytes32(symbol),
                oracleFeeder: deployer.address,
                auctionDiscount: toUnit("0.8").toString(),
                minCollateralRatio: toUnit("1.5").toString(),
                weight,
            }
        };
        let params = getParams("mockDToken1", 5);
        await factoryInstance.whitelist(...Object.values(params));
        let stakingBalance = await govToken.balanceOf(stakingInstance.address);

        //wait 5 seconds;
        await new Promise(resolve => setTimeout(resolve, 5000));
        let schedule = {startTime: 0, endTime: 50, amount: toUnit("300")}
        await factoryInstance.updateDistributionSchedules([schedule.startTime], [schedule.endTime], [schedule.amount.toString()]);
        await factoryInstance.distribute();
        let stakingBalanceAfter = await govToken.balanceOf(stakingInstance.address);
        assert.bnGt(stakingBalanceAfter, stakingBalance)
    });
    describe("migrateAsset", async () => {
        const name = stringToBytes32("newMigrationName");
        const symbol = name;
        const endPrice = toUnitString("12.5");
        it("check permissions", async () => {
            expect(factoryInstance.connect(account4).migrateAsset(name, symbol, randomAddress(hre), endPrice)).to.revertedWith("unauthorized");
        });

        it("migrateAsset", async () => {
            let params = getWhitelistParams("mockMigrateToken", 11);
            await factoryInstance.whitelist(...Object.values(params));
            let tokenAddress = await factoryInstance.queryToken(params.symbol);
            let totalWeight = await factoryInstance.queryTotalWeight();
            console.log('totalWeight before', totalWeight.toString());
            await factoryInstance.migrateAsset(name, symbol, tokenAddress, endPrice);
            expect(await factoryInstance.queryWeight(tokenAddress)).equal(0);
            console.log('totalWeight after', (await factoryInstance.queryTotalWeight()).toString());

            //the total weight should remains the same
            expect(await factoryInstance.queryTotalWeight()).equal(totalWeight);
        });
    });


});
