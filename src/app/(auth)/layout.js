import LogoMark from "@/components/LogoMark";
import { APP_NAME } from "@/lib/site";

export default function AuthLayout({ children }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-12">
      <div className="mb-6 flex flex-col items-center gap-3">
        <LogoMark className="h-16 w-16" />
        <p className="text-sm font-semibold tracking-wide text-muted uppercase">{APP_NAME}</p>
      </div>
      <div className="rounded-lg border border-line bg-panel p-6">{children}</div>
    </main>
  );
}
