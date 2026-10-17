"use client";

import { useState } from "react";
import { EA_PATH } from "@/lib/eaFile";
import { copyText } from "@/components/copyText";
import { buttonClass } from "@/lib/ui";

// The EA's source, to copy straight into MetaEditor. Read from the same
// file the download serves, so the two can never differ.
export default function EaCodeBox() {
  const [code, setCode] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function load() {
    if (code !== null) return code;
    const res = await fetch(EA_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error(`the code could not be loaded (${res.status})`);
    const text = await res.text();
    setCode(text);
    return text;
  }

  async function copy() {
    setError("");
    try {
      if (!(await copyText(await load()))) throw new Error("This browser would not copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(`${err.message.replace(/\.$/, "")}. Select the code below and copy it instead.`);
    }
  }

  return (
    <details
      className="rounded-lg border border-line bg-panel"
      onToggle={(e) => {
        if (e.currentTarget.open) load().catch((err) => setError(err.message));
      }}
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">EA code for MetaEditor: copy and paste</summary>
      <div className="space-y-4 border-t border-line p-4 text-sm">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>In MetaTrader 5, press <span className="font-medium">F4</span> (Tools, MetaQuotes Language Editor).</li>
          <li>
            In MetaEditor: <span className="font-medium">File, New</span>, choose <span className="font-medium">Expert Advisor (template)</span>, name it{" "}
            <span className="font-mono">KeystoneSync</span>, then Next until <span className="font-medium">Finish</span>.
          </li>
          <li>Select everything in the new file (Ctrl+A), paste this code over it (Ctrl+V) and press <span className="font-medium">Compile</span> (F7). It should end with 0 errors.</li>
          <li>
            This copy has blank inputs: when you drag it onto the chart, paste the account&apos;s SyncUrl and SyncKey on the Inputs tab. After{" "}
            <span className="font-medium">Add account</span> or <span className="font-medium">New key</span>, the copy button there has them built in.
          </li>
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={copy} className={buttonClass}>{copied ? "Copied" : "Copy the code"}</button>
          <a href={EA_PATH} download className="text-sm text-accent hover:underline">Or download the file</a>
        </div>
        {error && <p className="text-xs text-down">{error}</p>}
        <pre className="max-h-96 overflow-auto rounded-md border border-line bg-bg p-3 font-mono text-xs leading-5 text-ink">
          {code ?? "Loading..."}
        </pre>
      </div>
    </details>
  );
}
