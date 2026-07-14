import Link from "next/link";
import { deleteAccountAction } from "@/lib/actions";
import { getDb } from "@/lib/db";
import { countEntries } from "@/lib/entries";
import { requireUserId } from "@/lib/session";

export default async function AccountPage() {
  const userId = await requireUserId();
  const count = countEntries(getDb(), userId);

  return (
    <main className="col" style={{ paddingTop: 32, paddingBottom: 64 }}>
      <p style={{ marginBottom: 30 }}><Link href="/" className="mono">← Overview</Link></p>

      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Your data</h1>
      <p style={{ color: "var(--muted)", marginBottom: 28 }}>
        You have {count} {count === 1 ? "entry" : "entries"} stored.
      </p>

      <p style={{ marginBottom: 44 }}>
        <a className="btn" href="/account/export">Download my data (JSON)</a>
      </p>

      <h2 style={{ fontSize: 17, marginBottom: 8 }}>Delete account</h2>
      <p style={{ color: "var(--muted)", marginBottom: 16 }}>
        Permanently deletes your account and all {count} of your entries. This cannot be undone.
      </p>

      <form action={deleteAccountAction} style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <label className="sr-only" htmlFor="confirm">Type DELETE to confirm</label>
        <input id="confirm" name="confirm" placeholder="Type DELETE" autoComplete="off"
          style={{ font: "inherit", background: "var(--surface)", color: "var(--text)",
                   border: "1px solid var(--line-strong)", borderRadius: 5, padding: "8px 10px" }} />
        <button type="submit" className="btn btn-danger">
          <span aria-hidden="true">✕</span> Delete my account
        </button>
      </form>
    </main>
  );
}
