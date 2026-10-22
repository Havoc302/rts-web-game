import { LOAN_CONFIG } from '../config.js';

function currency(value) {
  return Math.round(value * 100) / 100;
}

// Base rate from city happiness plus a risk premium for every loan already outstanding.
export function loanInterestRateForHappiness(happiness, existingLoans = 0) {
  const score = Math.max(LOAN_CONFIG.HAPPINESS_MIN, Math.min(LOAN_CONFIG.HAPPINESS_MAX, Number(happiness) || 0));
  const range = LOAN_CONFIG.MAX_INTEREST_RATE - LOAN_CONFIG.MIN_INTEREST_RATE;
  const base = LOAN_CONFIG.MAX_INTEREST_RATE - range * score /
    (LOAN_CONFIG.HAPPINESS_MAX - LOAN_CONFIG.HAPPINESS_MIN);
  const loans = Math.max(0, Math.floor(Number(existingLoans) || 0));
  const premium = LOAN_CONFIG.RISK_PREMIUM_PER_LOAN * loans;
  return Number(Math.min(LOAN_CONFIG.MAX_TOTAL_INTEREST_RATE, base + premium).toFixed(10));
}

export function loanTerms(principal, happiness, existingLoans = 0) {
  const interestRate = loanInterestRateForHappiness(happiness, existingLoans);
  const perTickRate = Math.pow(1 + interestRate, 1 / LOAN_CONFIG.TERM_TICKS) - 1;
  const scheduledPayment = currency(
    principal * perTickRate / (1 - Math.pow(1 + perTickRate, -LOAN_CONFIG.TERM_TICKS)),
  );
  return { interestRate, perTickRate, scheduledPayment };
}

export class LoanManager {
  constructor(snapshot = {}) {
    this.nextLoanId = Number.isInteger(snapshot.nextLoanId) && snapshot.nextLoanId > 0 ? snapshot.nextLoanId : 1;
    this.loans = Array.isArray(snapshot.loans) ? snapshot.loans.map((loan) => ({ ...loan })) : [];
  }

  get outstandingBalance() {
    return currency(this.loans.reduce((total, loan) => total + loan.balance, 0));
  }

  get scheduledPayment() {
    return currency(this.loans.reduce((total, loan) => total + (
      loan.ticksRemaining > 0 ? loan.scheduledPayment : loan.balance
    ), 0));
  }

  takeLoan(principal, averageHappiness) {
    if (!LOAN_CONFIG.PRINCIPAL_OPTIONS.includes(principal)) return null;
    // The rate is fixed at origination and reflects the loans already outstanding.
    const terms = loanTerms(principal, averageHappiness, this.loans.length);
    const loan = {
      id: this.nextLoanId++,
      principal,
      balance: principal,
      interestRate: terms.interestRate,
      perTickRate: terms.perTickRate,
      scheduledPayment: terms.scheduledPayment,
      ticksRemaining: LOAN_CONFIG.TERM_TICKS,
      missedPayments: 0,
    };
    this.loans.push(loan);
    return loan;
  }

  processTick(treasury) {
    let payments = 0;
    let missedPayments = 0;
    const remainingLoans = [];

    for (const loan of this.loans) {
      loan.balance = currency(loan.balance + currency(loan.balance * loan.perTickRate));
      const paymentDue = loan.ticksRemaining > 1 ? loan.scheduledPayment : loan.balance;

      if (treasury >= paymentDue) {
        treasury = currency(treasury - paymentDue);
        payments = currency(payments + paymentDue);
        loan.balance = currency(Math.max(0, loan.balance - paymentDue));
        if (loan.ticksRemaining > 0) loan.ticksRemaining--;
        if (loan.balance > 0) remainingLoans.push(loan);
      } else {
        loan.missedPayments++;
        if (loan.ticksRemaining > 0) loan.ticksRemaining--;
        missedPayments++;
        remainingLoans.push(loan);
      }
    }

    this.loans = remainingLoans;
    return { treasury, payments, missedPayments };
  }

  snapshot() {
    return { nextLoanId: this.nextLoanId, loans: this.loans.map((loan) => ({ ...loan })) };
  }
}

export function shouldEndGame(outstandingBalance, combinedPopulation, hasEverHadPopulation) {
  return hasEverHadPopulation && outstandingBalance > 0 && combinedPopulation <= 0;
}

// A negative shared treasury means the world cannot pay its next bills. The app pauses on
// this and forces a choice: borrow to get back above zero, or declare bankruptcy.
export function isInsolvent(treasury) {
  return Number.isFinite(treasury) && treasury < 0;
}