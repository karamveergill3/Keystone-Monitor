# Office printer: the print agent

An admin can print on the office printer:

- a **fleet summary** (one portrait page: each algorithm's accounts,
  trades and realised profit, the fleet's cumulative realised profit and
  nine headline figures, in the currency most live accounts use) from the
  site's header: **Print fleet summary**, beside **Leave admin**;
- a **project or account report** from the report box on its page:
  **Print**, beside **Download PDF**, with the dates picked there.

## How it works

A web page cannot reach a printer, so nothing ever connects to the office.
It is pull-only:

1. The button calls `POST /api/print` (admins only). The site adds a
   row to `print_jobs` with status `queued` and the report's `path`. More
   than three in a minute are refused, and the same report already
   waiting is handed back rather than queued twice.
2. A small agent on the office Mac, `scripts/print-agent.mjs`, calls
   `POST /api/print-queue` every 5 seconds with its own key. The site hashes
   the key (SHA-256) and `claim_print_job` in `supabase/schema.sql`
   (section 9) checks it, records the agent's heartbeat in `print_agents`
   and hands over the oldest queued job.
3. The agent downloads the job's report (the same public PDF anyone can
   open; it refuses any address that is not a report on its own site),
   prints it with `lp`, deletes the file and reports back
   (`finish_print_job`): `printed`, or `failed` with lp's own words.
4. The button polls `GET /api/print/jobs/<id>` every 3 seconds for up to
   two minutes and says where the job got to:
   - **Sent to the printer**, then **Printed**;
   - **Printer offline: it will print when the office Mac is on** when no
     agent has polled in the last 30 seconds. The job just waits;
   - **Did not print: \<reason\>**.

No port is opened on the office network. A Mac that is asleep leaves the
job queued, and it prints when the Mac wakes. The database tidies up on
every poll: a job left `printing` for over 10 minutes (the agent died
mid-job) is marked failed rather than reprinted, and a job still `queued`
after 24 hours is marked failed instead of printing a stale summary.

The agent's protocol, for reference:

| Request body | Answer |
| --- | --- |
| `{ "action": "poll", "agent", "printer", "version" }` | `{ "job": { "id", "copies", "url" } }` or `{ "job": null }` |
| `{ "action": "report", "jobId", "ok", "error" }` | `{ "ok": true }` |

Both carry `Authorization: Bearer <agent key>`. A wrong key is `401`, a
malformed body `400`. `url` is built from `APP_URL`.

## 1. Apply the schema

Run `supabase/schema.sql` in the Supabase SQL editor (it is re-runnable).
It adds `print_jobs`, `print_agents`, `print_agent_keys` and the two
functions. Do this before deploying the code.

## 2. Make the agent key

On the office Mac, in Terminal. The key is made locally and never leaves
the Mac; the site only ever stores its SHA-256.

```sh
umask 077
KEY=$(openssl rand -hex 32)
cat > ~/.keystone-monitor-print.env <<EOF
PRINT_AGENT_KEY=$KEY
PRINT_AGENT_URL=https://keystone-monitor.vercel.app
PRINT_AGENT_PRINTER=Brother_HL_L3220CW_series
PRINT_AGENT_NAME=office-mac
EOF
chmod 600 ~/.keystone-monitor-print.env
printf %s "$KEY" | shasum -a 256 | cut -d' ' -f1
unset KEY
```

The file is read by `sh`, so a value with a space in it needs quotes:
`PRINT_AGENT_NAME="Office Mac"`.

The last command prints the hash: 64 hex characters. In the Supabase SQL
editor, store it (one insert, the hash only, never the key):

```sql
insert into public.print_agent_keys (key_hash, label)
values ('<the 64-character hash>', 'office Mac');
```

`PRINT_AGENT_PRINTER` is the CUPS queue name (`lpstat -p` lists them);
leave the line out to use the Mac's default printer.

**Rotating the key:** make a new key and file as above, insert the new
hash, restart the agent (step 4), then delete the old hash:

```sql
delete from public.print_agent_keys where key_hash = '<the old hash>';
```

