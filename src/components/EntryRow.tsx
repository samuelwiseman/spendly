import { deleteEntryAction, stopRecurringAction } from "@/lib/actions";
import { EntryDialog } from "@/components/EntryDialog";
import type { Category, EntryWithCategory, Suggestion } from "@/lib/entries";
import { formatGBP } from "@/lib/money";

export function EntryRow({
  entry,
  month,
  categories,
  suggestions,
}: {
  entry: EntryWithCategory;
  month: string;
  categories: Category[];
  suggestions: Suggestion[];
}) {
  const day = new Date(`${entry.date}T00:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC", day: "2-digit", month: "short",
  });

  return (
    <li className="entry">
      <span className="entry-dot" style={{ background: entry.category_color }} />
      <span className="entry-name">
        {entry.name}
        <span className="label" style={{ marginLeft: 8 }}>{entry.category_name}</span>
      </span>

      {entry.recurring === 1
        ? <span className="entry-tag">monthly</span>
        : <span className="entry-date">{day}</span>}

      <span className="entry-amt">{formatGBP(entry.amount_pence)}</span>

      {entry.recurring === 1 && entry.end_month === null && (
        <form action={stopRecurringAction}>
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="month" value={month} />
          <button type="submit" className="btn" aria-label={`End recurrence for ${entry.name}`}>End</button>
        </form>
      )}

      <EntryDialog entry={entry} month={month} categories={categories} suggestions={suggestions} />

      <form action={deleteEntryAction}>
        <input type="hidden" name="id" value={entry.id} />
        <button type="submit" className="btn btn-danger" aria-label={`Delete ${entry.name}`}>
          <span aria-hidden="true">✕</span> Delete
        </button>
      </form>
    </li>
  );
}
