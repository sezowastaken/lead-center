"""Sector-diverse shuffled review deck.

The deck is built once, when a review session starts, and stored. Navigation never reshuffles.

Algorithm:
  1. group eligible business ids by sector and shuffle each group (seeded RNG, so a stored seed
     reproduces the same deck);
  2. compute C, the smallest maximum run the pool allows: 1 when no sector has more than half
     (+1) of the businesses, otherwise ceil(largest / (others + 1));
  3. build the deck one item at a time, picking a sector at random weighted by how many businesses
     it has left (so the deck mirrors the pool throughout), but only among picks that keep the rest
     of the deck completable with no run longer than C, and never the previous item's sector while
     another sector can be picked;
  4. a dominant sector needs R = largest - others - 1 unavoidable repeats; exactly those R repeats are
     paced evenly through the deck instead of piling up at the start or the end;
  5. optional per-sector review weights scale the pick probability (remaining × weight), so high-value
     sectors come up more often early in the deck and large low-weight sectors are pushed back — but
     only as far as rule 3 allows, so the weights never cause extra same-sector repeats.
Result: consecutive same-sector businesses only appear when the pool makes them unavoidable, and then
as rarely and as evenly spread as possible.
"""

import math
import random
from collections.abc import Hashable, Iterable, Mapping


def _min_max_run(counts: list[int]) -> int:
    total, top = sum(counts), max(counts)
    return max(1, math.ceil(top / (total - top + 1)))


def _completable(rem: dict[Hashable, int], last: Hashable, run: int, cap: int, repeat_budget: int) -> bool:
    """Can the remaining items still be ordered with no run > cap and at most `repeat_budget` repeats?"""
    total = sum(rem.values())
    for s, n in rem.items():
        if n == 0:
            continue
        others = total - n
        capacity = (cap - run if s == last else cap) + cap * others
        # Fewest same-sector repeats s still forces: it can sit between "others", plus one more slot
        # at the front unless the deck currently ends with s.
        forced = n - others - (0 if s == last else 1)
        if n > capacity or forced > repeat_budget:
            return False
    return True


def build_deck(items: Iterable[tuple[int, Hashable]], seed: int, weights: Mapping[Hashable, float] | None = None) -> list[int]:
    """items: (business_id, sector_key). weights: sector_key -> review weight (default 1.0). Returns ordered ids."""
    rng = random.Random(seed)
    groups: dict[Hashable, list[int]] = {}
    for business_id, sector in items:
        groups.setdefault(sector, []).append(business_id)
    if not groups:
        return []
    keys = sorted(groups, key=lambda k: (k is None, str(k)))  # deterministic iteration order
    for k in keys:
        groups[k].sort()
        rng.shuffle(groups[k])
    cap = _min_max_run([len(groups[k]) for k in keys])

    rem = {k: len(groups[k]) for k in keys}
    weight = {k: max(0.05, float((weights or {}).get(k) or 1.0)) for k in keys}
    total = sum(rem.values())
    top = max(keys, key=lambda k: rem[k])
    needed_repeats = max(0, rem[top] - (total - rem[top]) - 1)
    repeats = 0
    deck: list[int] = []
    last: Hashable | object = object()
    run = 0
    while any(rem.values()):
        candidates = []
        for s in keys:
            if rem[s] == 0 or (s == last and run >= cap):
                continue
            rem[s] -= 1
            used = repeats + (s == last)
            ok = _completable(rem, s, run + 1 if s == last else 1, cap, needed_repeats - used)
            rem[s] += 1
            if ok:
                candidates.append(s)
        if not candidates:  # cannot happen for a feasible cap; keep going rather than fail
            candidates = [s for s in keys if rem[s]]
        fresh = [s for s in candidates if s != last]
        repeat_due = last == top and last in candidates and repeats < math.ceil(needed_repeats * (len(deck) + 1) / total)
        if repeat_due or not fresh:
            pick = last if last in candidates else rng.choices(candidates, weights=[rem[s] * weight[s] for s in candidates])[0]
        else:
            pick = rng.choices(fresh, weights=[rem[s] * weight[s] for s in fresh])[0]
        deck.append(groups[pick].pop())
        rem[pick] -= 1
        repeats += pick == last
        run = run + 1 if pick == last else 1
        last = pick
    return deck


def longest_run(sectors: list[Hashable]) -> int:
    best = run = 0
    prev: Hashable | object = object()
    for s in sectors:
        run = run + 1 if s == prev else 1
        best = max(best, run)
        prev = s
    return best
