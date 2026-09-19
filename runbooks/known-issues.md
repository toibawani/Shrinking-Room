# Known issues

## Wire Connect — solvability (fixed in corridor-territory pass)

**Status:** Addressed with territory-carved layouts. Not mitigation — structural fix.

### What was wrong

`WireConnect.generate()` carved paths to place endpoints but only exposed endpoints to the player. The full grid stayed open. A player could route one pair through cells another pair still needed, stranding themselves with no undo for completed pairs.

Measured failure rate before fix (8000 sequential random-order BFS solve trials):

| Room | Config | Failures / 8000 |
|------|--------|-----------------|
| Crossed Wires (room 6) | 4×4, 2 pairs | 9 (~1/890) |
| Double Trouble (room 11) | 5×5, 3 pairs | 21 (~1/380) |

Roughly 1-in-300 combined across those configs in manual play — sim numbers vary by trial method but same order of magnitude.

### Fix

Generator now:

1. Carves disjoint simple paths per pair (unchanged carve logic).
2. Tags interior cells as `{ kind: 'corridor', pair }`.
3. Marks every other cell `{ kind: 'blocked' }` — not clickable, rendered as dead wall.

Each pair only traverses its own corridor. Corridors don't share cells. A simple path has no branches, so there's only one route per pair. Completing pair A cannot occupy pair B's territory.

### After-fix simulation (8000 trials each)

| Room | BFS random-order failures | Adversarial routing failures |
|------|---------------------------|------------------------------|
| Crossed Wires | 0 / 8000 | 0 / 8000 |
| Double Trouble | 0 / 8000 | 0 / 8000 |

Adversarial sim: random pair order, prefer longest valid paths, reject if any choice strands remaining pairs.

### Residual risk

- If `wcCarvePath` fails to place all requested pairs (rare on small grids), generator returns fewer pairs than requested. UI still works; puzzle may be easier than level config intended.
- Visual change: grids show blocked cells and faint corridor channels. Gameplay is tighter, not a free-form lattice anymore.

If new Wire Connect reports appear, capture grid size, pair count, and a screenshot — check whether blocked/corridor cells rendered correctly.
