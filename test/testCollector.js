const hre = require("hardhat");
const {expect} = require("chai");
const {toUnit, toUnitString, toBN} = require('../utils/maths')
const {addLiquidity} = require('../utils/uniswap')
const {
    deployToken, deployAndInitializeContract, deployUniswapV2Router02, deployUniswapV2Factory, randomAddress, loadPair, ZERO_ADDRESS
} = require("../utils/contract")
const assert = require('../utils/assert')

const CONTRACT_NAME = 'Collector';
let collectorInstance;
let baseToken, govToken, wethToken, appleToken;
let deployer;
let collectorConfig;
let account1, account2, account3, account4, account5;
let uniswapFactory, uniswapRouter, govPair, applePair;

async function updateConfig(instance, config) {
    await instance.updateConfig(
        config.governance, config.uniswapFactory, config.uniswapRouter, config.baseToken, config.govToken
    )
}

function assertConfigEqual(config1, config2) {
    expect(config1.governance).to.equal(config2.governance);
    expect(config1.uniswapFactory).to.equal(config2.uniswapFactory);
    expect(config1.uniswapRouter).to.equal(config2.uniswapRouter);
    expect(config1.baseToken).to.equal(config2.baseToken);
    expect(config1.govToken).to.equal(config2.govToken);
}


