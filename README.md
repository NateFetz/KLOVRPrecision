# KLOVR Precision — website

Static site. One HTML source, a small Node build that emits a real page per route.

## Layout

| Path | What it is |
|---|---|
| `site/index.html` | **The source.** All markup, styles, and behaviour. |
| `site/web/` | Optimised imagery, two widths per shot (`-sm` is the mobile one). |
| `build.js` | Emits `dist/` — one indexable HTML file per route, plus sitemap and robots. |
| `logo/` | Supplied brand vectors. Inlined into the page; kept here as the source of truth. |
| `photos/` | Original camera files (2048 px). Source for `site/web/` — not deployed. |
| `docs/` | Internal notes. Not deployed. |

## Tests and CI

```bash
node tests/all.js
```

Nine suites, about 300 assertions, under two seconds. No dependencies, nothing to
install — plain Node, a fake PostgREST where a database is needed, and
throwaway builds into temp directories where the build itself is under test.

| suite | what it holds down |
|---|---|
| `checkout-rules` | where a thing may go — every restricted item against every state it may not reach, both step gates, dealer-state vs ship-to-state |
| `create-order` | the server refusing the same orders independently |
| `guards` | the build's refusals: policy drafts, measurement, addresses, photos |
| `business-schema` | how much the site claims about the shop, and when |
| `avif` | a rendition for every photo and markup that pairs them |
| `collect` | what measurement will and will not write down |
| `product-editor` | form → row → storefront, and that the two mappers agree |
| `order-notify` | what the order emails say, and that a failure to send is recorded |
| `build-from-supabase` | a price changed in `/admin` reaching the built pages |

`.github/workflows/ci.yml` runs all of it on every push and pull request.
Netlify already fails a deploy when the build throws; what it cannot catch is a
build that succeeds and is wrong — a checkout gate that stopped blocking a
restricted state, a photo whose AVIF was never encoded, a draft policy that
shipped as final. That is what CI is for here.

The checkout suite is worth understanding before editing it. It re-implements
nothing: the predicates and **both step gates are read verbatim out of
`site/index.html`** and evaluated, so changing a gate changes what is tested,
and moving one past the anchors fails the run rather than leaving a stale copy
passing. It also compares the no-ship lists in the page against the ones in
`0003_seed.sql`, because the storefront and the database enforcing different
rules is the failure nobody would notice until a customer hit it.

## Local

```sh
node build.js && node serve.js     # http://localhost:8787
node tests/create-order.test.js        # order function
node tests/build-from-supabase.test.js # publish loop
# neither needs a real database
```

## Search

Searches products, the pages people actually look for, and upcoming calendar
events. Type-ahead in the header; full results at `/search?q=…` (noindex).

Ranking is weighted by where a term appears — name and SKU beat category, which
beats summary, which beats description and specs — and a match at a word start
outscores one buried mid-word, so "bolt" puts the bolt assembly above the
actions that merely mention a fluted bolt. Every term must appear somewhere, so
adding words narrows rather than widens.

Specs are indexed, which means "20 moa" finds the action.

**The query comes from the URL, so it is escaped before it is rendered, every
time.** `mark()` escapes first and highlights second — never the other way
round. There is a test case for this: a query of `<img src=x onerror=…>`
renders as literal text and injects nothing.

To add a page to the index, add it to `SEARCH_PAGES`.

## Publishing

`build.js` reads the catalogue from Supabase when `SUPABASE_URL` and
`SUPABASE_ANON_KEY` are set, and from the `SHOP` array in `site/index.html`
otherwise. Either way the page ships the same catalogue it was built from, so
the shop grid and the product pages cannot disagree.

Only live products are readable with the anon key, which is exactly what a
storefront needs — no service key at build time. An empty response fails the
build rather than publishing an empty shop.

Because the site is static, an edit in `/admin` is in the database at once but
on the site only after a rebuild. The Products page shows what is waiting and a
Publish button calls `netlify/functions/rebuild.js`, which checks the caller is
staff before triggering the Netlify build hook. The hook URL never reaches a
browser.

`node tests/build-from-supabase.test.js` proves the loop against a fake
PostgREST — no real project needed.

## The business — one source of truth

