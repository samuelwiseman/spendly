import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { upsertUser } from "@/lib/entries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.TEST_AUTH_BYPASS !== "1") {
    return new Response("Not found", { status: 404 });
  }

  const who = new URL(request.url).searchParams.get("who") ?? "alice";
  const user = upsertUser(getDb(), {
    provider: "test", providerId: who, name: who, email: `${who}@example.com`, avatarUrl: null,
  });

  (await cookies()).set("test_user_id", String(user.id), { httpOnly: true, path: "/" });
  return Response.redirect(new URL("/", request.url), 302);
}
