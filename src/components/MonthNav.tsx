import Link from "next/link";
import { addMonths, formatMonthLong } from "@/lib/months";

export function MonthNav({ month, basePath = "/" }: { month: string; basePath?: string }) {
  return (
    <nav style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <Link href={`${basePath}?month=${addMonths(month, -1)}`} aria-label="Previous month">←</Link>
      <span className="mono" style={{ minWidth: 120, textAlign: "center" }}>{formatMonthLong(month)}</span>
      <Link href={`${basePath}?month=${addMonths(month, 1)}`} aria-label="Next month">→</Link>
    </nav>
  );
}
