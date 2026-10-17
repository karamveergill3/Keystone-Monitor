import LoginForm from "@/components/LoginForm";
import { safeNext } from "@/lib/site";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  return <LoginForm next={safeNext(params?.next)} linkError={params?.error === "link"} />;
}
