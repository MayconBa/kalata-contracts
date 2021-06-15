const {ethers, web3} = require("hardhat");
const {expect} = require("chai");
const {stringToBytes32} = require('../utils/bytes')


describe("StringAndBytes32", () => {
    let stringInstance;
    let bytes32Instance;

    beforeEach(async () => {
        const Contract = await ethers.getContractFactory("StringWrapper", {});
        stringInstance = await Contract.deploy();
        await stringInstance.deployed();

        const Bytes32Wrapper = await ethers.getContractFactory("Bytes32Wrapper", {});
        bytes32Instance = await Bytes32Wrapper.deploy();
        await bytes32Instance.deployed();
        expect(bytes32Instance.address).to.properAddress;
    });


    describe("Logic", async () => {
        it('toBytes32', async () => {
            let data = "mApple Token is Great";
            let exptectedData = stringToBytes32(data);
            let b32 = await stringInstance.convertToBytes32(data);
            expect(exptectedData).equal(b32);
            expect(data).to.equal(await bytes32Instance.convertToString(b32));
            expect(data).to.equal(await bytes32Instance.convertToString(exptectedData));
        });
    });

});