import Link from "next/link";
import { MonthNav } from "@/components/MonthNav";
import { SpendBar } from "@/components/SpendBar";
import { SpendTable } from "@/components/SpendTable";
import { BRAND } from "@/lib/brand";
import { getDb } from "@/lib/db";
import { CATEGORIES, categoryTotals } from "@/lib/entries";
import { formatGBP } from "@/lib/money";
import { resolveMonth } from "@/lib/months";
import { requireUserId } from "@/lib/session";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const userId = await requireUserId();
  const month = resolveMonth((await searchParams).month);

  const totals = categoryTotals(getDb(), userId, month);
  const total = CATEGORIES.reduce((sum, c) => sum + totals[c], 0);
  const discretionary = totals.want + totals.luxury;

  return (
    <main className="col" style={{ paddingTop: 32, paddingBottom: 64 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 36 }}>
        <strong className="mono">{BRAND.name}</strong>
        <MonthNav month={month} />
      </header>

      <p className="label">Total out</p>
      <p className="hero">{formatGBP(total)}</p>
      <p className="mono" style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
        {total === 0 ? "—" : `${Math.round((discretionary / total) * 100)}% discretionary`}
      </p>

      <section style={{ marginTop: 32 }}>
        <SpendBar totals={totals} />
        <SpendTable totals={totals} />
      </section>

      <p style={{ marginTop: 40, display: "flex", gap: 12 }}>
        <Link href={`/entries?month=${month}`} className="btn">View entries</Link>
        <Link href="/account" className="btn">Account</Link>
      </p>
    </main>
  );
}