Every fact about the shop lives in the `BIZ` block at the top of the script in
`site/index.html`: name, address, phone, email, FFL number, opening hours,
social links. Nothing else hardcodes them. `build.js` reads the block and fills
the contact page, the hours table, the phone in the header and the footer block
at build time, so the values are in the HTML a crawler reads rather than being
painted in later by JavaScript.

Unknown facts are `null`, and a `null` renders as the same gold marker the
policy pages use. Today that is the address, city, ZIP, phone, email and FFL.
Region and country are known from the outset.

How much structured data gets emitted depends on how much is filled in:

| BIZ state | Homepage schema |
|---|---|
| as it ships | `Organization` — name, logo, description, URL |
| `street`+`city`+`postal`+`tel` set | `Store`, with `PostalAddress` |
| `geo` also set | adds `GeoCoordinates`, so the shop can pin on a map |
| `hoursConfirmed:true` | adds `openingHoursSpecification` |
| `social.*` set | adds `sameAs`, and the footer icon becomes a real link |
| `calendarConfirmed:true` | `/calendar` emits an `Event` per entry |

The gating is the point. A search engine that finds three versions of an address
trusts none of them, and an `Event` in a results page is a promise that
something happens at a time and a place. So:

- A **partial address fails the build**. All of `street`, `city` and `postal`, or
  none of them.
- `tel` must be E.164 (`+1` then ten digits) and must come with `telText`, the
  form it reads as on the page. The E.164 value is what `tel:` dials.
- `geo` needs numeric `lat` and `lon` — right-click the pin in Google Maps.
- Opening hours and the calendar each sit behind their own flag, because both
  were written to fill the page. Structured data built on a guess sends
  somebody to a locked door.

The build prints which level it emitted. `node tests/business-schema.test.js`
builds a doctored copy of the source both ways and checks all of it — 41
assertions, no network, no database.

Filling the block in also switches off four of the "not linked yet" toasts: a
social entry with a URL becomes a real `rel="me"` link, and the ones still
`null` keep the honest fallback.

## Custom domain

The canonical URL, the sitemap, `robots.txt` and every Open Graph image URL
come from `SITE`, which reads Netlify's own `URL` variable. So attaching the
domain is all it takes — nothing in the repo needs editing:

1. Register `klovrprecision.com`.
2. Netlify → Domain management → Add a domain, then point the registrar's
   nameservers at Netlify (or add the CNAME/A records it gives you).
3. Let Netlify issue the certificate, then set the custom domain as primary so
   `*.netlify.app` redirects to it rather than competing with it.
4. Trigger a deploy. Canonicals, sitemap and cards follow automatically.
5. Set up mail on the domain and put the address in `BIZ.email` — the contact
   form's failure message already tells people to write to
   `shop@klovrprecision.com`.

Until then everything resolves to `klovrprecision.netlify.app`, which is
correct but is also what gets indexed, so the sooner the domain is attached the
less there is to redirect.

## Sticky header

The header and the nav both pin to the top, so the nav's offset comes from
`--head-h`, published by `measureStack()` and kept current by a ResizeObserver.
Sticky sidebars use `--stick-h`, the height of both together. Hard-coding either
breaks the moment the mobile search row opens, which changes the header height
by 21px.

The header sits above the nav in z-order so the search dropdown is not clipped
by it — a child cannot escape its parent's stacking context, so the header has
to win.

## Keyboard and motion

- **Focus is trapped** in the nav drawer and the event panel, and the rest of
  the page is `aria-hidden` while either is open. Tab wraps at both ends and
  focus returns to wherever it came from on close. Without this, Tab walked out
  of the drawer into the page behind it, invisibly.
- **A skip link** is the first thing in the document.
- **The carousel can be stopped.** It auto-advances every 7 seconds, and the
  control bottom-right pauses it. It starts paused, and refuses to start, where
  the visitor has asked for reduced motion.

## Calendar

Classes, range days, matches, shop hours, trade shows, and build slots, in
`EVENTS` near the top of the calendar module. Month grid on desktop, list on
anything under 900px — decided when it renders, not once at load, so a rotated
phone gets the right one.

Each event offers a `.ics` download built in the browser, so it lands in
whatever calendar the visitor actually uses. Multi-day events set an exclusive
`DTEND`, per RFC 5545.

Events live in the page for now. Moving them to Supabase would follow the same
pattern as the catalogue: a table, a fetch in `build.js`, a publish.

