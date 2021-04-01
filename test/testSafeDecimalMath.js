const {ethers} = require("hardhat");
const {expect} = require("chai");
const {toBN} = require('web3-utils');
const {toUnit, fromUnit, toPreciseUnit, fromPreciseUnit, toUnitString, toBNString} = require('../utils/maths')
const assert = require('../utils/assert')

describe("SafeDecimalMath", () => {
    let instance
    let owner
    let addr1
    let addr2
    let addrs

    beforeEach(async () => {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
        //const SafeDecimalMath = await ethers.getContractFactory("SafeDecimalMath", owner);
        //const safeDecimalMathInstance = await SafeDecimalMath.deploy();
        //await safeDecimalMathInstance.deployed();
        const SafeDecimalMathWrapper = await ethers.getContractFactory("SafeDecimalMathWrapper", {});
        instance = await SafeDecimalMathWrapper.deploy();
        await instance.deployed();
        expect(instance.address).to.properAddress;
    });

    describe("Deployment", async () => {
        it('should have the correct unit', async () => {
            assert.bnEqual(await instance.unit(), toUnit('1'));
        });

        it('should have the correct precise unit', async () => {
            assert.bnEqual(await instance.preciseUnit(), toPreciseUnit('1'));
        });

        it('should be able to from and to both kinds of units without getting a different result', async () => {
            assert.equal(fromUnit(toUnit('1')), '1');
            assert.equal(fromPreciseUnit(toPreciseUnit('1')), '1');

            assert.equal(fromUnit(toUnit('0.5')), '0.5');
            assert.equal(fromPreciseUnit(toPreciseUnit('0.5')), '0.5');
        });

        // -----------------------
        // multiplyDecimal
        // -----------------------
        it('should return correct results for expected multiplications', async () => {

            assert.bnEqual(await instance.multiplyDecimal(toUnitString('10'), toUnitString('2')), toUnit('20'));
            assert.bnEqual(await instance.multiplyDecimal(toUnitString('10'), toUnitString('0.3')), toUnit('3'));
            assert.bnEqual(await instance.multiplyDecimal(toUnitString('46'), toUnitString('3')), toUnit('138'));
        });

        it('should correctly multiply by zero', async () => {
            assert.bnEqual(await instance.multiplyDecimal(toUnitString('46'), toUnitString('0')), 0);
            assert.bnEqual(await instance.multiplyDecimal(toUnitString('1000000000'), toUnitString('0')), 0);
            assert.bnEqual(await instance.multiplyDecimal(toUnitString('1'), toUnitString('0')), 0);
        });

        it('should correctly multiply by one', async () => {
            assert.bnEqual(await instance.multiplyDecimal(toUnitString('46'), toUnitString('1')), toUnit('46'));
            assert.bnEqual(await instance.multiplyDecimal(toUnitString('1000000000'), toUnitString('1')), toUnit('1000000000'));
        });

        it('should apply decimal multiplication commutatively', async () => {
            assert.bnEqual(await instance.multiplyDecimal(toUnitString('1.5'), toUnitString('7')), await instance.multiplyDecimal(toUnitString('7'), toUnitString('1.5')));
            assert.bnEqual(await instance.multiplyDecimal(toUnitString('234098'), toUnitString('7')), await instance.multiplyDecimal(toUnitString('7'), toUnitString('234098')));
        });

        it('should revert multiplication on overflow', async () => {
            await assert.revert(instance.multiplyDecimal(toUnitString('10000000000000000000000000000'), toUnitString('10000000000000000000000000000')));
        });

        it('should truncate instead of rounding when multiplying', async () => {
            const oneAbove = toUnit('1').add(toBN('1'));
            const oneBelow = toUnit('1').sub(toBN('1'));
            assert.bnEqual(await instance.multiplyDecimal(oneAbove.toString(10), oneBelow.toString(10)), oneBelow);
        });

        // -----------------------
        // divideDecimal
        // -----------------------

        it('should divide decimals correctly', async () => {
            assert.bnEqual(await instance.divideDecimal(toUnitString('1'), toUnitString('4')), toUnit('0.25'));
            assert.bnEqual(await instance.divideDecimal(toUnitString('20'), toUnitString('4')), toUnit('5'));
            assert.bnEqual(await instance.divideDecimal(toUnitString('20'), toUnitString('0.25')), toUnit('80'));
        });
        ///


        it('should revert on divide by zero', async () => {
            await assert.revert(instance.divideDecimal(toUnitString('1'), toUnitString('0')));
            await assert.revert(instance.divideDecimal(toUnitString('100'), toUnitString('0')));
            await assert.revert(instance.divideDecimal(toUnitString('0.25'), toUnitString('0')));
        });

        it('should correctly divide by one', async () => {
            assert.bnEqual(await instance.divideDecimal(toUnitString('1'), toUnitString('1')), toUnit('1'));
            assert.bnEqual(await instance.divideDecimal(toUnitString('100'), toUnitString('1')), toUnit('100'));
            assert.bnEqual(await instance.divideDecimal(toUnitString('0.25'), toUnitString('1')), toUnit('0.25'));
        });

        it('should truncate instead of rounding when dividing', async () => {
            assert.bnEqual(
                await instance.divideDecimal(toUnitString('2'), toUnitString('3')),
                toUnit('0.666666666666666666')
            );
        });

        // -----------------------
        // multiplyDecimalRound
        // -----------------------

        it('should return correct results for expected rounding multiplications', async () => {
            assert.bnEqual(await instance.multiplyDecimalRound(toUnitString('10'), toUnitString('2')), toUnit('20'));
            assert.bnEqual(await instance.multiplyDecimalRound(toUnitString('10'), toUnitString('0.3')), toUnit('3'));
            assert.bnEqual(await instance.multiplyDecimalRound(toUnitString('46'), toUnitString('3')), toUnit('138'));
            assert.bnEqual(await instance.multiplyDecimalRound(toUnitString('11.111111111111111111'), toUnitString('0.5')), toUnit('5.555555555555555556'));
        });

        it('should correctly multiply and round by zero', async () => {
            assert.bnEqual(await instance.multiplyDecimalRound(toUnitString('46'), toBNString('0')), 0);
            assert.bnEqual(await instance.multiplyDecimalRound(toUnitString('1000000000'), toBNString('0')), 0);
            assert.bnEqual(await instance.multiplyDecimalRound(toBNString('1'), toBNString('0')), 0);
        });

        it('should correctly multiply and round by one', async () => {
            assert.bnEqual(await instance.multiplyDecimalRound(toUnitString('46'), toUnitString('1')), toUnit('46'));
            assert.bnEqual(
                await instance.multiplyDecimalRound(toUnitString('1000000000'), toUnitString('1')),
                toUnit('1000000000')
            );
        });

        it('should apply decimal and rounding multiplication commutatively', async () => {
            assert.bnEqual(
                await instance.multiplyDecimalRound(toUnitString('1.5'), toUnitString('7')),
                await instance.multiplyDecimalRound(toUnitString('7'), toUnitString('1.5'))
            );

            assert.bnEqual(
                await instance.multiplyDecimalRound(toUnitString('234098'), toUnitString('7')),
                await instance.multiplyDecimalRound(toUnitString('7'), toUnitString('234098'))
            );
        });

        it('should revert multiplication and rounding on overflow', async () => {
            await assert.revert(
                instance.multiplyDecimalRound(
                    toUnitString('10000000000000000000000000000'),
                    toUnitString('10000000000000000000000000000')
                )
            );
        });

        it('should round instead of truncating when multiplying with rounding', async () => {
            const oneAbove = toUnit('1').add(toBN('1'));
            const oneBelow = toUnit('1').sub(toBN('1'));

            assert.bnEqual(await instance.multiplyDecimalRound(oneAbove.toString(10), oneBelow.toString(10)), toUnit('1'));
        });

        // -----------------------
        // divideDecimalRound
        // -----------------------
        it('should divide decimals and round correctly', async () => {
            assert.bnEqual(await instance.divideDecimalRound(toUnitString('1'), toUnitString('4')), toUnit('0.25'));
            assert.bnEqual(await instance.divideDecimalRound(toUnitString('20'), toUnitString('4')), toUnit('5'));
            assert.bnEqual(await instance.divideDecimalRound(toUnitString('20'), toUnitString('0.25')), toUnit('80'));
            assert.bnEqual(await instance.divideDecimalRound(toUnitString('10'), toUnitString('6')), toUnit('1.666666666666666667'));
        });

        it('should revert on divide by zero when rounding', async () => {
            await assert.revert(instance.divideDecimalRound(toUnitString('1'), toUnitString('0')));
            await assert.revert(instance.divideDecimalRound(toUnitString('100'), toUnitString('0')));
            await assert.revert(instance.divideDecimalRound(toUnitString('0.25'), toUnitString('0')));
        });

        it('should correctly divide by one when rounding', async () => {
            assert.bnEqual(await instance.divideDecimalRound(toUnitString('1'), toUnitString('1')), toUnit('1'));
            assert.bnEqual(await instance.divideDecimalRound(toUnitString('100'), toUnitString('1')), toUnit('100'));
            assert.bnEqual(await instance.divideDecimalRound(toUnitString('0.25'), toUnitString('1')), toUnit('0.25'));
        });

        it('should round instead of truncating when dividing and rounding', async () => {
            assert.bnEqual(await instance.divideDecimalRound(toUnitString('2'), toUnitString('3')), toUnit('0.666666666666666667'));
        });
    });


});