describe(CONTRACT_NAME, () => {
    before(async () => {
        [deployer, account1, account2, account3, account4, account5] = await hre.ethers.getSigners();
        baseToken = await deployToken(hre, "usd-token", "busd", toUnitString('1200000000000'));
        govToken = await deployToken(hre, "kalata", "kala", toUnitString('1200000000000'));
        appleToken = await deployToken(hre, "Apple", "Apple", toUnitString('1200000000000'));
        wethToken = await deployToken(hre, "weth", "weth", 0);

        uniswapFactory = await deployUniswapV2Factory(hre, deployer.address);
        uniswapRouter = await deployUniswapV2Router02(hre, uniswapFactory.address, wethToken.address);

        await uniswapFactory.createPair(baseToken.address, govToken.address);
        await uniswapFactory.createPair(baseToken.address, appleToken.address);

        govPair = await loadPair(hre, await uniswapFactory.getPair(baseToken.address, govToken.address), deployer);
        applePair = await loadPair(hre, await uniswapFactory.getPair(baseToken.address, appleToken.address), deployer);

        let baseTokenAmount = toUnit("30000000");
        await addLiquidity(uniswapRouter, deployer, baseToken, govToken, baseTokenAmount, baseTokenAmount.mul(toBN("2")));
        await addLiquidity(uniswapRouter, deployer, baseToken, appleToken, baseTokenAmount, baseTokenAmount.mul(toBN("5")),);

        collectorConfig = {
            //mock collector,since this address is just used to transfer fee
            governance: randomAddress(hre),
            uniswapFactory: uniswapFactory.address,
            uniswapRouter: uniswapRouter.address,
            baseToken: baseToken.address,
            govToken: govToken.address,
        }

        collectorInstance = await deployAndInitializeContract(hre, CONTRACT_NAME, [
            collectorConfig.governance,
            collectorConfig.uniswapFactory,
            collectorConfig.uniswapRouter,
            collectorConfig.baseToken,
            collectorConfig.govToken,
        ]);
        expect(collectorInstance.address).to.properAddress;
    });


    describe("Deployment", async () => {
        it("Should set the right owner", async () => {
            expect(await collectorInstance.owner()).to.equal(deployer.address);
        });
    });
    describe("Transactions", async () => {
        it("queryConfig/updateConfig/permission", async () => {
            assertConfigEqual(collectorConfig, await collectorInstance.queryConfig());
            let newConfig = {
                uniswapRouter: randomAddress(hre),
                governance: randomAddress(hre),
                uniswapFactory: randomAddress(hre),
                govToken: randomAddress(hre),
                baseToken: randomAddress(hre)
            }

            await updateConfig(collectorInstance, newConfig);

            assertConfigEqual(newConfig, await collectorInstance.queryConfig());

            await updateConfig(collectorInstance, collectorConfig);

            assertConfigEqual(collectorConfig, await collectorInstance.queryConfig());

            //Another account should have no permission to updateConfig
            let account1Instance = collectorInstance.connect(account1);
            await expect(updateConfig(account1Instance, newConfig)).to.be.revertedWith("Ownable: caller is not the owner");

            //transfer ownership
            await collectorInstance.transferOwnership(account1.address);

            //now another account should have permission to updateConfig
            await updateConfig(account1Instance, newConfig)
            assertConfigEqual(newConfig, await collectorInstance.queryConfig());

            //transfer ownership back
            await account1Instance.transferOwnership(deployer.address);

            //update config back
            await updateConfig(collectorInstance, collectorConfig);
            assertConfigEqual(collectorConfig, await collectorInstance.queryConfig());
        });
    });

    describe("convert", async () => {
        it("Invalid assetToken address", async () => {
            expect(collectorInstance.convert(ZERO_ADDRESS)).to.be.revertedWith("Invalid assetToken address");
        });

        it("Pair not found", async () => {
            expect(collectorInstance.convert(randomAddress(hre))).to.be.revertedWith("Pair not found");
        });

        it("convert asset token to base token", async () => {
            await appleToken.transfer(collectorInstance.address, toUnit("120").toString())
            //get balances before converting
            let baseTokenBalance1 = await baseToken.balanceOf(collectorInstance.address);
            let appleTokenBalance1 = await appleToken.balanceOf(collectorInstance.address);

            // get reserves for baseToken and appleToken
            let reserves = await applePair.getReserves();
            let baseTokenIndex = baseToken.address.toLowerCase() < appleToken.address.toLowerCase() ? 0 : 1;
            let baseTokenReserve = reserves[baseTokenIndex];
            let appleTokenReserve = reserves[1 - baseTokenIndex];

            //get desired appleeToken from convert() method
            let baseTokenDesired = await uniswapRouter.getAmountOut(appleTokenBalance1.toString(), appleTokenReserve.toString(), baseTokenReserve.toString());

            //execute convert
            await collectorInstance.convert(appleToken.address);

            //get balances after converting
            let baseTokenBalance2 = await baseToken.balanceOf(collectorInstance.address);
            let appleTokenbalance2 = await appleToken.balanceOf(collectorInstance.address);

            expect(appleTokenbalance2.toString()).to.equal('0');
            let baseTokenbalanceAdded = toBN(baseTokenBalance2.toString()).sub(toBN(baseTokenBalance1.toString()));
            expect(baseTokenbalanceAdded.toString()).to.equal(baseTokenDesired.toString());
        });

        it("convert base token to gov token", async () => {
            //transfer some base token to collector for test
            await baseToken.transfer(collectorInstance.address, toUnit("50").toString())

            //get balances before converting
            let govTokenbalance1 = await govToken.balanceOf(collectorInstance.address);
            let baseTokenBalance1 = await baseToken.balanceOf(collectorInstance.address);

            // get reserves for baseToken and govToken
            let reserves = await govPair.getReserves();
            let baseTokenIndex = baseToken.address.toLowerCase() < govToken.address.toLowerCase() ? 0 : 1;
            let baseTokenReserve = reserves[baseTokenIndex];
            let govTokenReserve = reserves[1 - baseTokenIndex];

            //get desired goveToken from convert() method
            let govTokenDesired = await uniswapRouter.getAmountOut(baseTokenBalance1.toString(), baseTokenReserve.toString(), govTokenReserve.toString());

            //execute convert
            await collectorInstance.convert(govToken.address);

            //get balances after converting
            let govTokenbalance2 = await govToken.balanceOf(collectorInstance.address);
            let baseTokenBalance2 = await baseToken.balanceOf(collectorInstance.address);

            expect(baseTokenBalance2.toString()).to.equal('0');
            let govTokenbalanceAdded = toBN(govTokenbalance2.toString()).sub(toBN(govTokenbalance1.toString()));
            expect(govTokenbalanceAdded.toString()).to.equal(govTokenDesired.toString());
        });


    });

    describe("distribute", async () => {
        it("transfer all the govToken to governance contract", async () => {
            //transfer some token to collector for test
            await govToken.transfer(collectorInstance.address, toUnitString("12.22"));

            let collectorBalance1 = await govToken.balanceOf(collectorInstance.address);
            let govBalance1 = await govToken.balanceOf(collectorConfig.governance);

            await collectorInstance.distribute();

            //All the govToken should be transfered to governance contract;
            assert.bnEqual(await govToken.balanceOf(collectorInstance.address), toBN('0'))
            assert.bnEqual((await govToken.balanceOf(collectorConfig.governance)).sub(govBalance1), collectorBalance1);

        });
    });


});