> The opener-weekend entry deliberately points at Utah DWR rather than asserting
> a date. Season dates vary by unit and change yearly; a website should not be
> the thing someone plans a hunt around.

## Dealer directory

Checkout searches real licensed dealers by ZIP. The directory is the ATF listing
of active FFLs, imported by `scripts/import-ffl-list.js` — **eZ Check has no
API**, so nothing here contacts ATF at request time.

Only licence types that can receive a transfer are kept (01, 02, 07, 08, 09, 10,
11). Types 03 collector and 06 ammunition manufacturer are dropped, because
neither can take one. Expired licences fall out of search on their own.

Proximity without geocoding: exact ZIP beats a shared 4-digit prefix, which
beats a shared 3-digit prefix, which beats same state.

`find_ffls()` is security-definer and returns only the columns a customer needs;
`ffl_dealers` itself stays staff-only. Until the directory is imported, checkout
shows example dealers and says so.

Confirming a licence is current is a manual eZ Check lookup. `/admin` links
straight to it and records who checked and when.

## Print

The site is dark by design; paper is not. `@media print` redefines the colour
tokens to a paper palette, which inverts the whole thing in one place rather
than overriding a hundred rules. Interface that means nothing on paper — nav,
carousel, buttons, option grids, the toast — is hidden.

The build sheet is the reason this exists. Printing `/custom-rifles` gives a
numbered spec list with every selection, the line-item pricing, the FFL notice,
and the shareable URL for that exact spec, under a masthead that replaces the
logo (which is ivory-on-dark and would vanish).

To look at it without a printer, copy a built page and swap `@media print{` for
`@media screen{`.

## Not found

`build.js` writes `dist/404.html`, which Netlify serves for any unmatched path.
`pathView()` returns `notfound` for an unrecognised URL rather than falling back
to the front page — otherwise a bad link would quietly render the homepage at
the wrong address. Paths ending `.html`, and anything opened over `file:`, are
treated as the front page so opening the build straight off disk still works.

`serve.js` mirrors Netlify and serves `404.html` with a 404 status, so this is
testable locally.

## Sharing a build

A spec encodes as the option codes that already exist, joined by dashes:

```
/custom-rifles?b=3WM-MA-CF-26-SGE-450-SUP-CB
```

Twenty-seven characters, readable, and short enough to text. Changing any option
rewrites the URL with `replaceState`, so the address bar always holds the current
spec without filling the back button. Opening such a link restores it and says
so; editing anything dismisses that notice.

Decoding is deliberately forgiving — an unrecognised segment falls through to
the default rather than throwing, so a truncated or mangled link still produces
a valid rifle. `?b=3WM` alone sets the chambering and leaves the rest.

**Save build** keeps a spec in `localStorage` (twelve at most), named by
chambering, barrel, and finish so two rows never read the same. **Copy link**
uses the native share sheet where there is one and the clipboard otherwise, with
a `textarea` fallback for older browsers.

To add a step to the code, append its key to `CODE_ORDER`. Existing links keep
working — a missing trailing segment just takes the default.

## Stock and confirmations

Adding to the cart raises a confirmation in an `aria-live` region with a link
straight to the cart. It clears itself after four seconds, five for a warning,
and pauses while the pointer is over it.

Stock is capped where the mistake happens rather than at checkout:

- `maxQty()` is the ceiling — what is on the shelf, or 99 for built-to-order
- adding past it refuses and says how many there are
- typing a quantity into the cart clamps to the ceiling
- the stepper's `+` disables at the cap and the line says "All 6 of our stock"
- a product with no stock shows **Out of stock** and its button is disabled

`create_order()` re-checks all of this server-side. The browser copy is for the
person; the database copy is the rule.

## Ordering

Checkout posts SKUs, quantities, and a destination to
`netlify/functions/create-order.js`. **It never sends prices, and any price it
sends is ignored.** The function strips the request down to `{sku, qty}` and
hands it to `create_order()` in Postgres, which prices the order from the live
catalogue and re-checks the rules in one transaction:

- an item that may only go to a dealer cannot be on a door order
- nothing may go to a state on its own no-ship list
- nothing that is not live, or not in stock, can be ordered

Those checks exist in the browser too, for a decent experience — but the
browser's copy is a courtesy. This one is the rule.

