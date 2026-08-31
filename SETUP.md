# Setup checklist

**None of this is needed to run it on your own machine.** `npm install && npm run dev`
gives you the whole thing, uploads included — locally they write into `sleeves/` instead
of committing to GitHub. The steps below are only for putting it online for the team.

Do these in order. Only step 1 needs the command line.

---

## 1. Get this folder onto GitHub ✅

Done — pushed to **https://github.com/clarklab/vhs-sleeves** on `main`.

---

## 2. Make the GitHub token

This is the key that lets the website commit uploaded PDFs back to the repo.

1. **github.com → your avatar → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**
2. Fill it in:
   - **Name:** `vhs-sleeve-uploads`
   - **Expiration:** 1 year (set a calendar reminder — uploads stop the day it expires)
   - **Repository access:** *Only select repositories* → `clarklab/vhs-sleeves`
   - **Permissions → Repository permissions → Contents → Read and write**
     (the only permission it needs — leave everything else alone)
3. **Generate token** and copy it. GitHub shows it exactly once.

☐ Token copied

> If this token ever lands in a chat, an email, or a file in the repo, treat it as burned —
> delete it on GitHub and make a new one. It only goes in the Netlify box in step 4.

---

## 3. Connect Netlify to the repo

1. **app.netlify.com → Add new site → Import an existing project → GitHub**
2. Pick `clarklab/vhs-sleeves`.
3. Netlify reads `netlify.toml` and should fill in:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Functions directory:** `netlify/functions`
4. **Deploy.**

☐ First deploy succeeded — site URL: `___________________`

---

## 4. Add one environment variable

**Site configuration → Environment variables → Add a variable → Add a single variable:**

| Key | Value |
|---|---|
| `GITHUB_TOKEN` | the token from step 2 |

Two settings on that screen matter, and getting either wrong produces the *same* "Uploads
are not configured yet" error:

- **Scopes: leave it on "All scopes."** If you narrow it to Builds only, the function
  can't see the variable — the build can, which is the confusing part.
- **Deploy contexts: "All deploy contexts"** (or at least Production).

That's the only variable. The repo is hardcoded to `clarklab/vhs-sleeves` in the code —
a public repo name, not a secret. (`GITHUB_REPO` and `GITHUB_BRANCH` still override it.)

☐ Added

---

## 4b. Redeploy — this is not optional

**Deploys → Trigger deploy → Clear cache and deploy site.**

Environment variables are handed to functions when a deploy is built. Adding the variable
does nothing to the deploy that's already running, so the site keeps returning "Uploads
are not configured yet" until you redeploy. This is the single most common reason this
step appears not to work.

☐ Redeployed

---

## 4c. Check it worked

Open **`your-site.netlify.app/api/submit-sleeve`** in a browser. You'll get JSON:

```json
{ "repo": "clarklab/vhs-sleeves", "tokenConfigured": true, "hint": "Ready to accept uploads." }
```

`"tokenConfigured": true` means the deploy can see the token — that's the whole of this
step. It never prints the token itself, only whether one is present, so the URL is safe to
open and safe to share.

If it says `false`, the variable didn't reach this deploy: check the spelling of
`GITHUB_TOKEN`, check Scopes is "All scopes", and redeploy again.

☐ Reports `tokenConfigured: true`

---

## 5. Test it end to end

1. Open the site, click a tape, scroll the panel to **Submit an edit**.
2. **Download current PDF**, then upload that same file straight back.
3. Type your name (optional) and hit **Upload & publish**.
4. You should get the green "Got it — your sleeve is in" screen with a commit link.
5. Check the repo — a new commit touching `sleeves/<name>.pdf`.
6. Wait ~2 minutes, reload the site.

☐ Round trip works

---

## 6. Tell the team

Send everyone the site URL and this:

> Click your tape. **Download current PDF** for the working file, or **Blank template** if
> you're starting fresh. Keep the page size exactly as it is — the site checks it and will
> refuse anything else. When you're done, come back, drop the PDF in **Submit an edit**,
> and it's live in a couple of minutes.

☐ Sent

---

# Things worth knowing

**What the format check does.** A submitted file is parsed on the server and has to be a
real PDF, exactly one page, measuring exactly 866.549 × 749.261pt. Anything else is
refused with a message saying why. This runs server-side on purpose — the same check in
the browser is a convenience, and anyone can skip it with one `curl` command.

**What it doesn't do.** It's a format gate, not a login. There's no password on the upload
endpoint, so anyone who finds the site can replace a sleeve with a correctly-sized PDF.
For four people sharing a private link that's usually fine. Two ways to lock it down if
you ever want to, neither requiring code changes from you:

- **Netlify → Site configuration → Access & security → Visitor access → Password
  protection.** One password on the whole site, set in the Netlify UI. Simplest option.
- Real per-person logins via Netlify Identity — that one's a change to
  `netlify/functions/submit-sleeve.mts`; ask and I'll do it.

**Nothing is ever lost.** Uploads commit over the old file, so every previous version is in
the repo's git history. To roll one back, revert that commit.

**Uploads replace, they don't review.** A submitted PDF goes straight live. If you'd rather
they open a pull request for someone to approve, that's a small change to the same function.

**The 4MB limit** is Netlify's, not mine. The usual cause of a bigger export is
full-resolution placed images; downsampling to 300dpi fixes it.

**If an upload fails, the message tells you which thing is wrong:**

| Message | Cause |
|---|---|
| "Uploads are not configured yet" | No token in this deploy — step 4/4b |
| "The GitHub token was rejected" | Token expired, or missing **Contents: Read and write** |
| "GitHub refused the commit (404)" | Token can't see the repo — check its *Repository access* names `clarklab/vhs-sleeves` |
| "That page is … isn't the sleeve die-line" | The PDF, not the setup. Start from the template |

**Adding a new tape:** add one line to `src/sleeves/registry.ts` with the id, title and
owners. The upload endpoint reads its allowlist from that same file, so there's only one
place to edit. It'll show up as an "awaiting artwork" box its owner can upload to.

---

# What I need from you

Steps 2, 3 and 4 — make the token, connect Netlify, paste the token in.

The token never touches the code and never ships to the browser; anything in the frontend
bundle is readable by anyone who opens devtools, which would make it a public write key to
your repo. That's why it goes in the Netlify box and nowhere else.

Everything else is done.
