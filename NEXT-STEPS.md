# Kit Up — Pick Up Next Time

_Last updated: 2026-07-17_

## Where things stand right now

- **Live site:** https://kitup.tech (and https://www.kitup.tech) — served by Vercel, HTTPS working.
- **Code:** on GitHub at https://github.com/rosieajohnson/kitup (branch `main`), and locally in this `kitup/` folder.
- **Payments:** Stripe is in **TEST mode** — no real money yet (donors use test card `4242 4242 4242 4242`).
- **Database/auth/email:** Supabase (live project) + Resend for emails.

### Still outstanding (short list)
1. **Supabase Site URL** → set to `https://kitup.tech` (see section 4 — makes signup emails work).
2. **Stripe webhook** for the live domain (see section 3).
3. **Delete the temporary Vercel token** at https://vercel.com/account/tokens (it was shared in chat).
4. **Replace the placeholder support email** `rosieajohnson@gmail.com` before real launch
   (used in `app/contact/actions.ts` and `lib/notify.ts`).

### Two account facts worth remembering (they caused confusion)
- **GitHub repo** is under the **`rosieajohnson`** account.
- **Vercel** account is **`rosieajohnson-3072`** (different account) — team slug `kit-up`.
- Because they're different accounts, **Vercel does NOT auto-deploy from GitHub**. Deploys are
  done manually with the Vercel CLI (see section 1). To get auto-deploy later, the GitHub repo
  and the Vercel project must be under the **same** GitHub login.

### Running any command (important)
There's no system Node on this machine — use the portable copy. Start every terminal session with:
```bash
export PATH="/c/Users/rosie.johnson/n/node-v24.18.0-win-x64:$PATH"
```
Then `cd` into the `kitup/` folder.

---

## 1. How to make changes and push them live

The flow is: **edit → check → save to GitHub → deploy to Vercel.**

```bash
export PATH="/c/Users/rosie.johnson/n/node-v24.18.0-win-x64:$PATH"
cd "C:/Users/rosie.johnson/Desktop/Personal/EasyRaise2/kitup"

# 1) make your edits (see section 2), then check nothing is broken:
npm run typecheck
npm run lint

# 2) save a version to GitHub:
git add -A
git commit -m "Describe what changed"
git push

# 3) deploy the change to the live site:
vercel deploy --prod
```

**About the deploy step / login:** the Vercel CLI needs to be authenticated. Easiest is a
Vercel access token:
1. Create one at https://vercel.com/account/tokens (short expiry is fine).
2. Run the deploy with it:
   ```bash
   export VERCEL_TOKEN="paste-token-here"
   vercel deploy --prod --yes
   ```
3. Delete the token afterward.

**Simplest option:** just tell Claude Code what you want changed — it can edit the files, run the
checks, and deploy for you (that's how the site was built and shipped).

---

## 2. How to edit the website (content & look)

The site is built with Next.js. Each page is a file under `app/`. To change wording or layout,
edit the matching file:

| Page | File |
|---|---|
| Home / landing (hero, "How it works", browse) | `app/page.tsx` |
| Help & FAQs | `app/faq/page.tsx` |
| About / mission / trust | `app/about/page.tsx` |
| Contact form | `app/contact/page.tsx` |
| For schools | `app/for-schools/page.tsx` |
| Sign up / Sign in | `app/sign-up/page.tsx`, `app/sign-in/page.tsx` |
| Colours, fonts, design tokens | `app/globals.css` (the `@theme` block) |

**Preview changes locally before deploying:**
```bash
export PATH="/c/Users/rosie.johnson/n/node-v24.18.0-win-x64:$PATH"
cd "C:/Users/rosie.johnson/Desktop/Personal/EasyRaise2/kitup"
npm run dev
# open http://localhost:3000
```

**Product photos:** to refresh or add Hart product images after the catalogue changes:
```bash
npm run sync:images
```

**Easiest option:** describe the change to Claude Code ("change the hero heading to…", "make the
FAQ button green") and it will make the edit, verify it, and deploy.

---

## 3. How to activate Stripe (go from test mode to real payments)

Right now Stripe is sandboxed. To accept **real donations**:

1. **Activate the Stripe account** — complete business details + bank account in the Stripe
   dashboard. (Note: Kit Up donations are meant to be tax-deductible via the **Australian Sports
   Foundation** — confirm how funds/settlement should flow through ASF before switching to live.)
2. **Get the live API keys** from Stripe → Developers → API keys (they start with `sk_live_` /
   `pk_live_`).
3. **Update the keys in Vercel** → Project `kitup` → Settings → Environment Variables:
   - `STRIPE_SECRET_KEY` → the `sk_live_…` key
4. **Create a LIVE webhook**: Stripe (live mode) → Developers → Webhooks → Add endpoint
   `https://kitup.tech/api/webhooks/stripe`, events `checkout.session.completed` and
   `charge.refunded`. Copy its **signing secret** into Vercel as `STRIPE_WEBHOOK_SECRET`.
5. **Redeploy** (`vercel deploy --prod`) so the new keys take effect.
6. **Test** with a small real card payment, then refund it.

> Even while still in TEST mode, it's worth adding the **test-mode** webhook now
> (`https://kitup.tech/api/webhooks/stripe`, same two events) and putting its secret in
> `STRIPE_WEBHOOK_SECRET` — this makes donations/refunds confirm automatically instead of needing
> the admin "Sync" button.

---

## 4. How to activate email verification on the live site

The email-verification system is **already built** (Supabase + Resend, with a click-to-continue
`/auth/confirm` page that survives corporate mail scanners). It just needs the live domain wired in:

1. **Set the Site URL in Supabase** (the key step):
   Supabase → **Authentication → URL Configuration**
   - **Site URL:** `https://kitup.tech`
   - **Redirect URLs:** add `https://kitup.tech/**`
   Without this, confirmation links in signup emails point at `localhost` and don't work.

2. **Confirm Resend is set up for the domain:**
   - The `kitup.tech` domain should be **verified in Resend** (DNS records) so emails send and
     don't land in spam.
   - Supabase → Authentication → **SMTP settings** should be using the Resend SMTP credentials
     (custom SMTP), sending from an address at `kitup.tech`.

3. **Test it:** sign up a new school with a real inbox → confirm the email arrives from
   `kitup.tech` and the link opens `https://kitup.tech/auth/confirm…` and completes.

> Password reset is already handled separately (it sends its own Resend email and doesn't rely on
> the Supabase template), so once the Site URL is set, both signup confirmation and password reset
> work on the live domain.

---

## Quick reference

- **Live site:** https://kitup.tech
- **GitHub:** https://github.com/rosieajohnson/kitup (account: rosieajohnson)
- **Vercel:** project `kitup`, team `kit-up` (account: rosieajohnson-3072)
- **Local folder:** `C:/Users/rosie.johnson/Desktop/Personal/EasyRaise2/kitup`
- **Node PATH:** `export PATH="/c/Users/rosie.johnson/n/node-v24.18.0-win-x64:$PATH"`
- **Secrets** live in `kitup/.env.local` (never committed) and in Vercel's Environment Variables.
