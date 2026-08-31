import { ArrowRight, Banknote, ChartNoAxesCombined, Plus, ReceiptText, WalletCards } from "lucide-react";
import Decimal from "decimal.js";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { businessDate } from "@/lib/business-time";
import { listExpenses } from "@/server/repositories/journal-store";
import { getOperationsRepository } from "@/server/repositories/repository-provider";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const categoryNames: Record<string, string> = {
  maintenance: "Maintenance",
  electricity: "Electricity",
  salary: "Salary",
  cleaning: "Cleaning",
  bank_charges: "Bank charges",
  other: "Other"
};

export default async function FinancePage() {
  const [expenses, shifts] = await Promise.all([
    listExpenses(),
    getOperationsRepository().listShifts()
  ]);
  const date = businessDate();
  const todayExpenses = expenses.filter((expense) => expense.date === date);
  const closed = shifts.filter((shift) => shift.businessDate === date && shift.reconciliation);
  const latest = closed[0]?.reconciliation;
  const expectedSales = Decimal.sum(0, ...closed.map((shift) => shift.reconciliation?.sales.expectedSales ?? "0"));
  const accountedTender = Decimal.sum(0, ...closed.map((shift) => shift.reconciliation?.sales.accountedTender ?? "0"));
  const expenseTotal = Decimal.sum(0, ...todayExpenses.map((expense) => expense.amount));
  const grossMargin = Decimal.sum(0, ...closed.map((shift) => shift.reconciliation?.grossMargin ?? "0"));
  const operatingProfit = grossMargin.minus(expenseTotal);
  const tenderBalanced = expectedSales.equals(accountedTender);

  return (
    <main className="page">
      <PageHeader eyebrow="Collections and cost" title="Money & margin" description="Sales, tenders, expenses and management profit without accounting clutter." action={{ label: "Record expense", href: "/finance/expenses/new", icon: <Plus size={16} /> }} />
      <section className="summary-strip reveal reveal-2"><div className="summary-cell"><span>Expected sales</span><strong>{money.format(expectedSales.toNumber())}</strong></div><div className="summary-cell"><span>Accounted tender</span><strong>{money.format(accountedTender.toNumber())}</strong></div><div className="summary-cell"><span>Expenses</span><strong>{money.format(expenseTotal.toNumber())}</strong></div><div className="summary-cell"><span>Est. operating profit</span><strong>{money.format(operatingProfit.toNumber())}</strong></div></section>
      <div className="three-column reveal reveal-3">
        <article className="panel feature-card"><span className="feature-icon"><WalletCards size={20} /></span><span><h2>Payment position</h2><p>{closed.length ? `${money.format(accountedTender.toNumber())} recorded against ${money.format(expectedSales.toNumber())} expected.` : "Close a shift to calculate the tender position."}</p></span><span className={`status-pill ${closed.length && tenderBalanced ? "healthy" : "closed"}`}>{closed.length ? tenderBalanced ? "Balanced" : "Variance" : "Awaiting close"}</span></article>
        <article className="panel feature-card"><span className="feature-icon"><Banknote size={20} /></span><span><h2>Cash handover</h2><p>{latest ? `${money.format(Number(latest.sales.expectedCashHandover))} expected after cash-paid expenses.` : "No closed shift is available for a cash check."}</p></span><span className={`status-pill ${latest?.sales.cashVariance === "0.00" ? "healthy" : "closed"}`}>{latest ? latest.sales.cashVariance === "0.00" ? "Matches" : "Variance" : "Awaiting close"}</span></article>
        <Link className="panel feature-card" href="/reports"><span className="feature-icon"><ChartNoAxesCombined size={20} /></span><span><h2>Margin report</h2><p>Weighted cost and recorded expenses produce a live management estimate.</p></span><span className="feature-link">Open report <ArrowRight size={14} /></span></Link>
      </div>
      <section className="panel panel-pad reveal reveal-4" style={{ marginTop: 16 }}><div className="panel-header"><div><p className="panel-kicker">Today</p><h2 className="panel-title">Expenses</h2></div><Link className="button soft" href="/finance/expenses/new"><ReceiptText size={14} /> Add expense</Link></div>{todayExpenses.length ? <table className="data-table"><thead><tr><th>Category</th><th>Note</th><th>Paid through</th><th>Amount</th></tr></thead><tbody>{todayExpenses.map((expense) => <tr key={expense.id}><td><span className="table-title">{categoryNames[expense.category]}</span></td><td>{expense.note}</td><td>{expense.paymentMethod.toUpperCase()}</td><td className="mono">{money.format(Number(expense.amount))}</td></tr>)}</tbody></table> : <p className="empty-state">No expenses recorded for this business day.</p>}</section>
    </main>
  );
}
