# Poolrooms: Endless Abandoned

A first-person browser horror game set in Backrooms Level 37 (The Poolrooms). Built with Vite and Three.js.

## Run

```bash
npm install
npm run dev     # local dev server
npm test        # layout and collision tests
npm run build   # production build
```

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look around |
| W A S D / Arrow keys | Move |
| C / Left Ctrl | Crouch (hold) |
| Esc | Pause menu |

Note: browsers do not let a page block `Ctrl+W`. If you crouch with Left Ctrl, do not press W at the same time, or use C.

## Level generation

Every run grows a fresh Level 37 sector from a seed: a connected graph of
rooms joined by corridors, rejection-sampled so footprints never overlap and
every doorway opens onto dry, obstacle-free deck. The seed is shown in the
main menu and can be pinned with `?seed=12345`.

Room archetypes: `poolHall`, `colonnade`, `rotunda`, `grandStair`, `lanePool`.
Corridor archetypes: `archVault` (flooded vaulted tunnel), `darkChannel`
(dim passage with a shallow channel and light shafts), `scallop` (undulating
pilaster walls). See `docs/AUDIT.md` for the layout-logic screening report.

## Structure

```
src/
  main.js                  UI wiring: menu, settings panel, HUD
  settings.js              Persistent settings store and quality profiles
  scene.js                 GameEngine: seed, level build, lights, fog, frame loop
  player/
    PlayerController.js    Pointer lock, movement, crouch, gravity, aquatic state
  world/
    rng.js                 Seeded mulberry32 RNG
    levelGen.js            Pure level graph generator (rooms, corridors, water, lights)
    levelLayout.js         Pure collision: wall segments, disk test, ground heights
    waterMath.js           Shared water surface math (mesh + gameplay)
    LevelBuilder.js        Three.js assembly + gameplay API for the player
    WaterSystem.js         One animated water mesh per water body
    Water.js               Transparent water surface with moving normal maps
    textures.js            Procedural tile, lifebuoy and water normal textures
    builders/
      materials.js         Shared material palette
      kit.js               Tiled planes, basins, stairs, rails, vaults, oculus...
      rooms.js             Room archetype builders
      corridors.js         Corridor archetype builders
tests/
  levelGen.test.js         Connectivity, overlaps, seams, water/door invariants
  levelLayout.test.js      Collision, walkability, ground and water heights
  builders.smoke.test.js   Headless geometry build for all archetypes (canvas stub)
```

## Player state events

`PlayerController` dispatches a `statechange` event:

```js
player.addEventListener('statechange', ({ detail }) => {
  // detail.state: 'grounded' | 'aquatic'
  // detail.submerged: true when the camera is below the water surface
  // detail.waterDepth: meters of water above the feet
});
```

The audio system (Step 5) will use this event to apply underwater filters.
