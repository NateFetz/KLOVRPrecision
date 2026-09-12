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

To add or reword one, edit the `ROUTES` array at the top of `build.js`.

## Forms

Both forms are Netlify Forms — no backend. Submissions land under
**Netlify → Forms**, and you can add email notifications there.

- **contact** — name, email, topic, details.
- **build-request** — contact details plus the full configurator spec, the build
  code, and the estimate, so a quote request arrives ready to read.

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
product uses real photography. A short disclosure to this effect sits in the
page footer — remove it when the real details go in.
