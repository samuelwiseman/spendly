"use client";

import { useState } from "react";
import { CATEGORIES, CATEGORY_LABELS as LABELS, type Category } from "@/lib/entries";
import { formatGBP, formatGBPCompact } from "@/lib/money";

export function SpendBar({ totals }: { totals: Record<Category, number> }) {
  const [active, setActive] = useState<Category | null>(null);

  const total = CATEGORIES.reduce((sum, c) => sum + totals[c], 0);
  if (total === 0) {
    return <div className="bar-empty">No spending recorded this month</div>;
  }

  const pct = (value: number) => Math.round((value / total) * 100);

  return (
    <>
      <div className="bar">
        {CATEGORIES.filter((c) => totals[c] > 0).map((c) => (
          <button
            key={c}
            type="button"
            className="bar-seg"
            data-cat={c}
            style={{ flexGrow: totals[c] }}
            onMouseEnter={() => setActive(c)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(c)}
            onBlur={() => setActive(null)}
            aria-label={`${LABELS[c]}: ${formatGBP(totals[c])}, ${pct(totals[c])}%`}
          >
            {active === c && (
              <span className="tip mono">
                {LABELS[c]} · {formatGBP(totals[c])} · {pct(totals[c])}%
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="bar-axis">
        <span>£0</span>
        <span>{formatGBPCompact(Math.round(total / 2))}</span>
        <span>{formatGBPCompact(total)}</span>
      </div>

      <div className="legend">
        {CATEGORIES.map((c) => (
          <div className="legend-row" key={c}>
            <span className="legend-sw" style={{ background: `var(--cat-${c})` }} />
            <span className="legend-name">{LABELS[c]}</span>
            <span className="fig">{formatGBP(totals[c])}</span>
            <span className="legend-pct mono">{pct(totals[c])}%</span>
          </div>
        ))}
      </div>
    </>
  );
}
