const hre = require("hardhat");
const {expect} = require("chai");
const {toUnitString} = require('../utils/maths')
const {deployToken} = require('../utils/contract')


const CONTRACT_NAME = "BEP20Token";
const TOKEN_NAME = "Kalata";
const TOKEN_SYMBOL = "Kala";
let instance
let owner
let addr1
let addr2

describe(CONTRACT_NAME, () => {

    beforeEach(async () => {
        [owner, addr1, addr2,] = await hre.ethers.getSigners();
        instance = await deployToken(hre, TOKEN_NAME, TOKEN_SYMBOL, toUnitString("120000000"));
        expect(instance.address).to.properAddress;
        expect(await instance.name()).to.equal(TOKEN_NAME);
    });

    describe("Deployment", async () => {

        it("Should set the right owner", async () => {
            expect(await instance.owner()).to.equal(owner.address);
        });

        it("Should assign the total supply of tokens to the owner", async () => {
            const ownerBalance = await instance.balanceOf(owner.address);
            expect(await instance.totalSupply()).to.equal(ownerBalance);
        });
    });

    describe("Transactions", async () => {
        it("Should transfer tokens between accounts", async () => {
            await expect(instance.transfer(addr1.address, 50)).to.emit(instance, 'Transfer').withArgs(owner.address, addr1.address, 50);
            const addr1Balance = await instance.balanceOf(addr1.address);
            expect(addr1Balance).to.equal(50);
            await expect(instance.connect(addr1).transfer(addr2.address, 50)).to.emit(instance, 'Transfer').withArgs(addr1.address, addr2.address, 50);
            const addr2Balance = await instance.balanceOf(addr2.address);
            expect(addr2Balance).to.equal(50)
        });

        it("transfer()", async () => {
            const initialOwnerBalance = await instance.balanceOf(owner.address);


            await instance.transfer(addr1.address, 100);
            await instance.transfer(addr2.address, 50);

            const finalOwnerBalance = await instance.balanceOf(owner.address);
            expect(finalOwnerBalance).to.equal(initialOwnerBalance.sub(150));

            const addr1Balance = await instance.balanceOf(addr1.address);
            expect(addr1Balance).to.equal(100);

            const addr2Balance = await instance.balanceOf(addr2.address);
            expect(addr2Balance).to.equal(50);
        });

        it("approve()/transferFrom()", async () => {
            const initialOwnerBalance = await instance.balanceOf(owner.address);
            await instance.transfer(addr1.address, 100);
            await instance.transfer(addr2.address, 50);

            const finalOwnerBalance = await instance.balanceOf(owner.address);
            expect(finalOwnerBalance).to.equal(initialOwnerBalance.sub(150));

            const addr1Balance = await instance.balanceOf(addr1.address);
            expect(addr1Balance).to.equal(100);

            const addr2Balance = await instance.balanceOf(addr2.address);
            expect(addr2Balance).to.equal(50);
        });
    });


    describe("upgrade", async () => {
        it("should upgrade instance", async () => {
            const instanceAddress = instance.address;
            const contractFactory = await hre.ethers.getContractFactory("BEP20Token");
            instance = await hre.upgrades.upgradeProxy(instance.address, contractFactory);
            expect(instance.address).to.properAddress;
            expect(instance.address).to.equal(instanceAddress);
        });
    });

    describe("mint()", async () => {
        it("should upgrade instance", async () => {
            const instanceAddress = instance.address;
            const contractFactory = await hre.ethers.getContractFactory("BEP20Token");
            instance = await hre.upgrades.upgradeProxy(instance.address, contractFactory);
            expect(instance.address).to.properAddress;
            expect(instance.address).to.equal(instanceAddress);
        });
    });

});