const {assert} = require('chai');
const BN = require('bn.js');
const {toWei} = require('web3-utils');


/**
 *  Convenience method to assert that the value of left operand is greater than then value of the right operand
 *  @param aBN The left operand BN.js instance
 *  @param bBN The right operand BN.js instance
 */
const assertBNGreaterThan = (aBN, bBN) => {
    assert.ok(aBN.gt(bBN), `${aBN.toString()} is not greater than ${bBN.toString()}`);
};

/**
 *  Convenience method to assert that the value of left operand is greater than or equal then value of the right operand
 *  @param aBN The left operand BN.js instance
 *  @param bBN The right operand BN.js instance
 */
const assertBNGreaterEqualThan = (aBN, bBN) => {
    assert.ok(aBN.gte(bBN), `${aBN.toString()} is not greater than or equal to ${bBN.toString()}`);
};

/**
 *  Convenience method to assert that the value of left operand is less than then value of the right operand
 *  @param aBN The left operand BN.js instance
 *  @param bBN The right operand BN.js instance
 */
const assertBNLessThan = (aBN, bBN) => {
    assert.ok(aBN.lt(bBN), `${aBN.toString()} is not less than ${bBN.toString()}`);
};

/**
 *  Convenience method to assert that the value of left operand is less than then value of the right operand
 *  @param aBN The left operand BN.js instance
 *  @param bBN The right operand BN.js instance
 */
const assertBNLessEqualThan = (aBN, bBN) => {
    assert.ok(aBN.lte(bBN), `${aBN.toString()} is not less than or equal to ${bBN.toString()}`);
};

/**
 *  Convenience method to assert that two objects or arrays which contain nested BN.js instances are equal.
 *  @param actual What you received
 *  @param expected The shape you expected
 */
const assertDeepEqual = (actual, expected, context) => {
    // Check if it's a value type we can assert on straight away.
    if (BN.isBN(actual) || BN.isBN(expected)) {
        assertBNEqual(actual, expected, context);
    } else if (
        typeof expected === 'string' ||
        typeof actual === 'string' ||
        typeof expected === 'number' ||
        typeof actual === 'number' ||
        typeof expected === 'boolean' ||
        typeof actual === 'boolean'
    ) {
        assert.strictEqual(actual, expected, context);
    }
    // Otherwise dig through the deeper object and recurse
    else if (Array.isArray(expected)) {
        for (let i = 0; i < expected.length; i++) {
            assertDeepEqual(actual[i], expected[i], `(array index: ${i}) `);
        }
    } else {
        for (const key of Object.keys(expected)) {
            assertDeepEqual(actual[key], expected[key], `(key: ${key}) `);
        }
    }
};

/**
 *  Convenience method to assert that an amount of ether (or other 10^18 number) was received from a contract.
 *  @param actualWei The value retrieved from a smart contract or wallet in wei
 *  @param expectedAmount The amount you expect e.g. '1'
 *  @param expectedUnit The unit you expect e.g. 'gwei'. Defaults to 'ether'
 */
const assertUnitEqual = (actualWei, expectedAmount, expectedUnit = 'ether') => {
    assertBNEqual(actualWei, toWei(expectedAmount, expectedUnit));
};

/**
 *  Convenience method to assert that an amount of ether (or other 10^18 number) was NOT received from a contract.
 *  @param actualWei The value retrieved from a smart contract or wallet in wei
 *  @param expectedAmount The amount you expect NOT to be equal to e.g. '1'
 *  @param expectedUnit The unit you expect e.g. 'gwei'. Defaults to 'ether'
 */
const assertUnitNotEqual = (actualWei, expectedAmount, expectedUnit = 'ether') => {
    assertBNNotEqual(actualWei, toWei(expectedAmount, expectedUnit));
};

/**
 * Convenience method to assert that the return of the given block when invoked or promise causes a
 * revert to occur, with an optional revert message.
 * @param blockOrPromise The JS block (i.e. function that when invoked returns a promise) or a promise itself
 * @param reason Optional reason string to search for in revert message
 */
const assertRevert = async (blockOrPromise, reason) => {
    let errorCaught = false;
    try {
        const result = typeof blockOrPromise === 'function' ? blockOrPromise() : blockOrPromise;
        await result;
    } catch (error) {
        assert.include(error.message, 'revert');
        if (reason) {
            assert.include(error.message, reason);
        }
        errorCaught = true;
    }

    assert.strictEqual(errorCaught, true, 'Operation did not revert as expected');
};

