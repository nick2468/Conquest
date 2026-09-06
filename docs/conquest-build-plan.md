# Conquest - build plan

Version 1. Written 2026-09-06. Status: **Active**. Last updated 2026-09-06.

Read the [design brief](../DESIGN-BRIEF.md) first, then the
[specification](conquest-spec.md). This document says what gets built, in what
order, and how we know each part is finished.

## How to use this document

Tick a box when the work is done and its tests pass. A box is not ticked because
the code exists. It is ticked because the tests are green and the thing works.

Each phase ends with something you can look at. No phase ends with "the
groundwork is laid".

---

## Phase 0 - the scaffold

**Goal: `npm run dev` opens a page, `npm run test` runs a green test.**

Nothing about the game yet. This phase proves the tools work together.

- [x] 0.1 Create `package.json`, install Vite, React, TypeScript and Vitest
- [x] 0.2 Write `tsconfig.json` in strict mode
- [x] 0.3 Write `vite.config.ts` with the React plugin and the Vitest settings
- [x] 0.4 Create the folder layout from spec section 15
- [x] 0.5 A placeholder page that says the project name and nothing else
- [x] 0.6 One trivial test, to prove Vitest runs
- [x] 0.7 `engine-purity.test.ts`, the guard from spec S2
- [x] 0.8 The VS Code files: recommended extensions, format on save
- [x] 0.9 `npm run build` finishes with no errors

**Done when:** the dev server serves a page, the test run is green, and the
build produces files.

---

## Phase 1 - the rules engine

**Goal: a full game of Conquest can be played in code, with no screen.**

Every part of this phase is testable in milliseconds. No browser is involved.
This is the part that survives if we ever change everything else.

### 1.1 Dice and attacks

The first real code. See spec 6.3 and D13.

- [x] 1.1.1 `random.ts`: the `RandomSource` interface and the three sources
- [x] 1.1.2 `dice.ts`: `rollDice`
- [x] 1.1.3 `attack.ts`: `resolveAttack`
- [x] 1.1.4 Tests, including a named test for the rule that the defender wins a
      tie

### 1.2 The map

- [x] 1.2.1 `types.ts`: every type from spec section 4
- [x] 1.2.2 `maps/validate.ts`: the eight checks from spec 3.2
- [x] 1.2.3 `maps/australia.ts`: 10 territories, 4 regions, SVG shapes
- [x] 1.2.4 A test that runs `validateMap()` against Australia

### 1.3 Setting up a game

- [ ] 1.3.1 `balance.ts`: starting armies, minimum reinforcements, set values
- [ ] 1.3.2 `setup.ts`: deal the territories, spread the armies
- [ ] 1.3.3 Tests: every territory is dealt, the counts are even, the army total
      is right

### 1.4 The turn

- [ ] 1.4.1 `reinforce.ts`: the sum from spec 6.1, with region bonuses
- [ ] 1.4.2 `fortify.ts`: adjacency, and the breadth-first search for connected
- [ ] 1.4.3 `cards.ts`: what makes a set, and what a set is worth
- [ ] 1.4.4 Tests for each, including both fortify distance settings

### 1.5 Putting it together

- [ ] 1.5.1 `game.ts`: `applyAction` for all seven actions
- [ ] 1.5.2 `game.ts`: `legalActions`
- [ ] 1.5.3 Elimination and the win check
- [ ] 1.5.4 The event log
- [ ] 1.5.5 `index.ts`: the one door into the engine, per spec S17
- [ ] 1.5.6 A test that plays a whole game to a winner using scripted dice

**Done when:** test 1.5.6 passes. A complete game runs from setup to a winner
with no screen and no real randomness.

---

## Phase 2 - the screen

**Goal: two people can play a real game by passing one iPad back and forth.**

### 2.1 The map on screen

- [ ] 2.1.1 `MapView.tsx`: draw every territory from the map data
- [ ] 2.1.2 Fill each territory with its owner's colour
- [ ] 2.1.3 Draw the army count in a circle at `labelAt`
- [ ] 2.1.4 Make the whole map scale to the window, per spec 11.3

### 2.2 Taking a turn

- [ ] 2.2.1 Show whose turn it is and which phase they are in
- [ ] 2.2.2 Reinforce: tap a territory to place an army
- [ ] 2.2.3 Attack: tap the attacking territory, then the target
- [ ] 2.2.4 Show what a tap would do before it happens, using `legalActions`
- [ ] 2.2.5 Occupy: choose how many armies move in
- [ ] 2.2.6 Fortify, and the button to skip it
- [ ] 2.2.7 End of turn, and pass to the next player

