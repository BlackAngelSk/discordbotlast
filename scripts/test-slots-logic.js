const assert = require('assert');

const FREE_SPIN_TRIGGER_COUNT = 3;
const BASE_FREE_SPINS = 3;
const MAX_TOTAL_SPINS = 25;

function calculateFreeSpins(specialCount) {
    if (specialCount < FREE_SPIN_TRIGGER_COUNT) return 0;
    const extra = Math.floor((specialCount - FREE_SPIN_TRIGGER_COUNT) / 2);
    return BASE_FREE_SPINS + Math.min(extra, 2);
}

function applyAward(spinsRemaining, spinsPlayed, awardedSpins) {
    const beforeAward = spinsRemaining;
    if (awardedSpins > 0 && spinsPlayed < MAX_TOTAL_SPINS) {
        spinsRemaining = Math.min(spinsRemaining + awardedSpins, MAX_TOTAL_SPINS - spinsPlayed);
        const actualAwardedSpins = Math.max(0, spinsRemaining - beforeAward);
        return { spinsRemaining, actualAwardedSpins };
    }

    return { spinsRemaining, actualAwardedSpins: 0 };
}

function runTests() {
    assert.strictEqual(calculateFreeSpins(0), 0, 'No special symbols should award no free spins');
    assert.strictEqual(calculateFreeSpins(2), 0, 'Below trigger count should award 0');
    assert.strictEqual(calculateFreeSpins(3), 3, 'Trigger count should award base free spins');
    assert.strictEqual(calculateFreeSpins(4), 3, 'One extra should still award base spins');
    assert.strictEqual(calculateFreeSpins(5), 4, 'Two extras should award +1');
    assert.strictEqual(calculateFreeSpins(7), 5, 'Cap at +2 extra free spins');
    assert.strictEqual(calculateFreeSpins(25), 5, 'Large symbol counts should respect cap');

    const nearCap = applyAward(0, 24, 5);
    assert.strictEqual(nearCap.actualAwardedSpins, 1, 'Award should be capped by MAX_TOTAL_SPINS');
    assert.strictEqual(nearCap.spinsRemaining, 1, 'Remaining spins should be exactly capped amount');

    const atCap = applyAward(0, 25, 5);
    assert.strictEqual(atCap.actualAwardedSpins, 0, 'No spins should be awarded at max cap');

    console.log('✅ Slots logic tests passed');
}

runTests();