const assertInvalidOpcode = async blockOrPromise => {
    let errorCaught = false;
    try {
        const result = typeof blockOrPromise === 'function' ? blockOrPromise() : blockOrPromise;
        await result;
    } catch (error) {
        assert.include(error.message, 'invalid opcode');
        errorCaught = true;
    }

    assert.strictEqual(
        errorCaught,
        true,
        'Operation did not cause an invalid opcode error as expected'
    );
};


module.exports = Object.assign({}, assert, {
    /**
     *  Convenience method to assert that an event matches a shape
     *  @param actualEventOrTransaction The transaction receipt, or event as returned in the event logs from web3
     *  @param expectedEvent The event name you expect
     *  @param expectedArgs The args you expect in object notation, e.g. { newOracle: '0x...', updatedAt: '...' }
     */
    eventEqual: (actualEventOrTransaction, expectedEvent, expectedArgs) => {
        // If they pass in a whole transaction we need to extract the first log, otherwise we already have what we need
        const event = Array.isArray(actualEventOrTransaction.logs)
            ? actualEventOrTransaction.logs[0]
            : actualEventOrTransaction;

        if (!event) {
            assert.fail(new Error('No event was generated from this transaction'));
        }

        // Assert the names are the same.
        assert.strictEqual(event.event, expectedEvent);

        assertDeepEqual(event.args, expectedArgs);
        // Note: this means that if you don't assert args they'll pass regardless.
        // Ensure you pass in all the args you need to assert on.
    },
    eventsEqual: (transaction, ...expectedEventsAndArgs) => {
        if (expectedEventsAndArgs.length % 2 > 0)
            throw new Error('Please call assert.eventsEqual with names and args as pairs.');
        if (expectedEventsAndArgs.length <= 2)
            throw new Error(
                "Expected events and args can be called with just assert.eventEqual as there's only one event."
            );

        for (let i = 0; i < expectedEventsAndArgs.length; i += 2) {
            const log = transaction.logs[Math.floor(i / 2)];

            assert.strictEqual(log.event, expectedEventsAndArgs[i], 'Event name mismatch');
            assertDeepEqual(log.args, expectedEventsAndArgs[i + 1], 'Event args mismatch');
        }
    },
    /**
     *  Convenience method to assert that two BN.js instances are equal.
     *  @param actualBN The BN.js instance you received
     *  @param expectedBN The BN.js amount you expected to receive
     *  @param context The description to log if we fail the assertion
     */
    bnEqual: (actualBN, expectedBN, context) => {
        assert.strictEqual(actualBN.toString(), expectedBN.toString(), context);
    },
    /**
     *  Convenience method to assert that two BN.js instances are NOT equal.
     *  @param actualBN The BN.js instance you received
     *  @param expectedBN The BN.js amount you expected NOT to receive
     *  @param context The description to log if we fail the assertion
     */
    bnNotEqual: (actualBN, expectedBN) => {
        assert.notStrictEqual(actualBN.toString(), expectedBN.toString(), context);
    },
    /**
     *  Convenience method to assert that two BN.js instances are within 100 units of each other.
     *  @param actualBN The BN.js instance you received
     *  @param expectedBN The BN.js amount you expected to receive, allowing a varience of +/- 100 units
     */
    bnClose: (actualBN, expectedBN, varianceParam = '10') => {
        const actual = BN.isBN(actualBN) ? actualBN : new BN(actualBN);
        const expected = BN.isBN(expectedBN) ? expectedBN : new BN(expectedBN);
        const variance = BN.isBN(varianceParam) ? varianceParam : new BN(varianceParam);
        const actualDelta = expected.sub(actual).abs();

        assert.ok(
            actual.gte(expected.sub(variance)),
            `Number is too small to be close (Delta between actual and expected is ${actualDelta.toString()}, but variance was only ${variance.toString()}`
        );
        assert.ok(
            actual.lte(expected.add(variance)),
            `Number is too large to be close (Delta between actual and expected is ${actualDelta.toString()}, but variance was only ${variance.toString()})`
        );
    },
    bnGte: assertBNGreaterEqualThan,
    bnLte: assertBNLessEqualThan,
    bnLt: assertBNLessThan,
    bnGt: assertBNGreaterThan,
    deepEqual: assertDeepEqual,
    etherEqual: assertUnitEqual,
    etherNotEqual: assertUnitNotEqual,
    invalidOpcode: assertInvalidOpcode,
    unitEqual: assertUnitEqual,
    unitNotEqual: assertUnitNotEqual,
    revert: assertRevert,
});