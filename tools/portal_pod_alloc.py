"""Recompute data/portal-pod.json slot counts from data/recipes.json.

Goal: when out in the field, any everyday recipe can be crafted from what's in the pod.
  1. Every material used by an in-scope recipe gets 1 slot (a full 99-stack covers any
     single craft).
  2. Remaining slots go to materials by demand, where demand reflects how things are
     actually crafted: furniture/decor is made ad hoc one at a time, but blocks, floors,
     walls, roofs, fences, stairs, paths, pillars, pipes etc. are always made in bulk.

Out of scope: wallpaper versions of blocks (the "Other"-tab Paper x6 recipes), kits
(bought at the PC Shop, built on site), and one-off/situational items (Dowsing Machine,
Star Piece, legendary bells, armor, the Portal pod itself).

Bulk recipes are collapsed into style families — same function (wall, floor, roof...) and
same ingredients count once — so twenty fabric prints that all take Twine x2 don't count
as twenty separate builds.

Usage: python3 tools/portal_pod_alloc.py [--write]
"""
import json, math, re, sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POD_CAPACITY = 80
BULK_MULTIPLIER = 10  # a bulk build ≈ this many crafts of one piece

# Thumbnail ids (data/images/<id>.png) for materials not already in portal-pod.json.
NEW_IMG = {
    "Pokémetal": 465, "Rare Pokémetal": 483,
    "White rock": 1209, "Coarse rock": 1210, "Light brown rock": 1211, "Red rock": 1212,
    "Yellow rock": 1213, "Sandstone": 1216,
    "Leppa Berry": 1218, "Chesto Berry": 1219, "Rawst Berry": 1220,
    "Aspear Berry": 1221, "Pecha Berry": 1222, "Lum Berry": 1223,
}

SITUATIONAL = {
    "Dowsing Machine", "Neo-Dowsing Machine", "Star Piece", "Portal pod",
    "Clear Bell", "Tidal Bell", "Auspicious Armor", "Malicious Armor",
}

# Buildings-tab pieces you place one (or a few) of, not in bulk.
UNIT_BUILDING = re.compile(r"door|gate|window|hatch|curtain|skylight|decoration|pulley|shutter")

FAMILIES = [
    ("print", r"print"),
    ("roof", r"roof|awning|corrugated|eave"),
    ("fence", r"fenc|enclosure|railing|handrail|barrier|pole|partition|siding|posts"),
    ("steps", r"steps|ladder"),
    ("path", r"path|walkway|stepping|planks|border|bridge|slab|scaffold"),
    ("pillar", r"pillar|column|beam|support|log"),
    ("pipe", r"pipe"),
    ("line", r"wire|chain|rope"),
    ("wall", r"wall"),
    ("floor", r"floor|tiling|carpet|mat\b|marble|road|plating|hay|rug"),
]


def norm(name):
    # Bulbapedia writes "Light brown rock"; the recipe data writes it with a hyphen.
    return name.lower().replace("-", " ")


def is_wallpaper(r):
    return r["category"] == "Other" and r["materials"] == [{"name": "Paper", "qty": 6}]


def is_bulk(r):
    if r["category"] == "Blocks":
        return True
    return r["category"] == "Buildings" and not UNIT_BUILDING.search(r["name"].lower())


def family(r):
    base = re.sub(r"\s*\(.*?\)", "", r["name"].lower())
    fn = next((f for f, pat in FAMILIES if re.search(pat, base)), "block")
    mats = tuple(sorted((m["name"], m["qty"]) for m in r["materials"]))
    return fn, mats


def main():
    recipes = json.loads((ROOT / "data/recipes.json").read_text())
    pod = json.loads((ROOT / "data/portal-pod.json").read_text())

    in_scope = [r for r in recipes
                if r["category"] != "Kits" and r["materials"]
                and not is_wallpaper(r) and r["name"] not in SITUATIONAL]

    demand = Counter()
    families = defaultdict(list)
    for r in in_scope:
        if is_bulk(r):
            families[family(r)].append(r["name"])
        else:
            for m in r["materials"]:
                demand[m["name"]] += m["qty"]
    for (_, mats) in families:
        for name, qty in mats:
            demand[name] += qty * BULK_MULTIPLIER

    slots = {name: 1 for name in demand}
    for _ in range(POD_CAPACITY - len(slots)):
        best = max(demand, key=lambda n: demand[n] / slots[n])  # D'Hondt
        slots[best] += 1

    print(f"{len(in_scope)} recipes in scope, {len(families)} bulk families, "
          f"{len(slots)} materials, {sum(slots.values())} slots")
    current = {m["name"]: m["slots"] for m in pod}
    for name in sorted(set(slots) | set(current), key=lambda n: (-slots.get(n, 0), n)):
        print(f"  {name:26s} demand {demand.get(name, 0):5d}   now {current.get(name, 0)}  ->  {slots.get(name, 0)}")
    if "--write" in sys.argv:
        meta = {m["name"]: m for m in pod}
        items = json.loads((ROOT / "data/item-order.json").read_text())
        order = {}
        for i, it in enumerate(items):
            order.setdefault(norm(it["name"]), i + 1)
        out = []
        for name, n in slots.items():
            # Sort order = position in Bulbapedia's item list (data/item-order.json),
            # which follows the game's own bag order.
            if norm(name) not in order:
                sys.exit(f"{name!r} isn't in data/item-order.json; check the spelling")
            entry = {"name": name, "order": order[norm(name)]}
            img = meta.get(name, {}).get("img", NEW_IMG.get(name))
            if img is not None:
                entry["img"] = img
            entry["slots"] = n
            out.append(entry)
        out.sort(key=lambda m: m["order"])
        lines = ",\n".join("  " + json.dumps(m, ensure_ascii=False).replace('{"', '{ "').replace('}', ' }').replace('", "', '", "') for m in out)
        (ROOT / "data/portal-pod.json").write_text("[\n" + lines + "\n]\n")
        print("wrote data/portal-pod.json")
    return slots


if __name__ == "__main__":
    main()
