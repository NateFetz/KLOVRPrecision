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
```

## Routes

`build.js` generates each of these as its own file with its own `<title>`,
meta description, canonical, and Open Graph card. Client-side navigation still
runs via the History API, so links are instant, but crawlers and no-JS visitors
get a complete page.

`/` · `/shop` · `/custom-rifles` · `/gallery` · `/contact`
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

## Spacing

One 4px scale, exposed as tokens. Use these rather than inventing values:

| Token | | Used for |
|---|---|---|
| `--s1`–`--s8` | 4 · 8 · 12 · 16 · 20 · 28 · 40 · 56 px | component-level spacing |
| `--gut` | clamp(20, 4vw, 40) | page gutter |
| `--sec` | clamp(40, 6vw, 88) | vertical rhythm between sections |
| `--pad-box` | clamp(16, 2.2vw, 24) | inner padding for panels and cards |

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
