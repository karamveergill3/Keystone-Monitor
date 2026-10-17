# Working on Keystone Monitor from another computer

Everything lives in three places that any computer can reach:

| What | Where |
|---|---|
| The code | GitHub: `karamveergill3/Keystone-Monitor` (private) |
| The site | Vercel project `keystone-monitor` |
| The data, sign-ins and settings | Supabase project `avsfygkauoipytiqraau` ("Keystone Monitor") |

Nothing needs copying between laptops except the one file of secrets in
step 6, and that is fetched fresh on each machine, never copied.

There are two ways to work. Pick one per session.

- **No setup at all:** start a cloud session at claude.ai/code and choose the
  `Keystone-Monitor` repository. It can read, change, test and push the
  code. It cannot click around in Chrome on your laptop.
- **On the laptop itself:** follow the steps below once. Then Claude Code
  (terminal or the Desktop app's Code tab, Environment: Local) can do
  everything, including driving Chrome with Claude in Chrome.

## One-time setup on a new laptop

### 1. Node 24

The site is built with Node 24 (CI uses 24; anything from 22 works).

**Windows** (no admin needed), in PowerShell:

```powershell
winget install OpenJS.NodeJS.LTS --scope user
```

Close and reopen PowerShell, then `node --version` should print `v24...`.

**Mac**: use nvm, which installs into your home folder and needs no admin or
Homebrew. Install it from https://github.com/nvm-sh/nvm (the README's
install command), open a new terminal, then:

```bash
nvm install 24
```

### 2. Git and access to the private repository

If this laptop can already clone ForexDNA, it can clone this too: same
GitHub account. Otherwise:

- **Windows**: Git for Windows includes Git Credential Manager. The first
  `git clone` below opens a browser to sign in to GitHub.
- **Mac**: `git` comes with the Xcode command line tools (macOS offers to
  install them the first time you type `git`). For sign-in, install GitHub
  CLI from https://cli.github.com, then run
  `gh auth login && gh auth setup-git`.

### 3. Clone to a plain local folder

Never inside OneDrive, iCloud Drive or Dropbox: they sync `.git` and
`node_modules` behind git's back and corrupt the clone.

**Windows**:

```powershell
git clone https://github.com/karamveergill3/Keystone-Monitor.git C:\dev\keystone-monitor
cd C:\dev\keystone-monitor
```

**Mac**:

```bash
git clone https://github.com/karamveergill3/Keystone-Monitor.git ~/dev/keystone-monitor
cd ~/dev/keystone-monitor
```

### 4. Your commit identity (this decides whether a push deploys)

Vercel's free plan only deploys commits whose author is the account owner.
A commit with any other author pushes fine and then silently never goes
live. Set this once per laptop, inside the clone:

```bash
git config user.name "Karam Gill"
git config user.email "281717050+karamveergill3@users.noreply.github.com"
```

### 5. Install and test

```bash
npm ci
npm test
```

`npm test` should end with `fail 0`. If it does, this laptop can work on
the code.

### 6. Secrets, only if you want to run the site locally

Skip this if you only change code and let Vercel run it.

Copy the template (`Copy-Item .env.local.example .env.local` on Windows,
`cp .env.local.example .env.local` on Mac) and fill in:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`: already
  filled in the template. They are public by design.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase dashboard, Project Settings, API
  Keys, Legacy API keys, `service_role`, Reveal. Paste it into `.env.local`
  only. Never commit it, never send it in a chat.
  (`vercel env pull` does not help here: Vercel returns `[SENSITIVE]` in
  place of any variable marked Sensitive.)
- `APP_URL=http://localhost:3000`

Then `npm run dev` and open http://localhost:3000.

**Careful: there is only one database.** A local copy of the site reads and
writes the same Supabase project as the live one. Invites, new accounts,
archiving and key rotation made locally are real.

### 7. Claude on this laptop

- **Claude Code**: Mac `curl -fsSL https://claude.ai/install.sh | bash`;
  Windows PowerShell `irm https://claude.ai/install.ps1 | iex`. Check with
  `claude --version`.
- **Desktop app** (optional): https://claude.ai/download. Use the Code tab
  with Environment set to **Local** when Claude needs your browser.
- **Claude in Chrome**: install the Claude extension from the Chrome Web
  Store and sign in with the same Claude account and organisation. In the
  terminal, start with `claude --chrome`; run `/chrome` to check it says
  "Status: Enabled".

Claude reads this repository's `CLAUDE.md` and `docs/handoff.md` on its own
when it starts in the clone.

## Every session, on any machine

1. **Pull first**: `git pull`. Another laptop or a cloud session may have
   pushed since you last worked here.
2. **Read `docs/handoff.md`**, newest entry at the top.
3. **Before you stop, commit and push everything.** A clean `git status` is
   the handover. Stashes and uncommitted files stay on the laptop you
   leave.
4. **Half-finished work goes on a branch, never on `main`**:
   `git switch -c wip/what-it-is`, commit, `git push -u origin HEAD`.
   Every push to `main` goes live on Vercel within a minute or two.
5. **Write a short entry at the top of `docs/handoff.md`** when you wrap up:
   what changed, what is left, anything to watch out for.

## Things only one kind of machine can do

- **Compiling the MT5 EA** (`public/ea/KeystoneSync.mq5`) needs MetaEditor,
  which runs on Windows (or on a Windows VPS). The file can be edited from
  any machine.
- **Mac and Windows file names are not case sensitive; Vercel's Linux build
  is.** An import that spells a file's name with the wrong capitals works on
  both laptops and fails only on Vercel. If a deploy fails but the build
  works locally, check that first.
