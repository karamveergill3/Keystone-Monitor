// A copy of the EA with one account's SyncUrl and SyncKey already filled
// in as its input defaults, so whoever sets up the terminal drops the file
// in and attaches it with nothing to paste.
//
// Runs in the browser, straight after a key is made: the key exists in
// plain text only then (only its hash is stored), so this is the one
// moment the file can be built.

export const EA_PATH = "/ea/KeystoneSync.mq5";

const SYNC_URL = /^https:\/\/[A-Za-z0-9.-]+(:\d{1,5})?\/api\/sync$/;
// The same shape as looksLikeSyncKey() in syncKeys.js, which this file
// cannot import: that module pulls in node:crypto.
const SYNC_KEY = /^ptk_[A-Za-z0-9_-]{43}$/;
const URL_INPUT = /^(input string SyncUrl\s*=\s*)"";/m;
const KEY_INPUT = /^(input string SyncKey\s*=\s*)"";/m;

// The EA only accepts an https SyncUrl, so a local http address cannot be
// built into a file that would work.
export function canPersonalise(syncUrl, syncKey) {
  return SYNC_URL.test(String(syncUrl ?? "")) && SYNC_KEY.test(String(syncKey ?? ""));
}

export function personaliseEa(source, { syncUrl, syncKey }) {
  if (!canPersonalise(syncUrl, syncKey)) throw new Error("not a usable SyncUrl and SyncKey");
  const text = String(source ?? "");
  if (!URL_INPUT.test(text) || !KEY_INPUT.test(text)) throw new Error("the EA's SyncUrl and SyncKey inputs were not found");
  return text.replace(URL_INPUT, `$1"${syncUrl}";`).replace(KEY_INPUT, `$1"${syncKey}";`);
}

// The file name is the EA's name in MetaTrader's Navigator, so it carries
// the account's name. ASCII letters, digits and dashes only.
export function eaFileName(label) {
  const slug = String(label ?? "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return slug ? `KeystoneSync-${slug}.mq5` : "KeystoneSync.mq5";
}
