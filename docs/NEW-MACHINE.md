# Working on Keystone Monitor from another computer

Everything lives in places any computer can reach:

| What | Where |
|---|---|
| The code | GitHub: `karamveergill3/Keystone-Monitor` |
| The site | Vercel project `keystone-monitor`, in the Vercel account `karamveergill3`. Check `docs/handoff.md` for whether it has been created yet: until it is, nothing deploys and there is no live site. |
| Data | Supabase project ID `avsfygkauoipytiqraau`, named "Keystone Monitor". Go by the ID: https://supabase.com/dashboard/project/avsfygkauoipytiqraau |

Nothing is copied between laptops except one secret in step 6, which is
fetched fresh on each machine.

## Where the conversation with Claude is

- **Cloud sessions** (started at claude.ai/code, or in the Desktop app with
  Environment: Cloud) live in your Claude account. On any laptop, open
  claude.ai/code or the Desktop app's Code tab, signed in to the same Claude
  account and organisation, and the session is in the sidebar. You can keep
  typing in it there. The session that built this site is one of these.
- **Local sessions** (`claude` in a terminal, an IDE, or the Desktop app
  with Environment: Local) exist only on the laptop that ran them.
  `claude --resume` lists only that laptop's sessions, and Claude's memory
  stays there too.
- So anything the other laptop needs goes into git: code, `CLAUDE.md`,
  `docs/handoff.md`. Claude loads `CLAUDE.md` by itself when it starts in
  the clone, and `CLAUDE.md` tells it to read `docs/handoff.md`. If its
  first reply does not mention the newest handoff entry, ask it to read
  that file.

## Two ways to work

- **No install: a cloud session.** Start one at claude.ai/code and choose
  the `Keystone-Monitor` repository. It can read, change, test and push the
  code, but it cannot use Chrome on your laptop. Two things to tell it:
  1. A cloud session commits as `Claude <noreply@anthropic.com>`. Before
     its first commit it must run the two `git config` lines from step 4
     inside its clone, so its commits deploy (see step 4).
  2. Cloud sessions push to a `claude/...` branch unless told to use
     `main`. Say which you want.
