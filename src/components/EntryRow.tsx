import { deleteEntryAction } from "@/lib/actions";
import { EntryDialog } from "@/components/EntryDialog";
import type { Entry } from "@/lib/entries";
import { formatGBP } from "@/lib/money";

export function EntryRow({ entry, month }: { entry: Entry; month: string }) {
  const day = new Date(`${entry.date}T00:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC", day: "2-digit", month: "short",
  });

  return (
    <li className="entry">
      <span className="entry-dot" style={{ background: `var(--cat-${entry.category})` }} />
      <span className="entry-name">
        {entry.name}
        {entry.recurring === 1 && <span className="label" style={{ marginLeft: 8 }}>recurring</span>}
      </span>
      <span className="entry-date">{day}</span>
      <span className="entry-amt">{formatGBP(entry.amount_pence)}</span>

      <EntryDialog entry={entry} month={month} />

      <form action={deleteEntryAction}>
        <input type="hidden" name="id" value={entry.id} />
        <button type="submit" className="btn btn-danger" aria-label={`Delete ${entry.name}`}>
          <span aria-hidden="true">✕</span> Delete
        </button>
      </form>
    </li>
  );
}
