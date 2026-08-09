# Pokopia Companion

A static web app for [Pokémon Pokopia](https://www.pokemon.com/) that helps you pick furniture for your habitats.

Live app: enable GitHub Pages for this repo (Settings → Pages → Source: GitHub Actions) and it will publish automatically via `.github/workflows/pages.yml` on every push to `main`.

## Features

- **Matcher** — pick the Pokémon you want to house together and see which items appeal to them, tiered by how many Pokémon each item satisfies.
- **Optimizer**
  - *Item Efficiency* — for every Pokémon, the best 1 Decor + 1 Relaxation + 1 Toy combo and whether it clears the moving-in threshold.
  - *Habitat Blueprints* — the 8 possible habitats (one pick from each of the Bright/Dark, Warm/Cool, and Humid/Dry axes), with the top items per slot ranked by total impact across every compatible Pokémon.
  - *Group Efficiency* — Pokémon within a chosen habitat are clustered by shared preferences into small groups, each with a greedily-computed item set sized to that group's spatial item budget.

All of this is computed client-side from `data/pokopia-data.json` — no backend, no build step.

## How the scoring works

Each Pokémon has 5 favorite preference tags (e.g. "Lots of water", "Cute stuff"). Each item carries a handful of tags. **QP** (quality points) for a Pokémon/item-set pair is the sum of tag matches across every item in the set; a Pokémon is considered willing to move in once its QP reaches **4**. This mirrors the thresholds used by the original single-file prototypes this project replaces.

## Project structure

```
index.html            shell + tab navigation
css/style.css          all styling
js/data.js              fetches data/pokopia-data.json
js/matcher.js            Favorites Matcher view
js/optimizer.js          Item Efficiency / Habitat Blueprints / Group Efficiency views
data/pokopia-data.json  categories, items, and Pokémon (with favorites + ideal habitat)
```

## Data provenance

`data/pokopia-data.json` was rebuilt from a full set of individually-saved Serebii "Favorites" pages — one per preference category (all 43), each listing every item and every Pokémon that has that category as a favorite. Current counts: 726 items, 365 Pokémon, 43 preference categories, a per-Pokémon ideal habitat, and (unused by the UI so far, but included) a per-Pokémon "specialty" job tag. Reflects the game's state as of **2026-08-09** (`data.meta.sourceDate`).

A small number of items (19) and one Pokémon (Ditto) don't appear on any of the 43 category pages — either because they have zero favorite tags (Ditto) or because their tags are terrain/road pieces outside the 43 preference categories — so they're carried over unchanged from the prior snapshot rather than dropped. If you have a newer export, replace `data/pokopia-data.json` (keeping the same shape) and everything else keeps working unchanged.

## Local development

Any static file server works, e.g.:

```
python3 -m http.server 8000
```

then open `http://localhost:8000`.
