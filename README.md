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
`/cart` · `/wishlist` · `/checkout` — noindex, kept out of the sitemap
`/product/<id>` — one per catalogue item, pre-rendered with Product schema

Product pages are generated from the `SHOP` array read straight out of
`site/index.html`, so the catalogue has one source of truth. To add an item,
add it to `SHOP`; the page, sitemap entry, and schema follow automatically.

Built pages carry `<base href="/">` so relative asset paths resolve at any
route depth — without it, `web/x.jpg` on `/product/foo` looks for
`/product/web/x.jpg`.

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

## Analytics

Not wired up yet. Two options:

- **Netlify Analytics** — server-side, no code, nothing to block. Enable it in the
  site dashboard.
- **Plausible** — set a `PLAUSIBLE_DOMAIN` environment variable in Netlify and
  `build.js` injects the script automatically. No cookie banner needed.

## Regenerating web imagery

```sh
sips -Z 1800 -s formatOptions 72 photos/DSC01746.jpg --out site/web/hero-rifle.jpg
sips -Z  820 -s formatOptions 68 site/web/hero-rifle.jpg --out site/web/hero-rifle-sm.jpg
```

Widths in use: hero 1800/820 · gallery 1400/700 · cards 900/520 · portraits 1100/620.

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
