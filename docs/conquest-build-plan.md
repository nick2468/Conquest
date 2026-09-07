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
- [x] 4.7 Make Greedy actually stronger, or drop it. **It could not be made
      stronger.** Six ideas were tried and measured, and every one failed:

      | Idea tried | Greedy : Cautious |
      |---|---|
      | Prefer region-completing attacks | 94 : 100 |
      | Attack at the exact 50% odds line | 79 : 110 |
      | Attack only at the 70% odds line | 61 : 127 |
      | Attack only at the 85% odds line | 58 : 130 |
      | Reinforce where the enemy is thinnest | no change |
      | Bigger maps, 12 to 64 territories | no change |

      The trend was the clearest finding: **the more careful the attack rule,
      the worse it played.** Following that, "attack when at most one army
      behind" scored 108 to 88 and looked like the answer.

      **It was not.** Those 200 games were the same seeds used to CHOOSE the
      rule. On three fresh seed ranges it went 93-107, 97-102 and 103-96.
      Across 800 games: 401 to 393. A coin flip.

      Greedy is kept as a genuinely DIFFERENT player of the same strength,
      and its description says so. The tournament test now runs four separate
      seed ranges, so it cannot be fooled the same way twice.
- [x] 4.9 **Nick asked whether anyone had looked up how to play Risk well.**
      Nobody had. Two published rules were found and both were tested:

      1. *"Risk is a card game before it is a map game. Take a territory
         every turn, to earn a card."* **This transfers.** It is now what
         Greedy does.
      2. *"Attack only at two to one."* **This does NOT transfer.** It is
         right on a 42-territory board and paralysing on ten: 32 to 86
         against Cautious, and two such players deadlocked 31 games in 60.

      Measured with the card rule kept and the two-to-one rule dropped:

      | Game | Greedy : Cautious | Unfinished |
      |---|---|---|
      | Australia, 2 players | 45 : 52 | 3 |
      | Australia, 3 players | 53 : 45 | 2 |
      | Australia, 4 players | 50 : 49 | 1 |
      | Australia, 6 players | 55 : 45 | 0 |

      Greedy is now level, and a little ahead once there are three or more
      players. Not a landslide, but no longer worse, and it plays a
      recognisably different game.
- [x] 4.11 **Nick's idea: sometimes take a fight the odds only just favour**,
      to break the mirror between two careful players. Measured at 0%, 25%
      and 40%:

      | Boldness | Greedy vs Greedy, longest game |
      |---|---|
      | 0% | 23 rounds |
      | 25% | 12 rounds |
      | 40% | 12 rounds |

      It is NOT what cured the deadlock, which was dropping the two-to-one
      bar. But it roughly halves the longest game, so it is kept at 25%. Its
      effect on who wins is inside the noise.
- [x] 4.12 **Nick: "playing deterministically will lead to some dull games."**
      He was right, and it was a worse fault than any of the win rates. Both
      thinking players always took the single highest-scoring move, so the
      same board played out identically every single time. Dull to play
      against, and learnable.

      They now choose at random between moves that are NEARLY AS GOOD, which
      means within a tenth of the best score.

      The first attempt was to pick between the best three regardless of
      score, and a test caught it at once: Greedy stopped reliably finishing
      a region, because a plainly better move was being swapped for a worse
      one a third of the time. Shortlisting by SCORE GAP rather than by rank
      fixes that. Near-ties vary. Clear winners are always taken.

      A test now plays the same board five times with the SAME dice and
      different player choices, and fails if any two games come out alike.

      The app also picks a fresh starting seed each time it is opened, so the
      first game of a session is not always the same one.
- [x] 4.8 Two careful players deadlock. **Cause found, and it is not what it
      looked like.** A deadlocked game was played out and read: seed 60,
      round 1796.

      ```
      p1: WA:447160  ROT:1  NT:444388  NSW:893724  ACT:4
      p2: QLD:1      WHIT:1 SA:1337626 VIC:447175  TAS:8
      ```

      Armies in the MILLIONS. Three things combine:

      1. ~~The rising card value has no ceiling.~~ **WRONG, corrected by the
         measurements in 4.10.** Capping the value, or fixing it, changes
         the numbers and not the outcome. It only made the fortress bigger.
      2. **Both players pile every army onto ONE territory.** South Australia
         with 1.3 million armies cannot be taken by anybody, ever.
      3. **So nobody can be eliminated**, because eliminating a player means
         taking every territory they hold, including the fortress.

      **The real cause was Greedy**, found in 4.9. It demanded a two-to-one
      advantage, which a ten-territory board rarely offers, so it stood
      still. Cautious against Cautious never deadlocked once, in 60 games,
      with a longest game of 17 rounds. Greedy against Greedy deadlocked 31
      times in 60. After 4.9 it deadlocks 0 times in 60.

      The players then see-saw over the one-army territories forever.

      It is NOT a stalemate of inaction, which is what "deadlock" suggested,
      and it is NOT the map: grid maps of 12, 42 and 64 territories never
      produced one, and Australia produces about 2 in 200.

      **No human game will ever reach round 1796**, so nothing here is urgent.
      What to do about it is a balance decision, which spec S5 says belongs
      to Nick and James. It is written up as 4.10.
