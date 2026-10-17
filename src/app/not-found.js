import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-muted">That page or account does not exist.</p>
      <Link href="/" className="mt-6 inline-block text-accent hover:underline">
        Back to the overview
      </Link>
    </main>
  );
}