Until `SUPABASE_URL` is set the checkout falls back to posting a Netlify Form
and the shop confirms by hand. No code change is needed to switch.

## Routes

`build.js` generates each of these as its own file with its own `<title>`,
meta description, canonical, and Open Graph card. Client-side navigation still
runs via the History API, so links are instant, but crawlers and no-JS visitors
get a complete page.

`/` · `/shop` · `/custom-rifles` · `/gallery` · `/calendar` · `/contact`
`/transfers` · `/shipping-returns` · `/warranty` · `/terms` · `/privacy` — see
Policy pages below; noindex until approved
`/cart` · `/wishlist` · `/checkout` — noindex, kept out of the sitemap
`/product/<id>` — one per catalogue item, pre-rendered with Product schema

The homepage carries `Organization` or `Store` schema and `/calendar` can carry
`Event` schema — see The business below for what governs which.

Product pages are generated from the `SHOP` array read straight out of
`site/index.html`, so the catalogue has one source of truth. To add an item,
add it to `SHOP`; the page, sitemap entry, and schema follow automatically.

Built pages carry `<base href="/">` so relative asset paths resolve at any
route depth — without it, `web/x.jpg` on `/product/foo` looks for
`/product/web/x.jpg`.

## Policy pages

Five of them: `/transfers`, `/shipping-returns`, `/warranty`, `/terms`,
`/privacy`. They are **drafts**, and they are written to be finished rather
than admired:

- Every fact only the shop can supply is wrapped in `<span class="tbd">`, which
  renders as a gold marker. There are 57 of them. Return windows, the warranty
  term, the definition of the sub-MOA guarantee, the arbitration decision, how
  long a held firearm is stored.
- Each page carries a `[data-draft]` notice saying so, visible to anyone who
  opens it.
- All five are `noindex` and stay out of the sitemap.

When they are settled, set `POLICIES_FINAL=1`. That strips the draft notices,
drops the `noindex`, adds them to the sitemap — and **fails the build if any
`tbd` marker is left**, so a blank cannot reach a customer by accident.

```bash
POLICIES_FINAL=1 node build.js
```

`/terms` and `/privacy` in particular are a starting point, not legal advice.
The liability cap, the governing-law clause and the state-privacy-rights
paragraph need a Utah attorney before that flag gets set.

Two consistency guards run on every build. `POLICIES_FINAL=1` with an
unresolved marker fails, as above. Setting `PLAUSIBLE_DOMAIN` while the privacy
page still claims the site runs no third-party analytics also fails — turning
tracking on has to come with rewriting the paragraph that says it is off.

## Cart, wishlist, checkout

Cart and wishlist live in `localStorage` — per device, never sent anywhere until
checkout. The cart splits lines by fulfilment: items marked `ffl` can only be
delivered to a licensed dealer, everything else ships direct.

Checkout runs contact → delivery → compliance → review. The compliance step
checks each item's `noShip` list against its actual destination (the ship-to
state for direct items, the dealer's state for firearms) and blocks the order if
anything is not permitted. Both attestations must be ticked to continue.

No payment is taken. The final step posts an order request, since card
processing needs the merchant account. See `docs/payments-integration.html` for
what wiring that up involves.

The dealer list in checkout is example data. At launch it should query the ATF
FFL eZ Check list by ZIP and verify the licence is current.

## Forms

All three forms are Netlify Forms — no backend. Submissions land under
**Netlify → Forms**, and you can add email notifications there.

- **contact** — name, email, topic, details.
- **build-request** — contact details plus the full configurator spec, the build
  code, and the estimate, so a quote request arrives ready to read.
- **order-request** — cart contents, total, ship-to address, and the receiving
  dealer including licence number.

Both post over `fetch` and show an inline result. Each carries a honeypot field
for spam.

## Adding a product

`/admin` → Products → **Add product**, or click one to edit it. The editor
covers everything the storefront renders: name, the line under it, SKU,
category, which filter tab it sits in, sort order, price, stock or
made-to-order with its own wording, visibility, delivery route, restricted
states, a note, the description paragraphs, the specification table, and the
photographs. Save, then **Publish to storefront** to rebuild the site.

