import { redirect } from "next/navigation";
import VerifyTwoFactor from "@/components/VerifyTwoFactor";
import { memberState } from "@/lib/access";
import { safeNext } from "@/lib/site";

export const metadata = { title: "Two-factor code" };

export default async function VerifyTwoFactorPage({ searchParams }) {
  const params = await searchParams;
  const next = safeNext(params?.next);
  const s = await memberState();
  if (s.state === "signed-out") redirect("/login");
  if (s.state === "no-access") redirect("/no-access");
  if (s.state === "needs-2fa-setup") redirect("/setup-2fa");
  if (s.state === "ok") redirect(next);
  return (
    <>
      <VerifyTwoFactor next={next} />
      <form action="/auth/sign-out" method="post" className="mt-4 text-center">
        <button type="submit" className="text-xs text-muted hover:text-ink">Not you? Sign out</button>
      </form>
    </>
  );
}
