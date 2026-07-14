"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ActionResult } from "@/lib/action-types";
import type { Entry } from "@/lib/entries";
import { createEntryAction, updateEntryAction } from "@/lib/actions";

export function EntryDialog({ entry, month }: { entry: Entry | null; month: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const action = entry ? updateEntryAction : createEntryAction;
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

  useEffect(() => {
    if (state?.ok) ref.current?.close();
  }, [state]);

  return (
    <>
      <button className={entry ? "btn" : "btn btn-primary"} onClick={() => ref.current?.showModal()}>
        {entry ? "Edit" : "Add entry"}
      </button>

      <dialog ref={ref}>
        <form action={formAction}>
          {entry && <input type="hidden" name="id" value={entry.id} />}

          {state && !state.ok && <p className="form-error" role="alert">{state.error}</p>}

          <label>Name
            <input name="name" defaultValue={entry?.name ?? ""} required maxLength={120} />
          </label>

          <label>Amount (£)
            <input name="amount" inputMode="decimal" required
              defaultValue={entry ? (entry.amount_pence / 100).toFixed(2) : ""} />
          </label>

          <label>Category
            <select name="category" defaultValue={entry?.category ?? "need"}>
              <option value="need">Need</option>
              <option value="want">Want</option>
              <option value="luxury">Luxury</option>
            </select>
          </label>

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
            Recurring
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