Photographs upload to Supabase Storage, so adding a product needs no commit.
The trade is that they are served as uploaded: photos in `site/web/` ship with
an AVIF rendition beside them and these cannot, because there is no AVIF
encoder on a Linux build box. The build prints how many are in that state. To
optimise them later, drop the originals into `site/web/`, run
`node scripts/make-avif.js` on a Mac, commit, and point the product at the repo
path instead.

Three things the editor refuses, because each one reaches a customer as a
broken page: a product with no SKU or name, a *live* product with no price or
no description, and a SKU that is not lower-case letters, numbers and hyphens —
it becomes the web address. The database refuses more: state codes that are not
real states, specs that are not pairs of strings, and a live product missing a
name or SKU. Delivery is the one field with consequences beyond a scruffy page,
so it is a select, not a checkbox: anything marked for a dealer cannot be sent
to a home address, and both the cart and `create_order` enforce it.

**One catalogue, one list.** The prototype's seed products and the editor's
filter menu are both injected from `site/index.html` at build time. They used
to be hand-maintained copies and both had drifted — the filter menu offered
seven of the nine keys in use, so opening a product filed under a missing one
showed the wrong filter and silently refiled it on save. The build now fails if
the catalogue uses a filter the shop has no chip for.

## Order notifications

An order that lands in a table nobody opened is the same as no order. When one
is placed, `create-order.js` sends two emails:

- **To the shop** — reference, customer and how to reach them, the dealer or the
  shipping address, the line items and subtotal, and a link into `/admin`. The
  reply-to is the customer, so answering it answers them. For a firearm it says
  to confirm the dealer licence is current.
- **To the customer** — the same order and reference, where it is going, and the
  part that matters: nothing has been charged, we will confirm stock and come
  back about payment. It does not promise tracking, because there is none yet.

Both are sent **after the order is committed**, so email can never lose an
order. When it fails the order still succeeds and the customer still gets their
reference — but the row records why nobody was told, and `/admin` marks it
**not emailed** in red on the order list and in the panel. An invisible failure
here means a customer waiting on a reply that was never sent, so it is made
loud instead.

Three environment variables in Netlify:

| | |
|---|---|
| `RESEND_API_KEY` | from resend.com |
| `MAIL_FROM` | `orders@klovrprecision.com` — needs the domain verified with Resend first |
| `ORDER_NOTIFY_TO` | where the shop's copy goes |

Unset is a valid state: the function logs what it would have sent and marks the
order accordingly. Swapping providers is the `send` function in
`netlify/functions/lib/mail.js` and nothing else — everything upstream deals in
`{to, subject, text, html}`.

**Until Supabase is configured**, checkout posts a Netlify Form instead and no
function runs. Turn on form notifications in Netlify → Forms → Settings so the
shop at least hears about those; the customer gets nothing on that path, which
is one more reason to finish the Supabase setup.

`select * from unnotified_orders;` lists anything nobody has been told about,
oldest first. If it returns rows, somebody is waiting.

## Measurement

First-party, on purpose. The privacy page tells customers this site runs no
third-party trackers, and firearms customers have a particular reason to care
who holds a list with their name on it. Events go to
`netlify/functions/collect.js` and into `site_events` in the shop's own
database. No vendor, no account, no monthly fee, and that sentence on the
privacy page stays true.

It is **off until `SUPABASE_URL` is set**, and `ANALYTICS=off` switches it off
again. The build prints which on every deploy. A visitor whose browser sends
Global Privacy Control or Do Not Track is never recorded, and if `sessionStorage`
is unavailable — a locked-down private window — the page measures nothing rather
than falling back to something more persistent.

**The twelve events.** Adding one means adding it to the allow-list in
`collect.js` as well as the page, deliberately, so nothing starts being
collected by accident:

`page` · `search` · `product_view` · `add_to_cart` · `remove_from_cart` ·
`checkout_step` · `order_sent` · `build_step` · `build_saved` · `build_shared` ·
`build_submitted` · `ffl_search`

**What is never written down**, whatever the browser sends: IP addresses, user
agent strings, full referrer URLs, city-level location, and the ZIP typed into
the dealer finder — that last is the closest thing on the site to a home
address, so `ffl_search` records only how many dealers came back. Kept
alongside each event: country and state (a shop with shipping restrictions has
a real use for the state), phone-or-computer, and the referring host — 
`duckduckgo.com`, never the URL.

