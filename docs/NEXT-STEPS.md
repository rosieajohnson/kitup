# Kit Up — Pick up next time

A plain-English guide to running and changing the live site. Live at
**https://kitup.tech** (hosted on Vercel; database on Supabase; payments on
Stripe in **test mode**).

---

## 1. How to make changes from here (deploy workflow)

The site does **not** auto-deploy from GitHub (the repo lives under the
`rosieajohnson` GitHub account, but the Vercel account is `rosieajohnson-3072`
— two different accounts, so they aren't linked). Deploys are done manually with
the Vercel CLI from the `kitup/` folder.

**Every change follows the same loop:**

```bash
# from the kitup/ folder, with portable Node on PATH
export PATH="/c/Users/rosie.johnson/n/node-v24.18.0-win-x64:$PATH"

npm run typecheck && npm run lint     # 1. check it compiles cleanly
npm run dev                           # 2. (optional) preview locally at localhost:3000

git add -A && git commit -m "what changed"   # 3. save to git history

export VERCEL_TOKEN="<a token from vercel.com/account/tokens>"
vercel deploy --prod --yes            # 4. push it live to kitup.tech
```

Notes:
- Create a fresh Vercel token each time at **vercel.com/account/tokens** (the
  old one shared during setup should be deleted).
- **Environment variables** (Supabase/Stripe/Resend keys) live in Vercel, not in
  the deploy. To change one: `vercel env add NAME production` (or the Vercel
  dashboard → Project → Settings → Environment Variables), then redeploy.
- **Want git auto-deploy instead** (push to GitHub → auto-build)? That requires
  the GitHub repo and the Vercel project to be on the **same** account. Easiest
  fix: recreate the repo under an account the Vercel login can access, or connect
  that GitHub account in Vercel. Until then, use the CLI loop above.

## 2. How to edit the website

Everything is in the `kitup/` project:
- **Pages** live in `app/` — e.g. `app/page.tsx` (home/browse),
  `app/faq/page.tsx` (Help & FAQs), `app/about/page.tsx`, `app/contact/page.tsx`.
  Editing the text in these files changes those pages.
- **Shared pieces** (header, footer, buttons, cards) live in `components/`
  (e.g. `components/site-header.tsx`, `components/site-footer.tsx`).
- **Colours, fonts, styling** are defined once in `app/globals.css` (the
  `@theme` block) — change a token there and it updates everywhere.
- **Data** (campaigns, catalogue) all flows through `lib/data.ts` — the single
  place that talks to the database.
- Preview changes locally with `npm run dev` before deploying (step 1 above).

## 3. How to activate Stripe (test → real payments)

Right now Stripe is in **test mode**: donations use test cards
(`4242 4242 4242 4242`) and **no real money moves**. To take real donations:

1. **Activate the Stripe account** for real payments (business details + bank
   account) — done via the Australian Sports Foundation / Stripe account that
   will receive funds.
2. **Swap the keys** in Vercel env from test to live:
   - `STRIPE_SECRET_KEY`: `sk_test_…` → `sk_live_…`
3. **Create a live webhook**: Stripe (live mode) → Developers → Webhooks → add
   `https://kitup.tech/api/webhooks/stripe`, events `checkout.session.completed`
   and `charge.refunded`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
4. **Redeploy** (`vercel deploy --prod`).

> The webhook is what makes payments and refunds confirm automatically. Even
> without it, the success page confirms donations — but set it up for
> reliability once you're live.

## 4. How to activate email verification (confirmation emails)

Email confirmation is **already switched on** in Supabase, and auth emails send
via **Resend** (from the `kitup.tech` domain). The one remaining step so the
links in those emails point at the live site:

1. Supabase → **Authentication → URL Configuration**:
   - **Site URL** → `https://kitup.tech`
   - **Redirect URLs** → add `https://kitup.tech/**`
2. That's it — new sign-ups get a confirmation email; clicking the link lands on
   `https://kitup.tech/auth/confirm`, and confirming there activates the account.

> Until Site URL is set to `https://kitup.tech`, confirmation links point at
> `localhost` and won't work for real users. **This is the most important
> remaining launch item.**

---

## Other loose ends before a "real" launch
- Replace the placeholder support/admin email `rosieajohnson@gmail.com`
  (`app/contact/actions.ts` and `lib/notify.ts`).
- Delete any temporary Vercel tokens shared during setup.
- Optional: set a `www` → apex redirect in Vercel so both go to `kitup.tech`.
