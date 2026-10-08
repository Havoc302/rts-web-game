import assert from 'assert';
import { LOAN_CONFIG } from '../src/config.js';
import { LoanManager, loanInterestRateForHappiness, loanTerms, shouldEndGame } from '../src/engine/LoanManager.js';
import { advanceWorldEconomy } from '../src/engine/WorldFinance.js';

assert.deepStrictEqual(LOAN_CONFIG.PRINCIPAL_OPTIONS, [1000, 2500, 5000, 7500, 10000, 15000, 20000]);
assert.strictEqual(LOAN_CONFIG.TERM_TICKS, 720);
assert.strictEqual(loanInterestRateForHappiness(100), 0.02, 'Maximum happiness should receive the minimum rate');
assert.strictEqual(loanInterestRateForHappiness(0), 0.20, 'Zero happiness should receive the maximum rate');
assert.strictEqual(loanInterestRateForHappiness(50), 0.11, 'Interest should scale linearly with happiness');
assert.ok(loanTerms(1000, 100).scheduledPayment < loanTerms(1000, 0).scheduledPayment);
assert.strictEqual(shouldEndGame(1, 0, true), true, 'Debt and zero combined population after settlement should end the game');
assert.strictEqual(shouldEndGame(1, 10, true), false, 'Any remaining population prevents game over');
assert.strictEqual(shouldEndGame(0, 0, true), false, 'A debt-free city cannot trigger debt game over');
assert.strictEqual(shouldEndGame(1, 0, false), false, 'A new city with no residents yet is not a settled population loss');

{
  const tickTreasuries = [];
  const simulations = [
    { stats: { serviceExpenses: 0, roadExpenses: 0, utilityExpenses: 0 }, tick: (_advance, treasury) => { tickTreasuries.push(treasury); return 100; } },
    { stats: { serviceExpenses: 25, roadExpenses: 0, utilityExpenses: 0 }, tick: (_advance, treasury) => { tickTreasuries.push(treasury); return 0; } },
  ];
  const loanManager = { processTick: (treasury) => ({ treasury: treasury - 10, payments: 10, missedPayments: 0 }) };
  const result = advanceWorldEconomy(simulations, 0, loanManager);
  assert.deepStrictEqual(tickTreasuries, [0, 100], 'The second city should transact against the first city\'s shared proceeds');
  assert.strictEqual(result.treasury, 65, 'Profitable and unprofitable city flows should net in one treasury before debt service');
  assert.strictEqual(result.income, 100);
  assert.strictEqual(result.expenses, 25);
  assert.strictEqual(result.loanPayments, 10, 'The shared loan should be charged once per world tick');
}

{
  const manager = new LoanManager();
  assert.strictEqual(manager.takeLoan(1250, 75), null, 'Only offered principal amounts may be borrowed');
  const loan = manager.takeLoan(1000, 100);
  assert.strictEqual(loan.balance, 1000);
  assert.strictEqual(loan.ticksRemaining, 720);
  const payment = manager.processTick(100);
  assert.ok(payment.payments > 0, 'A funded tick should make the scheduled payment');
  assert.ok(manager.outstandingBalance < 1000, 'The balance should decline when installments are paid');
  assert.strictEqual(manager.loans[0].ticksRemaining, 719);
}

{
  const manager = new LoanManager();
  const loan = manager.takeLoan(1000, 0);
  const first = manager.processTick(0);
  assert.strictEqual(first.missedPayments, 1);
  assert.ok(loan.balance > loan.principal, 'Missed payments should capitalize interest on principal');
  const afterFirstMiss = loan.balance;
  manager.processTick(0);
  assert.ok(loan.balance > afterFirstMiss, 'New interest should compound on the increased balance');
  assert.strictEqual(loan.missedPayments, 2);

  const restored = new LoanManager(manager.snapshot());
  assert.deepStrictEqual(restored.snapshot(), manager.snapshot(), 'Loan schedule and balance should survive snapshot restore');
}

{
  const manager = new LoanManager();
  manager.takeLoan(1000, 100);
  let treasury = 10000;
  for (let tick = 0; tick < LOAN_CONFIG.TERM_TICKS; tick++) {
    treasury = manager.processTick(treasury).treasury;
  }
  assert.strictEqual(manager.outstandingBalance, 0, 'A fully funded loan should be repaid at the end of its term');
  assert.strictEqual(manager.loans.length, 0);
}

console.log('Loan manager tests passed.');