**No cookie and no visitor id.** A random value in `sessionStorage` lets a
funnel count one person once. It dies with the tab, is never joined to an order
or a customer, and cannot recognise anyone on a later visit.

The collector is public and unauthenticated, so it assumes the caller is
hostile: every event name is on an allow-list, every property is validated
against that entry's shape, strings are truncated, numbers clamped, batches
capped at 30, and the endpoint returns 204 and nothing else whatever happens.
`site_events` has no insert policy at all — writes are `service_role` only.

**The admin's Insight page** answers five questions: where checkout loses
people, which searches found nothing, what people actually spec in the
configurator, views against add-to-carts per product, and everything recorded.
Searches that found nothing is the most directly useful of those — it is a list
of what people came for and did not get.

Retention: nothing prunes itself. `select prune_site_events(400);` drops
anything older than 400 days; schedule it in Supabase → Database → Cron.

`node tests/collect.test.js` covers all of it — 34 assertions, including that an
IP, a user agent, a city and a ZIP cannot reach a row even when sent
deliberately. The privacy page's promises, expressed as code.

**If you would rather have a hosted tool as well**, `PLAUSIBLE_DOMAIN` still
injects Plausible — but the build will refuse until the "no third-party
analytics" paragraph on the privacy page is rewritten, because setting that
variable makes it false.

## Regenerating web imagery

```sh
sips -Z 1800 -s formatOptions 72 photos/DSC01746.jpg --out site/web/hero-rifle.jpg
sips -Z  820 -s formatOptions 68 site/web/hero-rifle.jpg --out site/web/hero-rifle-sm.jpg
node scripts/make-avif.js
```

Widths in use: hero 1800/820 · gallery 1400/700 · cards 900/520 · portraits 1100/620.
`photos/MANIFEST.tsv` maps every web filename back to the camera original.

**Run `node scripts/make-avif.js` after touching any photo.** The build refuses
to run if a `.jpg` has no `.avif` beside it.

## AVIF

Every photo ships twice. `<picture>` offers the AVIF; the `<img>` inside it
still points at the JPEG, so anything that cannot decode AVIF gets the JPEG
without a round trip. What a visitor actually downloads:

| | JPEG | AVIF | |
|---|---|---|---|
| homepage, phone widths | 343KB | 100KB | 71% less |
| homepage, desktop widths | 1167KB | 259KB | 78% less |
| all 60 renditions | 9.1MB | 2.0MB | 78% less |

Quality is 55 (`AVIF_Q` overrides it). At that setting the burnt bronze keeps
its surface gradient and the bolt fluting stays crisp, which is the point —
these photos are the product.

Three things to know:

- **The AVIFs are committed.** They are made with macOS `sips`, and Netlify
  builds on Linux where there is no encoder. `scripts/make-avif.js` only
  re-encodes what has changed, so re-running it is cheap.
- **`sips` cannot write WebP** — it can write AVIF, which compresses harder and
  is supported everywhere that matters now. If you ever need WebP too,
  `brew install webp` and add a `cwebp` pass.
- **A `<picture>` whose `<source>` 404s shows nothing at all.** Format fallback
  is decided by what the browser supports, not by whether the fetch worked. So
  `build.js` verifies every AVIF it is about to reference — including the ones
  the catalogue names for images rendered at runtime — and fails with the
  command to run if any are missing.

Static markup is wrapped at build time by `offerAvif()`; images the page renders
at runtime go through `pic()` in the page script, which applies the identical
rule. `setPic()` moves both halves together when a thumbnail swaps the hero.
`picture{display:contents}` keeps the wrapper out of layout, so every rule that
sizes an image against its container still measures the container.

`node tests/avif.test.js` checks the lot: a rendition for every photo, real AVIF
headers, matching dimensions, srcset widths that agree between the two lists,
nothing left unwrapped, and the guard firing when a file is missing.

## Staff area — `/admin`

**Interface prototype only. There is no authentication.** Sign-in accepts
anything, records live in `localStorage`, and the QuickBooks connection is
simulated. It is `noindex` and disallowed in robots.txt, but that is not
security — do not put a real customer record near it as it stands.

Built as its own document (`site/admin.html`) so it never ships in the bundle
public visitors download. Design tokens and the logo are injected from
`site/index.html` at build time, so the two cannot drift.