Deleting a hash stops that key at once. `select key_hash, label,
created_at from public.print_agent_keys;` lists what is there.

## 3. Install the LaunchAgent

The agent needs Node 22 or later (`node --version`). It is one file with
no dependencies, so no `npm install` is needed for it.

macOS does not let a LaunchAgent read `~/Documents` (or Desktop or
Downloads), so copy the script out of the clone first. Copy it again after
pulling a change to `scripts/print-agent.mjs`, then restart (step 4).

```sh
mkdir -p ~/Library/Application\ Support/Keystone\ Monitor
cp scripts/print-agent.mjs ~/Library/Application\ Support/Keystone\ Monitor/
command -v node            # the absolute path to put in the plist
cp deploy/keystone-monitor.printagent.plist ~/Library/LaunchAgents/
open -e ~/Library/LaunchAgents/keystone-monitor.printagent.plist
```

In the copy, replace `/ABSOLUTE/PATH/TO/node` and `/Users/USERNAME`
(twice, in the log paths). A node from nvm works, but its path changes
with each Node version: update the plist after removing the old one. Then:

```sh
plutil -lint ~/Library/LaunchAgents/keystone-monitor.printagent.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/keystone-monitor.printagent.plist
```

It starts now and at every login (`RunAtLoad`), and launchd restarts it if
it stops (`KeepAlive`, no more than every 10 seconds).

Before installing it, a one-off run in Terminal shows any problem
straight away (Ctrl-C stops it, after any job it is printing):

```sh
set -a; . ~/.keystone-monitor-print.env; set +a
node scripts/print-agent.mjs
```

## 4. Check, restart, remove

```sh
launchctl print gui/$(id -u)/keystone-monitor.printagent | grep -E 'state|pid|last exit'
tail -f ~/Library/Logs/keystone-monitor-print-agent.log
launchctl kickstart -k gui/$(id -u)/keystone-monitor.printagent     # restart, e.g. after editing the env file
launchctl bootout gui/$(id -u)/keystone-monitor.printagent           # stop and unload
```

The log has a line for every job, and says plainly when the site rejects
the key. A healthy agent is quiet between jobs.

In the database, `select * from public.print_agents;` shows each agent's
last poll; `select * from public.print_jobs order by id desc limit 10;`
the latest jobs and any errors.

## 5. Keep the Mac awake on mains power

The agent only runs while the Mac is awake and someone is logged in (a
LaunchAgent runs in the user's session). On mains power the Mac should
not sleep; this needs an administrator password, so the owner runs it:

```sh
sudo pmset -c sleep 0
pmset -g | grep -E '^ sleep'
```

The display can still sleep. If the Mac does sleep, jobs wait, and the
button says the printer is offline.

## Troubleshooting

| What you see | What to check |
| --- | --- |
| Button: "Printer offline" | The Mac is asleep, logged out, or the agent is not running: `launchctl print ...` above and the log. No poll for 30 seconds counts as offline. |
| Log: "THE SITE REJECTED THIS AGENT'S KEY" | `PRINT_AGENT_KEY` in the env file does not match a hash in `print_agent_keys`. Recompute the hash (`printf %s "<key>" \| shasum -a 256`) and compare. |
| Log: "PRINT_AGENT_KEY is not set" | The env file is missing or unreadable at `~/.keystone-monitor-print.env`. |
| Button: "Did not print: lp: ... does not exist" | `PRINT_AGENT_PRINTER` is not a CUPS queue name; `lpstat -p` lists them. |
| Button: "Did not print: The print agent did not report back within 10 minutes" | The agent stopped mid-job (crash, sleep, network). Check the printer: it may have printed anyway. |
| Button: "Too many prints in the last minute" | Three were queued within a minute. Wait a moment. |
| Printed, but nothing came out | `lpstat -o` shows what CUPS still holds; the printer may be off, out of paper, or paused (`cupsenable <queue>`). |
| Agent restarts every 10 seconds | Usually a wrong node path in the plist. `plutil -lint` it and read the log. |

The PDF itself can be checked in any browser at `/api/reports/fleet`.
