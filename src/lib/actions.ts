"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-types";
import { getDb } from "@/lib/db";
import { ENTRY_CAP, exceedsCap } from "@/lib/limits";
import { toPence } from "@/lib/money";
import { consume } from "@/lib/rate-limit";
import { requireUserId } from "@/lib/session";
import { signOut } from "@/lib/auth";
import {
  countEntries, createEntry, deleteEntry, deleteUser, getOrCreateCategory, stopRecurring, updateEntry,
} from "@/lib/entries";

const EntrySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  amount: z.string().trim().min(1, "Amount is required"),
  category: z.string().trim().min(1, "Category is required").max(60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  notes: z.string().trim().max(1000).nullish(),
  payment_method: z.string().trim().max(60).nullish(),
});

function parse(form: FormData) {
  const parsed = EntrySchema.safeParse({
    name: form.get("name"),
    amount: form.get("amount"),
    category: form.get("category"),
    date: form.get("date"),
    notes: form.get("notes") || null,
    payment_method: form.get("payment_method") || null,
  });

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }

  let amount_pence: number;
  try {
    amount_pence = toPence(parsed.data.amount);
  } catch {
    return { ok: false as const, error: "Amount must be a number, e.g. 12.34" };
  }
  if (amount_pence <= 0) {
    return { ok: false as const, error: "Amount must be greater than zero" };
  }

  return {
    ok: true as const,
    fields: {
      name: parsed.data.name,
      amount_pence,
      category: parsed.data.category,
      date: parsed.data.date,
      notes: parsed.data.notes ?? null,
      recurring: form.get("recurring") === "on",
      payment_method: parsed.data.payment_method ?? null,
    },
  };
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/entries");
}

export async function createEntryAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!consume(userId)) return { ok: false, error: "Too many changes. Try again in a few minutes." };

  const parsed = parse(form);
  if (!parsed.ok) return parsed;

  const db = getDb();
  if (exceedsCap(countEntries(db, userId))) {
    return { ok: false, error: `You have reached the limit of ${ENTRY_CAP} entries.` };
  }

  const category = getOrCreateCategory(db, userId, parsed.fields.category);
  const { category: _name, ...rest } = parsed.fields;
  createEntry(db, userId, { ...rest, category_id: category.id });
  refresh();
  return { ok: true };
}

export async function updateEntryAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!consume(userId)) return { ok: false, error: "Too many changes. Try again in a few minutes." };

  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { ok: false, error: "Unknown entry" };

  const parsed = parse(form);
  if (!parsed.ok) return parsed;

  const db = getDb();
  const category = getOrCreateCategory(db, userId, parsed.fields.category);
  const { category: _name, ...rest } = parsed.fields;
  if (!updateEntry(db, userId, id, { ...rest, category_id: category.id })) {
    return { ok: false, error: "Unknown entry" };
  }

  refresh();
  return { ok: true };
}

export async function deleteEntryAction(form: FormData): Promise<void> {
  const userId = await requireUserId();
  if (!consume(userId)) return;

  const id = Number(form.get("id"));
  if (Number.isInteger(id)) deleteEntry(getDb(), userId, id);

  refresh();
}

export async function deleteAccountAction(form: FormData): Promise<void> {
  const userId = await requireUserId();

  if (form.get("confirm") !== "DELETE") return;

  deleteUser(getDb(), userId);
  await signOut({ redirectTo: "/login" });
}

export async function stopRecurringAction(form: FormData): Promise<void> {
  const userId = await requireUserId();
  if (!consume(userId)) return;

  const id = Number(form.get("id"));
  const month = String(form.get("month") ?? "");
  if (Number.isInteger(id) && /^\d{4}-\d{2}$/.test(month)) {
    stopRecurring(getDb(), userId, id, month);
  }
  refresh();
}
