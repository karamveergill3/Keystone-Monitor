import CopyField from "@/components/CopyField";

// Shown once, straight after a key is made. Only its hash is stored, so
// there is no way to show it again; rotating makes a new one.
export default function KeyReveal({ state }) {
  if (!state?.ok || !state.key) return null;
  const origin = new URL(state.syncUrl).origin;
  return (
    <div className="mt-4 space-y-3 rounded-lg border border-warn/40 bg-warn/5 p-4 text-sm">
      <p className="font-medium text-warn">Sync key for {state.label}. Copy it now: it will not be shown again.</p>
      <CopyField value={state.key} label="SyncKey (EA input)" />
      <CopyField value={state.syncUrl} label="SyncUrl (EA input)" />
      <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
        <li>In MT5: Tools, Options, Expert Advisors. Tick &quot;Allow WebRequest for listed URL&quot; and add <span className="font-mono text-ink">{origin}</span>.</li>
        <li>Attach KeystoneSync to any one chart on that account, paste the two values above into its inputs, and press OK.</li>
        <li>Within a couple of minutes the account shows its login and balance here. The first sync also sends the full history.</li>
      </ol>
    </div>
  );
}
