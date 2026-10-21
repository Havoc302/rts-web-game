import assert from 'assert';
import { LOAN_CONFIG, STARTING_TREASURY } from '../../src/config.js';
import { advanceWorldEconomy } from '../../src/engine/WorldFinance.js';
import { LoanManager, isInsolvent, loanTerms, shouldEndGame } from '../../src/engine/LoanManager.js';

console.log('=== insolvency.case.js ===');

// --- The trigger is a treasury strictly below zero ---------------------------------------
assert.strictEqual(isInsolvent(STARTING_TREASURY), false, 'A funded treasury is solvent');
assert.strictEqual(isInsolvent(0), false, 'An empty treasury is not yet in debt');
assert.strictEqual(isInsolvent(-0.01), true, 'Owing even a cent triggers the forced choice');
assert.strictEqual(isInsolvent(-5000), true);
assert.strictEqual(isInsolvent(NaN), false, 'A missing treasury value must not lock the game');
assert.strictEqual(isInsolvent(Infinity), false);

// --- A tick whose bills exceed the treasury leaves the world insolvent -------------------
{
  const simulation = {
    stats: { serviceExpenses: 25, roadExpenses: 10, utilityExpenses: 5 },
    tick: () => 10,
  };
  const loanManager = new LoanManager();
  const economy = advanceWorldEconomy([simulation], 20, loanManager);
  assert.strictEqual(economy.income, 10, 'Income should come from the city tick');
  assert.strictEqual(economy.expenses, 40, 'Expenses should total service, road, and utility costs');
  assert.strictEqual(economy.treasury, -10, 'A shortfall should push the treasury below zero');
  assert.strictEqual(isInsolvent(economy.treasury), true, 'The shortfall must be reported as insolvency');

  // The smallest loan option is enough for a shallow deficit.
  const loan = loanManager.takeLoan(LOAN_CONFIG.PRINCIPAL_OPTIONS[0], 50);
  assert.ok(loan, 'An emergency loan should be issued');
  assert.strictEqual(isInsolvent(economy.treasury + loan.principal), false,
    'The minimum loan should pull a shallow deficit back above zero');
  assert.ok(loanManager.scheduledPayment > 0, 'Borrowing creates a recurring obligation');
}

// --- A deeper deficit can require more than one loan --------------------------------------
{
  const largest = LOAN_CONFIG.PRINCIPAL_OPTIONS[LOAN_CONFIG.PRINCIPAL_OPTIONS.length - 1];
  const loanManager = new LoanManager();
  let treasury = -largest - 500;
  assert.strictEqual(isInsolvent(treasury), true);
  treasury += loanManager.takeLoan(largest, 50).principal;
  assert.strictEqual(isInsolvent(treasury), true, 'One maximum loan cannot cover a deeper deficit');
  treasury += loanManager.takeLoan(largest, 50).principal;
  assert.strictEqual(isInsolvent(treasury), false, 'Borrowing twice should clear the deeper deficit');
}

// --- Emergency borrowing follows the same terms as the finance panel ----------------------
{
  const loanManager = new LoanManager();
  const loan = loanManager.takeLoan(5000, 40);
  const terms = loanTerms(5000, 40);
  assert.strictEqual(loan.interestRate, terms.interestRate);
  assert.strictEqual(loan.scheduledPayment, terms.scheduledPayment);
  assert.strictEqual(loan.ticksRemaining, LOAN_CONFIG.TERM_TICKS);

  let treasury = 20000;
  for (let tick = 0; tick < LOAN_CONFIG.TERM_TICKS; tick++) {
    treasury = loanManager.processTick(treasury).treasury;
  }
  assert.strictEqual(loanManager.outstandingBalance, 0, 'A loan should amortize to zero over its term');
  assert.ok(treasury > 0, 'Payments should come out of the treasury');
}

// --- Bankruptcy is terminal and separate from the population-loss ending ------------------
{
  assert.strictEqual(shouldEndGame(0, 0, true), false, 'A debt-free city cannot end on debt');
  assert.strictEqual(shouldEndGame(500, 0, true), true, 'Debt plus an emptied world is still game over');
  assert.strictEqual(shouldEndGame(500, 5, true), false, 'A live population never ends the game on debt alone');
}

console.log('Insolvency tests passed.');
