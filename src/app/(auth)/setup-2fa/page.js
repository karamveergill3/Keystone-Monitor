import { redirect } from "next/navigation";
import SetupTwoFactor from "@/components/SetupTwoFactor";
import { memberState } from "@/lib/access";

export const metadata = { title: "Set up two-factor" };

export default async function SetupTwoFactorPage() {
  const s = await memberState();
  if (s.state === "signed-out") redirect("/login");
  if (s.state === "no-access") redirect("/no-access");
  if (s.state === "needs-code") redirect("/verify-2fa");
  if (s.state === "ok") redirect("/");
  return <SetupTwoFactor />;
}
