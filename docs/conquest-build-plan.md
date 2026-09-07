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

- [x] 1.3.1 `balance.ts`: starting armies, minimum reinforcements, set values
- [x] 1.3.2 `setup.ts`: deal the territories, spread the armies
- [x] 1.3.3 Tests: every territory is dealt, the counts are even, the army total
      is right

### 1.4 The turn

- [x] 1.4.1 `reinforce.ts`: the sum from spec 6.1, with region bonuses. Done
      early with 1.3, because setup cannot produce a playable state without
      knowing the first player's reinforcements.
- [x] 1.4.2 `fortify.ts`: adjacency, and the breadth-first search for connected
- [x] 1.4.3 `cards.ts`: what makes a set, and what a set is worth. `createDeck`
      landed early with 1.3, since a new game needs a deck.
- [x] 1.4.4 Tests for each, including both fortify distance settings

### 1.5 Putting it together

- [x] 1.5.1 `game.ts`: `applyAction` for all seven actions
- [x] 1.5.2 `game.ts`: `legalActions`
- [x] 1.5.3 Elimination and the win check
- [x] 1.5.4 The event log
- [x] 1.5.5 `index.ts`: the one door into the engine, per spec S17
- [x] 1.5.6 A test that plays a whole game to a winner using scripted dice.
      It found two faults on its first run. See spec S19.

**Done when:** test 1.5.6 passes. A complete game runs from setup to a winner
with no screen and no real randomness.

---

## Phase 2 - the screen

**Goal: two people can play a real game by passing one iPad back and forth.**

### 2.1 The map on screen

- [x] 2.1.0 Replace the placeholder shapes with outlines that look like
      Australia. See spec S18. Coastline points taken from real latitude and
      longitude, so Cape York, the Gulf of Carpentaria, Shark Bay and the
      Great Australian Bight are all in the right place.
- [x] 2.1.1 `MapView.tsx`: draw every territory from the map data
- [x] 2.1.2 Fill each territory with its owner's colour
- [x] 2.1.3 Draw the army count in a circle at `labelAt`
- [x] 2.1.4 Make the whole map scale to the window, per spec 11.3
- [ ] 2.1.5 A guard that every army count sits on its own territory. Checked
      by hand in the browser for now, with `isPointInFill`. jsdom does not
      implement that, so a real guard needs a browser test runner. Until then
      a moved label can drift onto the wrong territory and no test will say
      so.

### 2.2 Taking a turn

- [x] 2.2.1 Show whose turn it is and which phase they are in
- [x] 2.2.2 Reinforce: tap a territory to place an army
- [x] 2.2.3 Attack: tap the attacking territory, then the target
- [x] 2.2.4 Show what a tap would do before it happens, using `legalActions`
- [x] 2.2.5 Occupy: choose how many armies move in
- [x] 2.2.6 Fortify, and the button to skip it
- [x] 2.2.7 End of turn, and pass to the next player
- [ ] 2.2.8 A guard that no two territories overlap. Queensland and South
      Australia both claimed the same rectangle until it was spotted on
      screen. Detecting it needs polygon geometry the tests cannot do yet,
      which is the same gap as 2.1.5.

### 2.3 Cards and dice

- [x] 2.3.1 Show the cards in the current player's hand
- [x] 2.3.2 Trade a set, including the forced trade at five cards
- [x] 2.3.3 Show the dice after an attack. Done early with 2.2.
- [x] 2.3.4 Honour the `diceDisplay` setting, one by one or all at once.
      The setting is picked before a game starts, per spec section 7, so the
      control sits beside New game and applies to the next one.

### 2.4 Around the game

- [x] 2.4.1 A new game screen: how many players, names, colours, the options
- [x] 2.4.2 The event log on screen, with a heading for each round. Only the
      most recent 60 entries are drawn: a real game reached 4057.
- [x] 2.4.3 A winner screen, with who finished where. The ordering is tested
      against games really played. The screen ITSELF has not been seen live,
      because the browser player could not finish a game. See 2.4.5.
- [x] 2.4.4 Placing your first armies by hand, from spec section 14. Players
      alternate one army each, with a "place the rest for us" button for
      anyone who does not want a hundred taps.
- [x] 2.4.5 See the winner screen live. Done 2026-09-07 once phase 4 gave us
      a player that finishes: Greedy beat Reckless in 7 rounds and 61 attacks,
      on screen.

**Done when:** Nick and James play a full game on the iPad, start to finish, and
nothing on the screen disagrees with the rules.

---

## Phase 3 - the Home Screen app

