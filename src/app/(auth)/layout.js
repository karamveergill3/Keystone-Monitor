import { APP_NAME } from "@/lib/site";

export default function AuthLayout({ children }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-12">
      <p className="mb-6 text-center text-sm font-semibold tracking-wide text-muted uppercase">{APP_NAME}</p>
      <div className="rounded-xl border border-line bg-panel p-6 shadow-lg">{children}</div>
    </main>
  );
}