### 2.3 Cards and dice

- [ ] 2.3.1 Show the cards in the current player's hand
- [ ] 2.3.2 Trade a set, including the forced trade at five cards
- [ ] 2.3.3 Show the dice after an attack
- [ ] 2.3.4 Honour the `diceDisplay` setting, one by one or all at once

### 2.4 Around the game

- [ ] 2.4.1 A new game screen: how many players, names, colours, the options
- [ ] 2.4.2 The event log on screen
- [ ] 2.4.3 A winner screen
- [ ] 2.4.4 Placing your first armies by hand, from spec section 14

**Done when:** Nick and James play a full game on the iPad, start to finish, and
nothing on the screen disagrees with the rules.

---

## Phase 3 - the Home Screen app

**Goal: a tap on the iPad Home Screen opens Conquest, with no internet.**

- [ ] 3.1 An app icon
- [ ] 3.2 The manifest: name, icon, full screen
- [ ] 3.3 A service worker that stores the game for offline use
- [ ] 3.4 Publish to Cloudflare Pages
- [ ] 3.5 Point `conquest.datacrafter.net` at it
- [ ] 3.6 Add it to the iPad Home Screen and play a game with Wi-Fi turned off

**Done when:** the iPad is in aeroplane mode and a full game still plays.

---

## Phase 4 - computer players

**Goal: one person can play alone against the computer.**

Built in steps, so the difference between each step is easy to see. That is the
point of doing it this way, not an accident of ordering.

- [ ] 4.1 The seam: a computer player is asked for one action and returns one,
      chosen from `legalActions`
- [ ] 4.2 **Reckless.** Picks at random from the legal actions. Terrible, and a
      useful baseline.
- [ ] 4.3 **Cautious.** Only attacks when it has more armies than the defender.
- [ ] 4.4 **Greedy.** Prefers attacks that complete a region, and defends borders.
- [ ] 4.5 Pick the opponent's skill on the new game screen
- [ ] 4.6 A test that plays 100 games of Greedy against Reckless and checks
      Greedy wins most of them

Test 4.6 is the interesting one. It turns "is this any good?" into a number.

**Done when:** a person can play alone, and 4.6 passes.

---

## Phase 5 - maps of your own

**Goal: Conquest plays a map nobody wrote code for.**

- [ ] 5.1 A map file format, and reading it
- [ ] 5.2 Run `validateMap()` on a loaded map and report faults in plain words
- [ ] 5.3 Load a map from a file the player picks
- [ ] 5.4 A second map, to prove the first one was not a special case
- [ ] 5.5 A map editor tool, in its own folder

---

## Phase 6 - separate devices

**Goal: several people play one game from separate iPads and computers.**

This is the only phase needing a server. See D15.

- [ ] 6.1 A Cloudflare Worker with a Durable Object holding one game
- [ ] 6.2 Create a game, and a code other people use to join it
- [ ] 6.3 Send actions to the server and receive the new state
- [ ] 6.4 Show what other players are doing while you wait
- [ ] 6.5 Cope with a player closing the lid and coming back
- [ ] 6.6 Computer players in a game played across devices

---

## The order, and why

Phase 1 comes before any screen. That is deliberate and it is the main risk in
this plan, because phase 1 shows nothing on screen for a while.

We accept that for one reason. The rules are the hard part and the part that
must be right. Building them behind a screen means every bug arrives wearing a
disguise, and you cannot tell a rules bug from a drawing bug. Tested first, a
rules bug is a red line naming the rule it broke.

To keep phase 1 from feeling like nothing is happening, run the tests on screen
in the Vitest window. Watching 40 tests go green is the proof that the game
works before there is a game to look at.

Phase 4, the computer players, sits after the app is on the iPad. So there is
something to play with while the interesting part gets built.

---

## Progress

| Phase | State |
|---|---|
| 0 - the scaffold | **Complete** 2026-09-06. 41 tests green, build clean. |
| 1 - the rules engine | **In progress.** 1.1 dice and attacks, 1.2 the map. |
| 2 - the screen | Not started |
| 3 - the Home Screen app | Not started |
| 4 - computer players | Not started |
| 5 - maps of your own | Not started |
| 6 - separate devices | Not started |
