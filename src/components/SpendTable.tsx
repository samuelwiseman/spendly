import type { CategoryTotal } from "@/lib/entries";
import { formatGBP } from "@/lib/money";

export function SpendTable({ totals }: { totals: CategoryTotal[] }) {
  const total = totals.reduce((sum, t) => sum + t.total, 0);

  return (
    <details className="table-toggle">
      <summary>View as table</summary>
      <table className="data-table">
        <caption className="sr-only">Spending by category</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col" className="num">Amount</th>
            <th scope="col" className="num">Share</th>
          </tr>
        </thead>
        <tbody>
          {totals.map((t) => (
            <tr key={t.id}>
              <th scope="row">{t.name}</th>
              <td className="num">{formatGBP(t.total)}</td>
              <td className="num">{total === 0 ? "—" : `${Math.round((t.total / total) * 100)}%`}</td>
            </tr>
          ))}
          {totals.length === 0 && (
            <tr>
              <td colSpan={3} style={{ color: "var(--faint)" }}>No spending recorded</td>
            </tr>
          )}
        </tbody>
      </table>
    </details>
  );
}