- **On the laptop itself.** Follow the steps below once. Then Claude Code
  (terminal, or the Desktop app's Code tab with Environment: Local) can do
  everything, including driving Chrome.

## One-time setup on a new laptop

### 0. Accounts to sign in to, each one separately

- **GitHub**: `karamveergill3`.
- **Claude**: the same account and organisation as the cloud session. Sign
  in through the browser when `claude` first starts (not with an API key);
  `/status` shows the organisation.
- **Supabase**: the login that owns the project. Test it by opening
  https://supabase.com/dashboard/project/avsfygkauoipytiqraau. If it says
  the project does not exist, you are signed in to a different account.
- **Vercel**: `karamveergill3`. Import and manage Keystone in that
  account only: a project in another account cannot deploy these commits.

### 1. Git and Node

**Windows** (no admin needed), in PowerShell:

1. `git --version` and `node --version`. If both work and Node prints
   v22 or later, skip to step 2.
2. If `git --version` failed: `winget install Git.Git --scope user` (Git
   for Windows, which also brings the Git Credential Manager used in
   step 2).
3. If `node --version` failed or printed less than v22:
   `winget install OpenJS.NodeJS.LTS --scope user`.
4. Close every PowerShell window, open a new one, and run both checks
   again. Node should print v22 or later. CI uses 24; from 28 October 2026
   this package installs Node 26, which also works. If Node still prints
   an older version, an all-users Node comes first on PATH
   (`where.exe node` lists both). Removing it needs an administrator, so
   use a cloud session until then.

**Mac** (no admin, no Homebrew):

1. **git first.** Run `xcode-select -p`. If it prints a path, git is
   installed. If not, run `xcode-select --install` and accept. If macOS asks
   for an administrator password you do not have, stop here and use a cloud
   session: nothing below works on this Mac without git.
2. **Make new Terminal windows pick things up.** Terminal starts your
   login shell. On any Mac account made since macOS 10.15 that is zsh,
   which reads `~/.zshrc`. Older accounts may still use bash, which reads
   only the first of `~/.bash_profile`, `~/.bash_login` and `~/.profile`
   and ignores `~/.bashrc`. `echo $SHELL` shows which. This covers both
   and is safe to run again:

   ```bash
   touch ~/.zshrc ~/.bashrc
   for f in ~/.bash_profile ~/.bash_login ~/.profile; do [ -f "$f" ] && break; done
   [ -f "$f" ] || f=~/.bash_profile
   grep -qs '\.bashrc' "$f" || printf '\n[ -n "$BASH_VERSION" ] && [ -f ~/.bashrc ] && . ~/.bashrc\n' >> "$f"
   for f in ~/.zshrc ~/.bashrc; do grep -qs '\.local/bin' "$f" || printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$f"; done
   ```
3. **Node, through nvm.** If `command -v nvm` already prints `nvm`, skip
   to the two commands below. Otherwise run the install command from
   https://github.com/nvm-sh/nvm, quit Terminal (Cmd-Q) and reopen it, and
   check `command -v nvm` prints `nvm`. Then:

   ```bash
   nvm install 24 && nvm alias default 24
   node --version
   ```

   The last line should print `v24...`.

   If `nvm` is still not found, run
   `grep -l NVM_DIR ~/.bashrc ~/.bash_profile ~/.zshrc 2>/dev/null` to see
   where the installer wrote, and move those lines into `~/.zshrc` if
   `echo $SHELL` ends in `zsh`, otherwise into `~/.bashrc`.

### 2. Permission to push

Cloning works without signing in. **Pushing** needs it. If this laptop
already pushes to another of your GitHub repositories, it can probably push
here too, unless its token is limited to particular repositories; then add
Keystone-Monitor to that token.

- **Windows**: Git for Windows includes Git Credential Manager. The first
  `git push` opens a browser to sign in to GitHub.
- **Mac, no extra software**: on github.com, Settings, Developer settings,
  Personal access tokens, Fine-grained tokens, Generate new token.
  Expiration: no expiration, or a date you will remember (the default is
  30 days; when it lapses the next `git push` asks for the password again,
  and you paste a new token). Resource owner `karamveergill3`,
  only `Keystone-Monitor` (plus any other repository this Mac pushes to),
  permissions Contents: Read and write, Workflows: Read and write. Check
  `git config --get credential.helper` prints `osxkeychain` (if it prints
  nothing: `git config --global credential.helper osxkeychain`). At the
  first `git push`, give `karamveergill3` as the username and paste the
  token as the password; the keychain remembers it. Never paste a token
  into a chat.
- **Mac, GitHub CLI instead**: the `.pkg` on cli.github.com needs an
  administrator. Download the `gh_*_macOS_arm64.zip` (Apple silicon) or
  `_amd64.zip` (Intel) from https://github.com/cli/cli/releases/latest,
  open it so it unpacks in Downloads, then run
  `mkdir -p ~/.local/bin && cp ~/Downloads/gh_*_macOS_*/bin/gh ~/.local/bin/`,
  open a new Terminal, then
  `gh auth login --scopes workflow && gh auth setup-git`. (Without the
  `workflow` scope GitHub refuses pushes that change
  `.github/workflows/`.)

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

### 4. Your commit identity: this decides whether a push deploys

Vercel's free plan deploys a private repository's commits only when their
author is the account owner: any other author's commit pushes fine and then
never goes live. The repository is public today (see `docs/handoff.md`),
but set the identity either way, so nothing changes if it is made private.
Inside the clone:

```bash
git config user.name "Karam Gill"
git config user.email "281717050+karamveergill3@users.noreply.github.com"
```

After your first commit, `git log -1 --format='%an <%ae>'` must show that
address.

### 5. Install and test

On a Mac, run `nvm use` first: it reads `.nvmrc` and switches to Node 24
(nvm does not do this on its own when you `cd` in).

```bash
npm ci
npm test
```

The summary near the end should say `fail 0`.

**Windows:** PowerShell runs `npm` as a script file, which Windows blocks
by default. If you see `npm.ps1 cannot be loaded because running scripts is
disabled on this system`, either type `npm.cmd` wherever this guide says
`npm` (`npm.cmd ci`, `npm.cmd test`), or run once, no admin needed,
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` and open a new
PowerShell window.

### 6. Secrets, only if you want to run the site locally

Skip this if you only change code and let Vercel run it.

Copy the template if there is no `.env.local` yet
(`if (-not (Test-Path .env.local)) { Copy-Item .env.local.example .env.local }`
on Windows, `[ -f .env.local ] || cp .env.local.example .env.local` on Mac)
and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`: already filled in.
- `SUPABASE_SERVICE_ROLE_KEY`: the project's **secret** key. Open
  https://supabase.com/dashboard/project/avsfygkauoipytiqraau, then Project
  Settings, API Keys, the "Publishable and secret API keys" tab, Secret
  keys, `default`, reveal and copy. It starts `sb_secret_`. Paste it into
  `.env.local` only. Never commit it, never send it in a chat.
  (`vercel env pull` cannot fetch it: Vercel returns `[SENSITIVE]` for
  variables stored as Sensitive.)
- `APP_URL=http://localhost:3000`
- `ADMIN_PASSWORD`: any password of 12 or more characters, for `/admin` on
  your own machine. It does not have to match the one in Vercel.

Then `npm run dev` and open http://localhost:3000.

**Careful: there is only one database.** A local copy of the site reads and
writes the same Supabase project as the live one. New accounts, archiving
and key rotation made locally are real. And the SyncUrl the local admin
screen shows is built from `APP_URL`, so it starts `http://localhost:3000`,
which the EA refuses because it only accepts `https://`. **Add accounts and
make keys on the live site only.** If you did make a key locally, the key
itself is valid: paste it into the EA with the live SyncUrl (the live
address followed by `/api/sync`).

### 7. Claude on this laptop

- **Claude Code**: Mac `curl -fsSL https://claude.ai/install.sh | bash`;
  Windows PowerShell `irm https://claude.ai/install.ps1 | iex`. The
  installer does not change PATH. On a Mac, the `~/.local/bin` line from
  step 1 covers it. On Windows, run this once (no admin needed, safe to
  repeat):

  ```powershell
  $p = [Environment]::GetEnvironmentVariable('PATH', 'User'); if (($p -split ';') -notcontains "$env:USERPROFILE\.local\bin") { [Environment]::SetEnvironmentVariable('PATH', "$p;$env:USERPROFILE\.local\bin", 'User') }
  ```

  Then open a **new** terminal window and run `claude --version`.
- **Desktop app** (optional): https://claude.ai/download. On a Mac without
  admin, drag Claude into an `Applications` folder inside your home folder
  (create it if needed) rather than the main one. Use the Code tab with
  Environment: **Local** when Claude needs your browser.
- **Claude in Chrome**: install the Claude extension from the Chrome Web
  Store and sign in with the same Claude account and organisation. In the
  terminal, start with `claude --chrome`, then `/chrome` should show
  "Status: Enabled" and "Extension: Installed". If not, quit and reopen
  Chrome, and pick "Reconnect extension" in `/chrome`.
- The dashboard steps still waiting are written as a prompt in
  `docs/SETUP-PROMPT.md`: paste it into a session that has Chrome.

## Every session, on any machine

1. **Pull first**: `git pull`, then `git fetch --prune && git branch -r`.
   If a `claude/...` branch is listed, a cloud session pushed work there:
   see what it holds with `git log --oneline main..origin/claude/<name>`.
2. **Read `docs/handoff.md`**, newest entry at the top.
3. **Before you stop, commit and push everything.** A clean `git status` is
   the handover. Stashes and uncommitted files stay on the laptop you leave.
4. **Half-finished work goes on a branch, never on `main`**:
   `git switch -c wip/what-it-is`, commit, `git push -u origin HEAD`. Once
   the Vercel project exists, every push to `main` goes live within a
   minute or two.
5. **Write a short entry at the top of `docs/handoff.md`** when you wrap up:
   what changed, what is left, anything to watch out for.

## Is my change live?

Once the Vercel project exists: Vercel dashboard, `keystone-monitor`,
Deployments. The row marked Production names its commit, and it must match
`git rev-parse --short origin/main`. On GitHub, the tick or cross beside a
commit links to its Vercel deployment; "Blocked" means Vercel refused the
commit's author (step 4).

- After changing an environment variable on Vercel, **Redeploy**: the change
  does not reach a deployment that is already running.
- `APP_URL` must be the address Vercel actually gave the site. Check it
  after the first deploy, and redeploy if you change it.

## Things only one kind of machine can do

- **Compiling the MT5 EA** needs MetaEditor, so do it on the Windows laptop
  (or a Windows VPS). In MT5, File, Open Data Folder, and copy
  `C:\dev\keystone-monitor\public\ea\KeystoneSync.mq5` into `MQL5\Experts`.
  Open that copy in MetaEditor (F4) and Compile (F7). Compile the copy, not
  the file in the clone, or a `KeystoneSync.ex5` appears in `public/ea` and
  `git status` is no longer clean. Make source changes in the clone, from
  any machine, then copy the file across again.
- **Capitals in file names.** Mac and Windows file names are not case
  sensitive; Linux is, so CI (GitHub Actions) and Vercel are. An import
  with the wrong capitals works on both laptops and fails only there. If a
  build fails there but works locally, check that first. To change only
  the capitals of a file name, rename it with git, for example
  `git mv src/lib/accountstats.js src/lib/accountStats.js`: on Windows git
  does not notice a rename made in Explorer or the editor.
