import { CATEGORIES, CATEGORY_LABELS as LABELS, type Category } from "@/lib/entries";
import { formatGBP } from "@/lib/money";

export function SpendTable({ totals }: { totals: Record<Category, number> }) {
  const total = CATEGORIES.reduce((sum, c) => sum + totals[c], 0);

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
          {CATEGORIES.map((c) => (
            <tr key={c}>
              <th scope="row">{LABELS[c]}</th>
              <td className="num">{formatGBP(totals[c])}</td>
              <td className="num">{total === 0 ? "—" : `${Math.round((totals[c] / total) * 100)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
