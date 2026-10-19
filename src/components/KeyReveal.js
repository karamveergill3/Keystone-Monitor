"use client";

import { useState } from "react";
import CopyField from "@/components/CopyField";
import { EA_PATH, canPersonalise, personaliseEa, eaFileName } from "@/lib/eaFile";
import { buttonClass } from "@/lib/ui";

// Shown once, straight after a key is made. Only its hash is stored, so
// there is no way to show it again; making a new key gives a new download.
export default function KeyReveal({ state }) {
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  if (!state?.ok || !state.key) return null;

  const origin = new URL(state.syncUrl).origin;
  const ready = canPersonalise(state.syncUrl, state.key);

  async function personalised() {
    const res = await fetch(EA_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error(`the EA could not be fetched (${res.status})`);
    return personaliseEa(await res.text(), { syncUrl: state.syncUrl, syncKey: state.key });
  }

  async function download() {
    setError("");
    try {
      const text = await personalised();
      // Not text/plain: some browsers add ".txt" to a text download, and the
      // file must stay a .mq5 that MetaEditor opens as it is.
      const url = URL.createObjectURL(new Blob([text], { type: "application/octet-stream" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = eaFileName(state.label);
      a.click();
      URL.revokeObjectURL(url);
      setSaved(true);
    } catch (err) {
      setError(`${err.message.replace(/\.$/, "")}. Use the two values under "Setting it up by hand" instead.`);
    }
  }

  return (
    <div className="mt-4 space-y-4 rounded-lg border border-line bg-panel-2 p-4 text-sm">
      <div>
        <p className="font-semibold">Connect {state.label} to its MT5 terminal</p>
        <p className="text-xs text-muted">This key is shown only now. Lost it? Make a new key and download again.</p>
      </div>

      <ol className="list-decimal space-y-3 pl-5">
        <li>
          {ready ? (
            <>
              <button type="button" onClick={download} className={buttonClass}>
                Download the EA for {state.label}
              </button>
              <span className="mt-1 block text-xs text-muted">
                {saved ? `Saved as ${eaFileName(state.label)}. ` : ""}A ready-made .mq5 file with this account&apos;s SyncUrl and
                SyncKey already in it. You can send it on as it is to whoever runs the terminal.
              </span>
              {error && <span className="mt-1 block text-xs text-down">{error}</span>}
            </>
          ) : (
            <span>
              <a href={EA_PATH} download className="text-accent hover:underline">Download the blank EA</a> and type in the two values
              under &quot;Setting it up by hand&quot; when you attach it.
            </span>
          )}
        </li>
        <li>
          In MetaTrader 5: <span className="font-medium">File, Open Data Folder</span>, then <span className="font-mono">MQL5/Experts</span>, and
          put the file there. Press F4 to open MetaEditor, find the file under <span className="font-medium">Experts</span>, double-click it and
          press <span className="font-medium">Compile</span> (F7). Back in MetaTrader, right-click <span className="font-medium">Expert Advisors</span> in
          the Navigator and choose <span className="font-medium">Refresh</span>.
        </li>
        <li>
          <span className="font-medium">Tools, Options, Expert Advisors</span>: tick &quot;Allow WebRequest for listed URL&quot; and add this address:
          <div className="mt-2"><CopyField value={origin} /></div>
        </li>
        <li>Drag the EA onto <span className="font-medium">one</span> chart of this account and press OK. Nothing needs typing.</li>
        <li>
          The chart&apos;s top-left corner shows &quot;OK at&quot; and the time. Within a couple of minutes this account shows its login and
          balance on the site, with its full history.
        </li>
      </ol>

      <details className="rounded-md border border-line bg-panel p-3">
        <summary className="cursor-pointer text-xs font-medium text-muted">Setting it up by hand</summary>
        <div className="mt-3 space-y-3">
          <CopyField value={state.key} label="SyncKey (EA input)" />
          <CopyField value={state.syncUrl} label="SyncUrl (EA input)" />
        </div>
      </details>
    </div>
  );
}
