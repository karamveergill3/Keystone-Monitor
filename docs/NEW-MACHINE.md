# Working on Keystone Monitor from another computer

Everything lives in places any computer can reach:

| What | Where |
|---|---|
| The code | GitHub: `karamveergill3/Keystone-Monitor` |
| The site | Vercel project `keystone-monitor`, in the Vercel account `karamveergill3`. Check `docs/handoff.md` for whether it has been created yet: until it is, nothing deploys and there is no live site. |
| Data, sign-ins and settings | Supabase project ID `avsfygkauoipytiqraau`, named "Keystone Monitor". Go by the ID: https://supabase.com/dashboard/project/avsfygkauoipytiqraau |

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
  1. A cloud session commits as `Claude <noreply@anthropic.com>`, which
     Vercel will not deploy. Before its first commit it must run the two
     `git config` lines from step 4 inside its clone.
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
2. Otherwise `winget install OpenJS.NodeJS.LTS --scope user`, close every
   PowerShell window, open a new one, and `node --version` should print
   v22 or later. CI uses 24; from 28 October 2026 this package installs
   Node 26, which also works.

**Mac** (no admin, no Homebrew):

1. **git first.** Run `xcode-select -p`. If it prints a path, git is
   installed. If not, run `xcode-select --install` and accept. If macOS asks
   for an administrator password you do not have, stop here and use a cloud
   session: nothing below works on this Mac without git.
2. **Make new Terminal windows pick things up.** Terminal starts bash as a
   login shell, which reads `~/.bash_profile` and ignores `~/.bashrc`, while
   installers write to `~/.bashrc`. Make one load the other, once:

   ```bash
   touch ~/.bashrc ~/.zshrc
   grep -q '\.bashrc' ~/.bash_profile 2>/dev/null || echo '[ -f ~/.bashrc ] && . ~/.bashrc' >> ~/.bash_profile
   grep -q '\.local/bin' ~/.bashrc || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
   ```

   (`~/.zshrc` is created so the same steps work if you switch to zsh.)
3. **Node, through nvm.** If `command -v nvm` already prints `nvm`, skip
   to the last line. Otherwise run the install command from
   https://github.com/nvm-sh/nvm, quit Terminal (Cmd-Q) and reopen it, and
   check `command -v nvm` prints `nvm`. Then:

   ```bash
   nvm install 24 && nvm alias default 24
   node --version    # v24...
   ```

   If `nvm` is still not found, run
   `grep -l NVM_DIR ~/.bashrc ~/.bash_profile ~/.zshrc 2>/dev/null` to see
   where the installer wrote, and move those lines into `~/.bashrc`.

### 2. Permission to push

Cloning works without signing in. **Pushing** needs it. If this laptop
already pushes to another of your GitHub repositories, it can probably push
here too, unless its token is limited to particular repositories; then add
Keystone-Monitor to that token.

- **Windows**: Git for Windows includes Git Credential Manager. The first
  `git push` opens a browser to sign in to GitHub.
- **Mac, no extra software**: on github.com, Settings, Developer settings,
  Fine-grained tokens, Generate new token. Resource owner `karamveergill3`,
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
  unzip it, copy `bin/gh` into `~/.local/bin`, open a new Terminal, then
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

Vercel's free plan only deploys commits whose author is the account owner.
A commit with any other author pushes fine and then never goes live. Inside
the clone:

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

Copy the template (`Copy-Item .env.local.example .env.local` on Windows,
`cp .env.local.example .env.local` on Mac) and fill in:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`: already
  filled in. They are public by design.
- `SUPABASE_SERVICE_ROLE_KEY`: open
  https://supabase.com/dashboard/project/avsfygkauoipytiqraau, then Project
  Settings, API Keys, Legacy API keys, `service_role`, Reveal. Paste it into
  `.env.local` only. Never commit it, never send it in a chat.
  (`vercel env pull` cannot fetch it: Vercel returns `[SENSITIVE]` for
  variables stored as Sensitive.)
- `APP_URL=http://localhost:3000`

Then `npm run dev` and open http://localhost:3000.

**Careful: there is only one database.** A local copy of the site reads and
writes the same Supabase project as the live one. Invites, new accounts,
archiving and key rotation made locally are real. And the links the local
admin screen shows are built from `APP_URL`, so they start
`http://localhost:3000`: partners cannot open those invite and password
links, and the EA refuses that SyncUrl because it only accepts `https://`.
**Add accounts, make keys and invite people on the live site only.** If you
did make a key locally, the key itself is valid: paste it into the EA with
the live SyncUrl (the live address followed by `/api/sync`).

### 7. Claude on this laptop

- **Claude Code**: Mac `curl -fsSL https://claude.ai/install.sh | bash`;
  Windows PowerShell `irm https://claude.ai/install.ps1 | iex`. Then open a
  **new** terminal window and run `claude --version`. On a Mac, the
  `~/.local/bin` line from step 1 is what puts `claude` on the PATH.
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
