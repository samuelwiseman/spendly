import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  try {
    getDb().prepare("SELECT 1").get();
    return new Response("ok");
  } catch (error) {
    console.error("health: database unreachable", error);
    return new Response("database unreachable", { status: 503 });
  }
}
