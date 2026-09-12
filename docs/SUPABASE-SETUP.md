# Wiring the staff area to Supabase

Everything in the repo is ready. What is left needs your account, so it is yours
to do — five steps, about twenty minutes.

Until `SUPABASE_URL` is set, `/admin` runs against local sample data and says so
on screen. Set it and the same page becomes real. There is no half state.

---

## 1 · Create the project

[supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
Pick a region near you. Save the database password somewhere safe.

## 2 · Run the migrations

Dashboard → **SQL Editor** → paste and run each file in order:

1. `supabase/migrations/0001_schema.sql` — tables
2. `supabase/migrations/0002_rls.sql` — **security. Do not skip.**
3. `supabase/migrations/0003_seed.sql` — the current catalogue
4. `supabase/migrations/0004_create_order.sql` — order creation
5. `supabase/migrations/0005_storefront_fields.sql` — fields the shop renders
6. `supabase/migrations/0006_catalogue_content.sql` — descriptions, specs, images

Or, with the CLI: `supabase db push`.

To confirm the security took, go to **Table Editor** and check every table shows
“RLS enabled”. If `orders` ever shows RLS *disabled*, customer names and
addresses are readable by anyone with the anon key — which is in the page source.

## 3 · Create staff accounts

**Authentication → Providers → Email → turn OFF “Enable signups”.** This matters.
With signups on, anyone could create an account.

Then **Authentication → Users → Add user** for each employee, and for each one run:

```sql
insert into public.staff (id, email, full_name, role)
values ('<paste the user id>', 'shawn@klovrprecision.com', 'Shawn', 'owner');
```

Being signed in is not enough — the staff row is what grants access. Someone who
authenticates without a staff row is signed straight back out.

## 4 · Set the Netlify environment variables

Netlify → **Site configuration → Environment variables**:

| Variable | Where it comes from | Goes to |
|---|---|---|
| `SUPABASE_URL` | Project Settings → API → Project URL | browser + functions |
| `SUPABASE_ANON_KEY` | Project Settings → API → anon/public | browser + functions |
| `SUPABASE_SERVICE_KEY` | Project Settings → API → **service_role** | **functions only** |

The anon key is meant to be public — row level security is what protects the
data, not the key. **The service_role key bypasses RLS entirely.** It is only
ever read inside `netlify/functions/`. `build.js` will not inject it into any
page, and nothing should ever make it do so.

Redeploy. The build log will say `wired to Supabase` instead of `prototype`.

## 5 · The build hook

The storefront is static, so a price changed in `/admin` is in the database
immediately but not on the site until the next build. The Publish button closes
that gap.

Netlify → **Site configuration → Build & deploy → Build hooks → Add build hook**.
Name it `admin-publish`, branch `main`. Copy the URL and add it as an
environment variable:

| Variable | Value |
|---|---|
| `NETLIFY_BUILD_HOOK` | the hook URL |

**Anyone holding that URL can trigger builds**, so it stays in the environment.
The browser never sees it — `/admin` calls `netlify/functions/rebuild.js`, which
checks the caller is staff and then calls the hook on their behalf.

Once set, the Products page shows whether anything is waiting and who published
last. Editing several prices and publishing once is the intended rhythm; that is
why it is a button rather than a database trigger.

> If you would rather it were automatic, Supabase **Database Webhooks** can POST
> the hook on any change to `products`. Expect a build per edit.

## 6 · QuickBooks (optional, do it last)

Create an app at [developer.intuit.com](https://developer.intuit.com), then add:

| Variable | Value |
|---|---|
| `QB_CLIENT_ID` | from the Intuit app |
| `QB_CLIENT_SECRET` | from the Intuit app |
| `QB_REDIRECT_URI` | `https://<your-site>/.netlify/functions/qb-callback` |
| `QB_ENV` | `sandbox` while testing, `production` when live |
| `QB_STATE_SECRET` | any long random string |

The same redirect URI must be registered in the Intuit app, exactly.

Start in **sandbox**. Connect from `/admin` → QuickBooks → Connect. Tokens are
written to `qb_connection`, a table with RLS on and *no policies at all*, so the
browser cannot read it even when signed in as staff. Only the functions can.

---

## What is still to build

- **FFL lookup.** Checkout lists three example dealers. Replace with a query
  against ATF FFL eZ Check, cached into `ffl_dealers` with `verified_at`.
That is everything. The remaining item is FFL lookup, above.

## Rollback

Clear `SUPABASE_URL` in Netlify and redeploy. The admin returns to prototype
mode. Nothing in the database is touched.
