export function advanceWorldEconomy(simulations, treasury, loanManager) {
  let income = 0;
  let expenses = 0;
  for (const simulation of simulations) {
    const cityIncome = simulation.tick(true, treasury);
    const cityExpenses = simulation.stats.serviceExpenses + simulation.stats.roadExpenses +
      (simulation.stats.utilityExpenses || 0) + (simulation.surveyExpenses || 0);
    income += cityIncome;
    expenses += cityExpenses;
    treasury += cityIncome - cityExpenses;
  }
  const loanTick = loanManager.processTick(treasury);
  return { treasury: loanTick.treasury, income, expenses, loanPayments: loanTick.payments, missedPayments: loanTick.missedPayments };
}