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

## Structure

```
src/
  main.js                  UI wiring: menu, settings panel, HUD
  settings.js              Persistent settings store and quality profiles
  scene.js                 GameEngine: renderer, lights, fog, frame loop
  player/
    PlayerController.js    Pointer lock, movement, crouch, gravity, aquatic state
  world/
    poolLayout.js          Room layout data, ground height, horizontal collision (no Three.js)
    PoolRoom.js            Builds room, pool basin, stairs, pillars, archway
    Water.js               Transparent water surface with moving normal maps
    textures.js            Procedural tile and water normal textures
tests/
  poolLayout.test.js       Node test runner tests for layout and collision
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
