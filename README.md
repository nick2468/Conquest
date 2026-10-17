# Conquest

A turn-based territory game. Take territories, hold whole regions for extra
armies, trade cards for reinforcements, and knock every other player out.

Built by James and Nick in Australia. Written in TypeScript. It runs as a web
app you add to the iPad Home Screen, and in a web browser on a desktop or
laptop computer.

Play it at [conquest.datacrafter.net](https://conquest.datacrafter.net).

Read [DESIGN-BRIEF.md](DESIGN-BRIEF.md) first. It holds every decision and the
reason for it.

## Status

Playable and live. One person plays against computer opponents, or several
people share one iPad and take turns on it.

What is in it:

- **Three maps.** Australia, 10 territories in 4 regions. Australia in
  detail, 38 territories in 7 regions. World, 42 territories in 6 regions.
  Every coast and every border was drawn by hand.
- **Maps of your own.** Draw one in the editor at `/editor.html` and the game
  reads it. The map file format is plain text.
- **Eight computer opponents**, each playing by its own numbers: Reckless,
  Turtle, Cautious, Counter, Greedy, Planner, General and Optimus. Optimus
  plays the General's strategy with numbers found by self-play, and wins most
  often.
- **The rules as options.** Rising or fixed card set values and a cap on the
  rise, when cards may be traded, a bonus for the territory named on a card,
  how far and how often you may fortify, armies placed by hand or spread for
  you, and dice shown one at a time or all at once.
- **A post-game replay.** Watch the colours change move by move, at four
  speeds, forwards and backwards.
- **Saved games.** Save a finished game to a file, then read it back with
  `npm run read-game`.
- **It installs like an app.** It is a Progressive Web App, so it caches
  itself and keeps playing when the network drops.

Not finished: playing one game from separate devices. The Cloudflare Worker
for it is written and driven by tests, but it is not deployed.

## Running it

```
npm install
npm run dev
```

Other things worth knowing:

| Command | What it does |
|---|---|
| `npm test` | The whole test suite, 645 tests |
| `npm run typecheck` | TypeScript, with no emit |
| `npm run build` | The site, into `dist/` |
| `npm run read-game -- <file>` | Replays a saved game and prints each round |
| `npm run tune` | Searches for better numbers for a computer player |
| `npm run league` | Plays the computer players against each other |

## How it is built

The rules live in `src/engine/` and touch nothing outside themselves: no
browser, no clock, and no hidden random numbers. A test enforces that. It is
why the same rules run in a web browser, in a test, in the tuner and on a
Cloudflare Worker without one line changing.

The screen imports from `src/engine/index.ts` and never from a file inside the
engine, so the engine can be rearranged without the screen noticing.

## Licence

MIT. See [LICENSE](LICENSE). You may copy, change and use this, including in
something you sell. Keep the copyright notice in any copy you pass on. The map
drawings under `assets/` and `tools/data/` are covered by the same licence.