What it covers: orders with a status pipeline and per-order detail, shipments
split by whether they go to a dealer or a customer, product management
(pricing, stock, delivery rules, visibility), and a QuickBooks panel with item
mapping and an activity log.

### Going live

The backend is written and waiting: schema, security policies, and the
QuickBooks functions are all in the repo. See **`docs/SUPABASE-SETUP.md`** for
the five steps that need your account.

| Path | What it is |
|---|---|
| `supabase/migrations/0001_schema.sql` | Tables. Money in integer cents. |
| `supabase/migrations/0002_rls.sql` | Row level security. The important one. |
| `supabase/migrations/0003_seed.sql` | Current catalogue |
| `netlify/functions/qb-*.js` | QuickBooks OAuth and invoicing |

`/admin` runs on sample data until `SUPABASE_URL` and `SUPABASE_ANON_KEY` are
set in Netlify, then becomes real with no code change. Clearing them rolls it
back.

**The `service_role` key never goes in a page.** `build.js` injects only the URL
and anon key; the service key is read exclusively inside `netlify/functions/`.
The `qb_connection` table, which holds OAuth refresh tokens, has RLS enabled and
no policies at all — so only the service key can reach it.

QuickBooks target is **QuickBooks Online**; Desktop would need the Web Connector
instead and is materially more limited.

## Spacing

One 4px scale, exposed as tokens. Use these rather than inventing values:

| Token | | Used for |
|---|---|---|
| `--s1`–`--s8` | 4 · 8 · 12 · 16 · 20 · 28 · 40 · 56 px | component-level spacing |
| `--gut` | clamp(20, 4vw, 40) | page gutter |
| `--sec` | clamp(40, 6vw, 88) | vertical rhythm between sections |
| `--pad-box` | clamp(16, 2.2vw, 24) | inner padding for panels and cards |

### Product photography

Three renditions per shot, all generated from the originals so nothing is ever
upscaled:

| Suffix | Width | Used for |
|---|---|---|
| `-sm` | 520–820 | phones, via `srcset` |
| *(none)* | 900–1800 | desktop |
| `-xl` | 1800 | the lightbox only |

`-xl` is fetched only when someone opens the lightbox, so the page pays nothing
for 5.3 MB of detail that most visitors never ask for.

`photos/MANIFEST.tsv` maps every web name back to its original camera file. Use
it when regenerating — the mapping is not recoverable from the filenames.

### Colour and contrast

Measured, not eyeballed. Every pair below clears WCAG AA on the darkest surface
it appears on:

| | Ratio | Needs |
|---|---|---|
| `--muted` on panels | 5.05 | 4.5 (small text) |
| `--line` on panels | 3.14 | 3 (controls) |

Two border tokens, and the distinction matters:

- **`--rule`** — decorative dividers, card edges, table rows. 1.35:1 and that is
  fine; a separator is not an interface component.
- **`--line`** — anything a person operates: inputs, chips, ghost buttons,
  quantity steppers, swatches, thumbnails, dots. Clears 3:1 so the boundary is
  actually visible.

If you add a control, give it `--line`. If you add a divider, `--rule`.

### Safe areas

The viewport is `viewport-fit=cover`, so the page paints under the notch and the
home indicator. Anything touching an edge must account for it:

- `.wrap` gutters use `max(var(--gut), var(--safe-l/r))`
- the fixed build-total bar adds `var(--safe-b)` to its bottom padding
- the drawer adds `var(--safe-l)` padding and widens to match
- the footer adds `var(--safe-b)`

`--safe-*` resolve to `0px` on everything that is not an iPhone, so these are
safe to use anywhere.

## Brand

Colours come from the supplied vector files and should not be sampled by eye:

| | |
|---|---|
| Dark green | `#003513` |
| Sage | `#769F76` |
| Gold | `#D2A85F` |
| Ivory | `#EDECED` |

The logo is used unmodified. Its viewBox is trimmed to the artwork bounds so it
renders at a usable size; the clear space the guidelines require is reproduced as
CSS padding rather than baked into the file.

## Still placeholder

Pricing, address, phone, FFL number, inventory counts, and the dealer catalogue
(optics, mounts, ammunition, gear, suppressors) are stand-ins. Every KLOVR-made
product uses real photography.

There is no longer any on-page notice saying so, so treat the site as if a
customer will read those numbers as real — swap them before it goes anywhere
public-facing.
