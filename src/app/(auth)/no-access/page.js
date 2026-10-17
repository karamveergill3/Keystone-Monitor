export const metadata = { title: "No access" };

export default function NoAccessPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">No access</h1>
      <p className="text-sm text-muted">
        This sign-in is not on the partner list. Ask an admin to invite you.
      </p>
      <form action="/auth/sign-out" method="post">
        <button type="submit" className="text-sm text-accent hover:underline">Sign out</button>
      </form>
    </div>
  );
}
