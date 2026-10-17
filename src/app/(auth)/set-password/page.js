import { redirect } from "next/navigation";
import SetPasswordForm from "@/components/SetPasswordForm";
import { memberState } from "@/lib/access";

export const metadata = { title: "Choose a password" };

// Reached from an invite or reset link. Somebody who already has two-factor
// enters their code first, since Supabase will not change the password of
// such an account on a password-only session.
export default async function SetPasswordPage() {
  const s = await memberState();
  if (s.state === "signed-out") redirect("/login?error=link");
  if (s.state === "no-access") redirect("/no-access");
  if (s.state === "needs-code") redirect("/verify-2fa?next=/set-password");
  return <SetPasswordForm />;
}
