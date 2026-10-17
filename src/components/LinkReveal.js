import CopyField from "@/components/CopyField";

export default function LinkReveal({ state, what }) {
  if (!state) return null;
  if (!state.ok) return <p className="mt-2 text-sm text-down">{state.message}</p>;
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm">
      <p>
        {what} for {state.email}. Send it to them directly. It opens a page with a Continue button; pressing that
        uses the link, so a messenger&apos;s preview cannot. It works once and expires (an hour by default in Supabase).
      </p>
      {state.note && <p className="text-xs text-warn">{state.note}</p>}
      <CopyField value={state.link} />
    </div>
  );
}
