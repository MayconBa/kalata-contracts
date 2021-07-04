const hre = require("hardhat");
const {fromUnit} = require("../utils/maths");
const {expect} = require("chai");
const {toUnitString} = require('../utils/maths')
const {deployToken} = require('../utils/contract')
const assert = require('../utils/assert')
const CONTRACT_NAME = "BEP20Token";
const TOKEN_NAME = "Kalata";
const TOKEN_SYMBOL = "Kala";
let token
let deployer, alice, bob, jack, tom

describe(CONTRACT_NAME, () => {
    beforeEach(async () => {
        [deployer, alice, bob, jack, tom] = await hre.ethers.getSigners();
        token = await deployToken(hre, TOKEN_NAME, TOKEN_SYMBOL, toUnitString("120000000"));
        expect(token.address).to.properAddress;
        expect(await token.name()).to.equal(TOKEN_NAME);
    });
    describe("Deployment", async () => {
        it("Should set the right owner", async () => {
            expect(await token.owner()).to.equal(deployer.address);
        });

        it("Should assign the total supply of tokens to the owner", async () => {
            const ownerBalance = await token.balanceOf(deployer.address);
            expect(await token.totalSupply()).to.equal(ownerBalance);
        });
    });
    describe("Transactions", async () => {
        it("Should transfer tokens between accounts", async () => {
            await expect(token.transfer(alice.address, 50)).to.emit(token, 'Transfer').withArgs(deployer.address, alice.address, 50);
            const addr1Balance = await token.balanceOf(alice.address);
            expect(addr1Balance).to.equal(50);
            await expect(token.connect(alice).transfer(bob.address, 50)).to.emit(token, 'Transfer').withArgs(alice.address, bob.address, 50);
            const addr2Balance = await token.balanceOf(bob.address);
            expect(addr2Balance).to.equal(50)
        });

        it("transfer()", async () => {
            const balance1 = await token.balanceOf(deployer.address);
            await token.transfer(alice.address, 100);
            await token.transfer(bob.address, 50);

            const balance2 = await token.balanceOf(deployer.address);
            expect(balance2).to.equal(balance1.sub(150));
            expect(await token.balanceOf(alice.address)).to.equal(100);
            expect(await token.balanceOf(bob.address)).to.equal(50);
        });


    });


    describe("upgrade", async () => {
        it("should upgrade instance", async () => {
            const instanceAddress = token.address;
            const contractFactory = await hre.ethers.getContractFactory("BEP20Token");
            token = await hre.upgrades.upgradeProxy(token.address, contractFactory);
            expect(token.address).to.properAddress;
            expect(token.address).to.equal(instanceAddress);
        });
    });

    describe("mint()", async () => {
        it("should upgrade instance", async () => {
            const instanceAddress = token.address;
            const contractFactory = await hre.ethers.getContractFactory("BEP20Token");
            token = await hre.upgrades.upgradeProxy(token.address, contractFactory);
            expect(token.address).to.properAddress;
            expect(token.address).to.equal(instanceAddress);
        });
    });

    it("approve()/transferFrom()", async () => {
        const balance1 = await token.balanceOf(deployer.address);
        let allowance = await token.allowance(deployer.address, tom.address);
        let approveAmount = toUnitString("12");
        let receipt = await token.approve(tom.address, approveAmount);
        await receipt.wait();
        expect((await token.allowance(deployer.address, tom.address)).toString()).to.equal(approveAmount);

        assert.bnClose(approveAmount, await token.allowance(deployer.address, tom.address), toUnitString("0.0001"))

        receipt = await token.connect(tom).transferFrom(deployer.address, alice.address, approveAmount);
        await receipt.wait();
        const balance2 = await token.balanceOf(deployer.address);
        assert.bnClose(balance1 - balance2, approveAmount, toUnitString("0.0001"))
        assert.bnClose(await token.balanceOf(alice.address), approveAmount, toUnitString("0.0001"))
    });

});

