import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** The caller's local users.id. Redirects to /login when unauthenticated. */
export async function requireUserId(): Promise<number> {
  if (process.env.TEST_AUTH_BYPASS === "1") {
    const testUser = (await cookies()).get("test_user_id")?.value;
    if (testUser) return Number(testUser);
  }

  const session = await auth();
  if (!session?.userId) redirect("/login");
  return session.userId;
}