- [x] 4.10 Decide what to do about unbounded late games. **Nick asked for
      fixed values and for rising capped at 12. Both were measured, and
      NEITHER fixes anything:**

      | Card rule | Unfinished /120 | Longest game | Biggest stack |
      |---|---|---|---|
      | Rising, no cap | 2 | 1796 rounds | 1,337,626 |
      | Rising, capped at 12 | 3 | 1796 rounds | 8,961 |
      | Fixed | 2 | 1794 rounds | 6,617 |

      Capping tames the NUMBERS and changes nothing about whether a game
      ends. **This corrects the 4.8 write-up**, which named the uncapped
      card value as a cause. It was not one. The cause was Greedy demanding
      two to one, and 4.9 fixed that.

      `RISING_SET_CAP` exists in `balance.ts` and is switched off. Turning it
      on is a taste decision about readable numbers, not a fix.

Test 4.6 is the interesting one. It turns "is this any good?" into a number.

**Done when:** a person can play alone, and 4.6 passes.

- [x] 4.13 **Nick: "real players have a high level plan, e.g. take South
      America as a base and push from there. It is not just scattered
      tactics."** He was right, and it turned into the clearest result in
      the whole phase.

      A fourth player, **Planner**, picks a REGION to own and makes every
      move serve it: attacks into it first, reinforces where it can attack
      from, and once it holds the region guards the ways in. It prefers a
      region with FEW DOORS, which is why people pick Australia or South
      America in the real game: not because they pay well, but because they
      are cheap to hold.

      The goal is worked out from the board each turn rather than
      remembered, so the seam of spec S20 is untouched. That also behaves
      better than a memory: the plan holds while the board holds.

      | Board | Planner : Cautious |
      |---|---|
      | Australia, 10 territories, 2 players | 78 : 82 |
      | Australia, 10 territories, 4 players | 78 : 80 |
      | Risk-shaped, 42 territories, 2 players | **32 : 18** |
      | Risk-shaped, 42 territories, 4 players | **31 : 19** |
      | Risk-shaped, 42 territories, 6 players | **30 : 20** |

      **A plan needs a board worth planning on.** On ten territories a
      region is two or three squares, so "I am going for that region" is
      never more than one attack away and means nothing. On a real board the
      Planner wins about six games in ten, at every player count.

      One thing had to be got right. The first version weighted the plan at
      25 against a tactical score of about 25, so the plan DROWNED the
      tactics and it lost badly, 7 to 43. At a weight of 10 it wins. A plan
      guides the choice between good moves; it does not excuse a bad one.
      That is the same lesson as the region bonus in 4.7.

---

## Phase 5 - maps of your own

**Goal: Conquest plays a map nobody wrote code for.**

**Task 4.13 turned this phase from a nice-to-have into the thing the game
needs.** The computer players are as good as a ten-territory board lets them
be. A bigger Australia is what makes strategy mean anything.

- [ ] 5.0 **A bigger Australia.** Nick's design: divide the states and
      territories into several regions each, and make the big cities
      playable places of their own. Perth, Adelaide, Melbourne, Sydney,
      Brisbane, Hobart, Darwin, Canberra.

      Aim for something near a real Risk board: about 40 territories in 8 to
      10 regions. That is the size at which the Planner beats Cautious 6 to
      4, measured in 4.13, and at which a region bonus is worth defending.

      A city inside a state is the same shape of idea as the Australian
      Capital Territory: a small, valuable, one-door place. Those make good
      prizes and good bases.

      The current 10-territory map stays, as the small one to learn on.
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
| 4 - computer players | **COMPLETE** 2026-09-07. 4.1 to 4.13 all done. |
| 5 - maps of your own | Not started |
| 6 - separate devices | Not started |
