const BN = require('bn.js');
const {toBN, toWei, fromWei} = require('web3-utils');
const UNIT = toWei(new BN('1'), 'ether');

/**
 *  Translates an amount to our canonical unit. We happen to use 10^18, which means we can
 *  use the built in web3 method for convenience, but if unit ever changes in our contracts
 *  we should be able to update the conversion factor here.
 *  @param amount The amount you want to re-base to UNIT
 */
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
const fromUnit = amount => fromWei(amount.toString(), 'ether');

const toBNString = amount => (new BN(amount)).toString(10);
const toUnitString = amount => toUnit(amount).toString(10);

const humanBN = d => {
    return parseFloat(fromUnit(d.toString())).toFixed(8);
}

const humanBNNumber = (d) => {
    return parseFloat(humanBN(d));
}



/**
 *  Translates an amount to our canonical precise unit. We happen to use 10^27, which means we can
 *  use the built in web3 method for convenience, but if precise unit ever changes in our contracts
 *  we should be able to update the conversion factor here.
 *  @param amount The amount you want to re-base to PRECISE_UNIT
 */
const PRECISE_UNIT_STRING = '1000000000000000000000000000';
const PRECISE_UNIT = toBN(PRECISE_UNIT_STRING);


/*
 * Multiplies x and y interpreting them as fixed point decimal numbers.
 */
const multiplyDecimal = (x, y, unit = UNIT) => {
    const xBN = BN.isBN(x) ? x : new BN(x);
    const yBN = BN.isBN(y) ? y : new BN(y);
    return xBN.mul(yBN).div(unit);
};


/*
 * Divides x and y interpreting them as fixed point decimal numbers.
 */
const divideDecimal = (x, y, unit = UNIT) => {
    const xBN = BN.isBN(x) ? x : new BN(x);
    const yBN = BN.isBN(y) ? y : new BN(y);
    return xBN.mul(unit).div(yBN);
};

/*
 * Multiplies x and y interpreting them as fixed point decimal numbers,
 * with rounding.
 */
const multiplyDecimalRound = (x, y) => {
    let result = x.mul(y).div(toUnit(0.1));
    if (result.mod(toBN(10)).gte(toBN(5))) {
        result = result.add(toBN(10));
    }
    return result.div(toBN(10));
};

/*
 * Divides x and y interpreting them as fixed point decimal numbers,
 * with rounding.
 */
const divideDecimalRound = (x, y) => {
    let result = x.mul(toUnit(10)).div(y);
    if (result.mod(toBN(10)).gte(toBN(5))) {
        result = result.add(toBN(10));
    }
    return result.div(toBN(10));
};

/*
 * Exponentiation by squares of x^n, interpreting them as fixed point decimal numbers.
 */
const powerToDecimal = (x, n, unit = UNIT) => {
    let xBN = BN.isBN(x) ? x : new BN(x);
    let temp = unit;
    while (n > 0) {
        if (n % 2 !== 0) {
            temp = temp.mul(xBN).div(unit);
        }
        xBN = xBN.mul(xBN).div(unit);
        n = parseInt(n / 2);
    }
    return temp;
};


const toPreciseUnit = amount => {
    // Code is largely lifted from the guts of web3 toWei here:
    // https://github.com/ethjs/ethjs-unit/blob/master/src/index.js
    const amountString = amount.toString();

    // Is it negative?
    var negative = amountString.substring(0, 1) === '-';
    if (negative) {
        amount = amount.substring(1);
    }

    if (amount === '.') {
        throw new Error(`Error converting number ${amount} to precise unit, invalid value`);
    }

    // Split it into a whole and fractional part
    // eslint-disable-next-line prefer-const
    let [whole, fraction, ...rest] = amount.split('.');
    if (rest.length > 0) {
        throw new Error(`Error converting number ${amount} to precise unit, too many decimal points`);
    }

    if (!whole) {
        whole = '0';
    }
    if (!fraction) {
        fraction = '0';
    }
    if (fraction.length > PRECISE_UNIT_STRING.length - 1) {
        throw new Error(`Error converting number ${amount} to precise unit, too many decimal places`);
    }

    while (fraction.length < PRECISE_UNIT_STRING.length - 1) {
        fraction += '0';
    }

    whole = new BN(whole);
    fraction = new BN(fraction);
    let result = whole.mul(PRECISE_UNIT).add(fraction);

    if (negative) {
        result = result.mul(new BN('-1'));
    }

    return result;
};

const fromPreciseUnit = amount => {
    // Code is largely lifted from the guts of web3 fromWei here:
    // https://github.com/ethjs/ethjs-unit/blob/master/src/index.js
    const negative = amount.lt(new BN('0'));

    if (negative) {
        amount = amount.mul(new BN('-1'));
    }

    let fraction = amount.mod(PRECISE_UNIT).toString();

    while (fraction.length < PRECISE_UNIT_STRING.length - 1) {
        fraction = `0${fraction}`;
    }

    // Chop zeros off the end if there are extras.
    fraction = fraction.replace(/0+$/, '');

    const whole = amount.div(PRECISE_UNIT).toString();
    let value = `${whole}${fraction === '' ? '' : `.${fraction}`}`;

    if (negative) {
        value = `-${value}`;
    }

    return value;
};


module.exports = {
    toPreciseUnit,
    fromPreciseUnit,
    multiplyDecimal,
    divideDecimal,
    multiplyDecimalRound,
    divideDecimalRound,
    powerToDecimal,
    toUnit,
    toUnitString,
    toBNString,
    fromUnit,
    toBN,
    humanBN,
    humanBNNumber
};

