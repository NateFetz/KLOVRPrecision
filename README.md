# KLOVR Precision — website

Design mockup for the KLOVR Precision storefront. Single static page, no build step.

## Layout

| Path | What it is |
|---|---|
| `site/` | **Deployed to Netlify.** `index.html` plus optimised imagery in `site/web/`. |
| `logo/` | Supplied brand vectors. Inlined into the page; kept here as the source of truth. |
| `photos/` | Original camera files (2048 px). Source for `site/web/` — not deployed. |
| `docs/` | Internal notes. Not deployed. |
| `netlify.toml` | Publish config and cache headers. |
| `serve.js` | Local preview: `node serve.js` then open http://localhost:8787 |

## Regenerating web imagery

`site/web/` holds two sizes per shot — full and `-sm` for mobile — wired up with
`srcset`. A phone pulls ~1.0 MB instead of ~2.9 MB. To rebuild from an original:

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
product uses real photography.
