const hre = require("hardhat");
const {expect} = require("chai");
const {toUnit, toUnitString, toBN} = require('../utils/maths')
const {deployToken, deployAndInitializeContract, randomAddress, ZERO_ADDRESS} = require("../utils/contract")
const assert = require('../utils/assert')

const CONTRACT_NAME = 'Community';
let communityInstance;
let govToken
let deployer;
let defaultConfig;
let account1;

async function updateConfig(instance, config) {
    await instance.updateConfig(
        config.governance,
        config.govToken,
        config.spendLimit.toString(),
    )
}

function assertConfigEqual(config1, config2) {
    expect(config1.governance).to.equal(config2.governance);
    expect(config1.govToken).to.equal(config2.govToken);
    expect(config1.spendLimit.toString()).to.equal(config2.spendLimit.toString());
}


describe(CONTRACT_NAME, () => {
    before(async () => {
        [deployer, account1] = await hre.ethers.getSigners();
        govToken = await deployToken(hre, "kalata", "kala", toUnitString('1200000000000'));

        defaultConfig = {
            //mock community,since this address is just used to transfer fee
            governance: randomAddress(hre),
            govToken: govToken.address,
            spendLimit: toUnit("2000")
        }
        communityInstance = await deployAndInitializeContract(hre, CONTRACT_NAME, [
            defaultConfig.governance,
            defaultConfig.govToken,
            defaultConfig.spendLimit.toString(),
        ]);
        expect(communityInstance.address).to.properAddress;
    });


    describe("Deployment", async () => {
        it("Should set the right owner", async () => {
            expect(await communityInstance.owner()).to.equal(deployer.address);
        });
    });
    describe("Transactions", async () => {
        it("queryConfig/updateConfig/permission", async () => {
            assertConfigEqual(defaultConfig, await communityInstance.queryConfig());
            let newConfig = {
                governance: randomAddress(hre),
                govToken: randomAddress(hre),
                spendLimit: toUnit("20")
            }

            await updateConfig(communityInstance, newConfig);

            assertConfigEqual(newConfig, await communityInstance.queryConfig());

            await updateConfig(communityInstance, defaultConfig);

            assertConfigEqual(defaultConfig, await communityInstance.queryConfig());

            //Another account should have no permission to updateConfig
            let account1Instance = await communityInstance.connect(account1);
            await expect(updateConfig(account1Instance, newConfig)).to.be.revertedWith("Ownable: caller is not the owner");

            //transfer ownership
            await communityInstance.transferOwnership(account1.address);

            //now another account should have permission to updateConfig
            await updateConfig(account1Instance, newConfig)
            assertConfigEqual(newConfig, await communityInstance.queryConfig());

            //transfer ownership back
            await account1Instance.transferOwnership(deployer.address);

            //update config back
            await updateConfig(communityInstance, defaultConfig);
            assertConfigEqual(defaultConfig, await communityInstance.queryConfig());
        });
    });
    describe("spend", async () => {
        it("Invalid recipient", async () => {
            await expect(communityInstance.spend(ZERO_ADDRESS, toUnitString("20"))).to.be.revertedWith("Invalid recipient");
        });
        it("Invalid amount", async () => {
            await expect(communityInstance.spend(randomAddress(hre), toUnitString("0"))).to.be.revertedWith("Invalid amount");
        });

        it("Cannot spend more than spendLimit", async () => {
            let spendAmount = defaultConfig.spendLimit.add(toUnit("100"));
            await expect(communityInstance.spend(randomAddress(hre), spendAmount.toString())).to.be.revertedWith("Cannot spend more than spendLimit");
        });

        it("Cannot spend more than the community have", async () => {
            let balance = await govToken.balanceOf(communityInstance.address);
            let spendAmount = toBN(balance.toString()).add(toUnit("100"));
            await expect(communityInstance.spend(randomAddress(hre), spendAmount.toString())).to.be.reverted;
        });

        it("Only governance or owner can perform!", async () => {
            await expect(communityInstance.connect(account1).spend(randomAddress(hre), toUnitString("1")))
                .to.be.revertedWith("Only governance or owner can perform!");
        });

        it("transfer to receipt", async () => {
            let receipt = randomAddress(hre);
            let balance1 = await govToken.balanceOf(receipt);

            //transfer some token to community to test
            govToken.transfer(communityInstance.address, toUnitString("1000"));

            let transferAmount = toUnit("20");
            communityInstance.spend(receipt, transferAmount.toString())

            let balanceDiff = (await govToken.balanceOf(receipt)).sub(balance1);
            assert.bnEqual(balanceDiff, transferAmount);

        });
    });
});