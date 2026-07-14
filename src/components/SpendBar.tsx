"use client";

import { useState } from "react";
import type { CategoryTotal } from "@/lib/entries";
import { formatGBP, formatGBPCompact } from "@/lib/money";

export function SpendBar({ totals }: { totals: CategoryTotal[] }) {
  const [active, setActive] = useState<number | null>(null);

  const total = totals.reduce((sum, t) => sum + t.total, 0);
  if (total === 0) {
    return <div className="bar-empty">No spending recorded this month</div>;
  }

  const pct = (value: number) => Math.round((value / total) * 100);

  return (
    <>
      <div className="bar">
        {totals.map((t) => (
          <button
            key={t.id}
            type="button"
            className="bar-seg"
            style={{ flexGrow: t.total, background: t.color }}
            onMouseEnter={() => setActive(t.id)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(t.id)}
            onBlur={() => setActive(null)}
            aria-label={`${t.name}: ${formatGBP(t.total)}, ${pct(t.total)}%`}
          >
            {active === t.id && (
              <span className="tip mono">
                {t.name} · {formatGBP(t.total)} · {pct(t.total)}%
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
        {totals.map((t) => (
          <div className="legend-row" key={t.id}>
            <span className="legend-sw" style={{ background: t.color }} />
            <span className="legend-name">{t.name}</span>
            <span className="fig">{formatGBP(t.total)}</span>
            <span className="legend-pct mono">{pct(t.total)}%</span>
          </div>
        ))}
      </div>
    </>
  );
}
