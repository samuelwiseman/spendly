import { getDb } from "@/lib/db";
import { exportUser } from "@/lib/entries";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  const payload = exportUser(getDb(), userId);

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": 'attachment; filename="spendly-export.json"',
    },
  });
}
