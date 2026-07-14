"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import type { ActionResult } from "@/lib/action-types";
import type { Category, EntryWithCategory, Suggestion } from "@/lib/entries";
import { createEntryAction, updateEntryAction } from "@/lib/actions";

export function EntryDialog({
  entry,
  month,
  categories,
  suggestions,
}: {
  entry: EntryWithCategory | null;
  month: string;
  categories: Category[];
  suggestions: Suggestion[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const uid = useId();
  const action = entry ? updateEntryAction : createEntryAction;
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

  useEffect(() => {
    if (state?.ok) ref.current?.close();
  }, [state]);

  function prefillFromName(value: string) {
    const match = suggestions.find((s) => s.name === value);
    const form = formRef.current;
    if (!match || !form) return;
    (form.elements.namedItem("amount") as HTMLInputElement).value = (match.amount_pence / 100).toFixed(2);
    (form.elements.namedItem("category") as HTMLInputElement).value = match.category_name;
    (form.elements.namedItem("payment_method") as HTMLInputElement).value = match.payment_method ?? "";
  }

  return (
    <>
      <button className={entry ? "btn" : "btn btn-primary"} onClick={() => ref.current?.showModal()}>
        {entry ? "Edit" : "Add entry"}
      </button>

      <dialog ref={ref}>
        <form action={formAction} ref={formRef}>
          {entry && <input type="hidden" name="id" value={entry.id} />}

          {state && !state.ok && <p className="form-error" role="alert">{state.error}</p>}
          {entry?.recurring === 1 && <p className="dialog-note">Changes apply to every month.</p>}

          <label>Name
            <input name="name" list={`names-${uid}`} defaultValue={entry?.name ?? ""} required maxLength={120}
              onInput={(e) => prefillFromName(e.currentTarget.value)} />
          </label>
          <datalist id={`names-${uid}`}>
            {suggestions.map((s) => <option key={s.name} value={s.name} />)}
          </datalist>

          <label>Amount (£)
            <input name="amount" inputMode="decimal" required
              defaultValue={entry ? (entry.amount_pence / 100).toFixed(2) : ""} />
          </label>

          <label>Category
            <input name="category" list={`cats-${uid}`} required maxLength={60}
              defaultValue={entry?.category_name ?? ""} placeholder="e.g. Groceries" />
          </label>
          <datalist id={`cats-${uid}`}>
            {categories.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>

          <label>Date
            <input type="date" name="date" required defaultValue={entry?.date ?? `${month}-01`} />
          </label>

          <label>Payment method
            <input name="payment_method" defaultValue={entry?.payment_method ?? ""} maxLength={60} />
          </label>

          <label>Notes
            <textarea name="notes" rows={2} maxLength={1000} defaultValue={entry?.notes ?? ""} />
          </label>

          <label>
            <input type="checkbox" name="recurring" defaultChecked={entry?.recurring === 1} />
            Recurs monthly
          </label>

          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
