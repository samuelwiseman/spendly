import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { BRAND } from "@/lib/brand";

export default async function LoginPage() {
  if ((await auth())?.userId) redirect("/");

  return (
    <main className="col" style={{ minHeight: "100dvh", display: "grid", placeContent: "center", textAlign: "center" }}>
      <h1 className="hero" style={{ fontSize: 34 }}>{BRAND.name}</h1>
      <p style={{ color: "var(--muted)", margin: "10px 0 28px" }}>{BRAND.tagline}</p>

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button className="btn btn-primary" type="submit">Continue with Google</button>
      </form>
    </main>
  );
}
