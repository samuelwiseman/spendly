import Link from "next/link";
import { EntryDialog } from "@/components/EntryDialog";
import { EntryRow } from "@/components/EntryRow";
import { MonthNav } from "@/components/MonthNav";
import { getDb } from "@/lib/db";
import { getEntriesByMonth } from "@/lib/entries";
import { resolveMonth } from "@/lib/months";
import { requireUserId } from "@/lib/session";

export default async function EntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const userId = await requireUserId();
  const month = resolveMonth((await searchParams).month);

  const entries = getEntriesByMonth(getDb(), userId, month);

  return (
    <main className="col" style={{ paddingTop: 32, paddingBottom: 64 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
        <Link href={`/?month=${month}`} className="mono">← Overview</Link>
        <MonthNav month={month} basePath="/entries" />
      </header>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <p className="label">{entries.length} {entries.length === 1 ? "entry" : "entries"}</p>
        <EntryDialog entry={null} month={month} />
      </div>

      {entries.length === 0 ? (
        <p style={{ color: "var(--faint)", padding: "36px 0" }}>Nothing recorded this month.</p>
      ) : (
        <ul style={{ listStyle: "none" }}>
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} month={month} />
          ))}
        </ul>
      )}
    </main>
  );
}