**Goal: a tap on the iPad Home Screen opens Conquest, with no internet.**

- [x] 3.1 An app icon, drawn from the real map file by
      `tools/make-icons.mjs`, so it can never drift away from the board
- [x] 3.2 The manifest: name, icon, full screen
- [x] 3.3 A service worker that stores the game for offline use. Proven by
      serving the built game, STOPPING the server, and playing a turn.
- [x] 3.4 Publish to Cloudflare Pages. Done 2026-09-07. Project `conquest`,
      building from `nick2468/Conquest` on `main`, live at
      `conquest-bih.pages.dev`. Every push to main now rebuilds it.
- [x] 3.5 Point `conquest.datacrafter.net` at it. Done 2026-09-07. One new
      CNAME beside the existing records. `demo`, `test` and `www` all still
      answer 200.
- [ ] 3.6 Add it to the iPad Home Screen and play a game with Wi-Fi turned
      off. Needs Nick and the iPad. This is the task that decides the phase.

**Done when:** the iPad is in aeroplane mode and a full game still plays.

---

## Phase 4 - computer players

**Goal: one person can play alone against the computer.**

Built in steps, so the difference between each step is easy to see. That is the
point of doing it this way, not an accident of ordering.

**What a bad player looks like, seen 2026-09-07.** The throwaway player used
to drive the browser during phase 2 showed three faults at once, and Nick
named all three from watching it:

1. **Too hesitant.** It attacked only when it held two more armies than the
   defender, so it almost never pressed an advantage.
2. **Hoarding.** It put every reinforcement on one territory, which grew into
   a huge stack that did nothing.
3. **Every player the same.** With one strategy playing itself, no game ever
   broke open.

The result was games running past round 200 with hundreds of armies standing
still. Any player built in 4.2 to 4.4 should be measured against those three
faults, not just against each other.

**This is also weak evidence about balance.** Games ran long, which might mean
the region bonuses or the card values are wrong, per spec S5. It is weak
because a bad player makes any game run long. Judge the numbers against a
player that is trying.

- [x] 4.1 The seam: a computer player is asked for one action and returns one,
      chosen from `legalActions`. A test walks every position and checks each
      player only ever returns something the engine allowed, so a computer
      player cannot cheat: it never sees the rules, only the list.
- [x] 4.2 **Reckless.** Picks at random from the legal actions. Terrible, and a
      useful baseline. Two Reckless players can wander past 30000 moves without
      finishing, which is itself a fair measure of random play.
- [x] 4.3 **Cautious.** Only attacks when it has more armies than the
      defender. It also reinforces its frontier and fortifies forward, which
      fixes two of the three faults Nick named.
- [x] 4.4 **Greedy.** Prefers attacks that complete a region, and reinforces
      where the enemy is thinnest. **It is NOT stronger than Cautious.** See
      4.6.
- [x] 4.5 Pick the opponent's skill on the new game screen. Every player can
      be a person or any of the three, in any mixture.
- [x] 4.6 A test that plays 100 games of Greedy against Reckless and checks
      Greedy wins most of them. Measured 2026-09-07 over 200 games each:

      | Match | Result |
      |---|---|
      | Greedy vs Reckless | 199 - 1 |
      | Cautious vs Reckless | 198 - 2 |
      | Greedy vs Cautious | 94 - 100, 6 unfinished |

      **Greedy is a coin flip against Cautious**, so the test asserts they are
      evenly matched rather than claiming a ranking that is not there. A
      40-game run had come out 21-19 in Greedy's favour and would have let the
      claim through. The number of games is part of the test.
- [ ] 4.7 Make Greedy actually stronger, or drop it. Playing for the regions
      was a good idea that did not pay. Needs a real idea, not a new weight,
      and the tournament will say whether it worked.
- [ ] 4.8 Two careful players deadlock. Greedy against Reckless ends inside 25
      rounds; Greedy against Cautious has run to 1793 and sometimes never
      ends. Neither player is at fault: the game gives them no reason to
      break. Look at the balance numbers, spec S5, and at the rules left out
      in spec section 14, especially taking a beaten player's cards.

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
| 1 - the rules engine | **COMPLETE** 2026-09-06. A whole game plays in code. |
| 2 - the screen | **COMPLETE** 2026-09-07, bar the 2.1.5 overlap guard. |
| 3 - the Home Screen app | **Live at conquest.datacrafter.net.** Only 3.6 left. |
| 4 - computer players | **4.1 to 4.6 done.** 4.7 and 4.8 came out of them. |
| 5 - maps of your own | Not started |
| 6 - separate devices | Not started |
