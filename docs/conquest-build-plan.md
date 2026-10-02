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
- [x] 2.1.5 A guard that no army count sits on somebody else's territory.
      **Built 2026-09-07** as check 10 in `validate.ts`.

      Parked for a day on a wrong belief: that this needed a browser,
      because `isPointInFill` is a browser thing and jsdom has not got it.
      Whether a point is inside a shape is arithmetic.

      The rule is not "the count sits on its own land". Rottnest and the
      Whitsundays are too small to hold a number, so theirs sit out at sea
      with a line pointing at them, and Perth's sits beside it on The South
      West. A count may sit on its own place, on the place its city is drawn
      over, or on nothing at all. Anywhere else it looks like somebody
      else's number.

### 2.2 Taking a turn

- [x] 2.2.1 Show whose turn it is and which phase they are in
- [x] 2.2.2 Reinforce: tap a territory to place an army
- [x] 2.2.3 Attack: tap the attacking territory, then the target
- [x] 2.2.4 Show what a tap would do before it happens, using `legalActions`
- [x] 2.2.5 Occupy: choose how many armies move in
- [x] 2.2.6 Fortify, and the button to skip it
- [x] 2.2.7 End of turn, and pass to the next player
- [x] 2.2.8 A guard that no two territories overlap. **Built 2026-09-07** as
      check 9 in `validate.ts`. **Loosened to a measured 2.5 units on
      2026-09-08**, when the traced world map arrived, with the maps we
      build ourselves still held to nothing at all by their own test.

      **It found a real fault on the day it was written.** The Riverina's
      northern edge was one straight line trying to meet two neighbours
      whose southern edges are a unit apart, so it cut half a unit into The
      Far West. Half a unit out of 648 is invisible, and it was in a map
      that had been played for days. Fixed by giving The Riverina the two
      corners it needed.

      One overlap is allowed and the map must declare it: a city drawn on
      top of the place around it, with `drawnOver`. The check then makes
      sure the claim is true, that the two border each other, really touch,
      and that the city is the smaller of the two.

      **Two rectangles can overlap with every corner sitting ON the other
      one's outline.** Testing corners is the obvious approach and it walks
      straight past that. Each edge is now cut at every point where it meets
      the other outline, and the middle of each piece is tested. The first
      version was corners-only and a test caught it.

### 2.3 Cards and dice

- [x] 2.3.1 Show the cards in the current player's hand
- [x] 2.3.2 Trade a set, including the forced trade at five cards
- [x] 2.3.3 Show the dice after an attack. Done early with 2.2.
- [x] 2.3.5 **Say when a set is waiting to be traded.** Nick's request,
      built 2026-09-07, after losing games: "sometimes we've lost a game and
      realised that we should have traded a set."

      The trade button turns green, the game rings once, and one tap trades.
      Green only while reinforcing, because that is the only time a set can
      be traded. Once, not every turn, because a bell that goes off over and
      over is a bell nobody hears.

      The separate "choose a set for me" button is gone. The green button
      does that job now, including the forced trade at five cards.

      Seen live in round 8 of a real game: the button read "Trade a set for
      8", measured green, one ring of three notes, and one tap turned three
      armies to place into eleven.
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
      on is a taste decision about readable numbers, not a fix. **It was
      switched on at 20 in 4.16**, once Nick had watched a real game hand
      both sides hundreds of armies a turn.

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

- [x] 4.14 **Nick: "The computer players are too easy to beat."** He named
      four faults, all real. They leave ONE army behind after every attack,
      so what they just left looks inviting. They ignore a continent
      somebody else has taken. They put every new army on one territory,
      every turn. And once the front falls, everything behind it is one
      army deep.

      A fifth player, **General**, knows how deep each of its territories
      is. The front holds as many as the biggest enemy beside it, a door
      into a region it owns holds two more, the line behind the front holds
      two, and only land well inside is left at one. After a capture the
      old territory keeps what it still needs. New armies go first to the
      weak spots of the front, after the stack for this turn's attack is
      set aside. And a territory of a continent somebody else holds whole
      is worth the whole bonus to it, so that is what it attacks first.
      Each of the four faults is a test.

      **The first version lost head to head, 10 to 30 against Greedy.** It
      defended well and attacked too rarely. Lighter garrisons and keeping
      momentum after a capture both made little difference. What fixed it
      was attacking at one army's margin over the defenders rather than
      the odds table's two: 71 to 49 head to head on the seeds it was tuned
      on. On three seed ranges it never saw, it came out level instead,
      which is S22 again. See spec S21 for the full table. With four
      players it wins seven games in ten against every other player.

      All of its numbers are in one settings object at the top of
      `general.ts`. The tournament found one real bug on the way: in an
      attack phase with no attack possible, it chose by what was on offer
      rather than by the phase, and sent a fortify into the attack phase.
      It now chooses by the phase, and a test holds that position.

      **Then: its card first, and no policing.** Nick: "General should
      still put a very high priority on gaining a card every move... that
      doesn't mean it needs to be the global policeman... perhaps it can
      reason that another player will take care of that depending on play
      order." Both were fair. It ended 13% of its turns without a card, and
      it chased every enemy continent it could reach.

      Now, until it has taken something this turn, it puts its attack
      stack beside the easiest capture, scores attacks on how likely they
      are to succeed, and goes all in: the attacking territory keeps
      nothing back for the card, though the capture still leaves a
      garrison behind. Once the card is won, what a target is worth leads
      again. And a continent is only fully its job if nobody who moves
      before the owner collects again can reach it with three armies or
      more; otherwise it is worth 30%.

      | Measured, unseen seeds | Wins | Turns with no card |
      |---|---|---|
      | Before | about 60% | 13% |
      | Card-first scoring and play order only | 58% | 11% |
      | Plus the easy stack and all in | **63%** | **1%** |

      Scoring alone barely moved it. Where the stack STANDS was the thing:
      with the armies beside the most valuable target, there was often no
      capture on offer at all. See spec S21 for the full table.

- [x] 4.15 **Nick: "tune it for one-on-one games. It should also switch
      strategies then when the other players get eliminated and it becomes
      1 on 1."** Head to head General lost to Greedy 49 to 71: a line held
      everywhere pays against several enemies, but against one it only
      soaks up armies that never attack.

      So at the start of every move it counts the players left. With ONE
      opponent it plays by `GENERAL_DUEL`: the front holds half the enemy
      beside it rather than all of it, and nothing is kept behind the
      front. That covers a two-player game from the start and every bigger
      game once it is down to two.

      | Head to head, unseen seeds | Before | Duel settings |
      |---|---|---|
      | vs Greedy | 49 : 71 | **67 : 53** |
      | vs Cautious | 61 : 59 | **85 : 35** |
      | vs Planner | 56 : 64 | **70 : 50** |

      Four-player games did not change (91 : 29 against 94 : 26 on the
      same seeds). Two things tried and dropped: taking away the door guard
      and the spare armies on the stack as well made it worse, 44%; and
      attacking at no margin at all was no better on unseen games.

- [x] 4.16 **Nick, watching General play Greedy one on one: "each turn
      they get so many reinforcements that they can almost conquer the
      whole world per turn."** Two causes, two fixes.

      **Set values had no ceiling.** "The armies from redeeming each set
      shouldn't increase per redemption without a limit in place." Rising
      sets now stop at 20: 4, 6, 8, 10, 12, 15, 20, then 20 every time.
      It is one number, `RISING_SET_CAP` in `balance.ts`, and the new game
      screen reads it: "More each time (4, 6, 8... up to 20)".

      **Every computer player put a whole turn on one territory.** "When
      a CP gets hundreds of new armies they shouldn't just dump in one
      place... they should be boosting their already conquered territories
      a little as well." Now, on a turn of more than 20 armies, the first
      30% are spread over the front, thinnest territory first, and only
      then does the player's own plan place the rest. One shared rule,
      `spreadFirst` in `board.ts`, used by Cautious, Greedy, the Planner
      and General. Reckless stays random on purpose. Only the front gets
      them: armies inland can never fight.

      To tell a big turn from a small one without any memory, the turn
      now records `armiesGiven`: the reinforcements plus any set traded.
      What is already down is `armiesGiven - armiesToPlace`.

      | General vs Greedy, same 40 games | Before | After |
      |---|---|---|
      | Biggest single turn, 4 players | 337 armies | **54 armies** |
      | Game length, 4 players | 31.8 rounds | **23.6 rounds** |
      | General's wins, 4 players | 30 : 10 | 34 : 6 |
      | One on one | 21 : 19, 10.5 rounds | 21 : 19, 10.2 rounds |

      Games got SHORTER with the cap, not longer: with hundreds of armies a
      turn, both sides could retake everything they lost. Each player
      spreading on a big turn is a test.

- [x] 4.17 **Nick: "make them all split ordinary turns too."** Until now
      Cautious, Greedy and the Planner put an ordinary turn (20 armies or
      fewer) on one territory. Even General could, when its planned attack
      needed more than the whole turn.

      Now the first 20% of EVERY turn goes over the front, thinnest
      territory first, and 30% of a big turn as before. Then each player's
      own plan places the rest. The shares sit together in `SPREADING` in
      `board.ts`. General spreads every turn too: measured, it did a
      little better that way than on big turns only.

      | Unseen seeds, 30 games each | Old | 20% every turn |
      |---|---|---|
      | Greedy : Cautious, 2p / 4p | 15:15 / 24:6 | 23:7 / 23:7 |
      | Planner : Cautious, 2p / 4p | 14:16 / 26:4 | 20:10 / 24:6 |
      | Greedy : Planner, 2p / 4p | 16:14 / 11:19 | 17:13 / 15:15 |
      | General : Greedy, 2p / 4p | 14:16 / 26:4 | 17:13 / 27:3 |
      | General : Planner, 2p / 4p | 15:15 / 27:3 | 19:11 / 24:6 |

      Nobody got weaker for it, and General stays ahead in every pairing.
      A third of every turn was tried too and was mixed. Each thinking
      player splitting a turn of 10 armies is a test.

- [x] 4.18 **Nick: "do the computer players know that owning a continent
      is valuable? If so do they also rank how easy each is to conquer and
      hold?"** The Planner and General did: bonus, territories still to
      take, ways in, and the enemy armies on those territories. Two things
      were missing, and he asked for both: "add distance and border
      threat, then tune the weights."

      Now each step between our nearest army and the continent costs 8,
      and each enemy army standing on a way in costs 1. The weights sit in
      `PLANNER_SETTINGS` in `planner.ts`; the General uses the same scoring.

      | Planner wins | Tuning seeds | Unseen 5000+ | Unseen 20000+ |
      |---|---|---|---|
      | Before | 63% | 63% | 65% |
      | Distance 8, threat 1 | **73%** | 69% | 57% |

      **Honest result: no measurable gain.** The tuning seeds said ten
      points; across all three ranges it is level, 66% against 64%, and the
      General is level too. S22's lesson once more. The old weights were
      also nudged each way (bonus, steps, ways in) and every nudge did
      worse, so they stay as they were. Distance and threat are kept
      because they cost nothing and stop a plan chasing a continent across
      the map, or one facing a big stack, which a person would exploit.

- [x] 4.19 **Nick, on the new game screen.** Player 1 defaults to a person
      and every other seat to General. Map sits beside its label with
      Start at the right of the same row, above both columns. "The landing
      page seems a bit tall": it was one narrow column; on a screen wide
      enough, an iPad held sideways, Players and Rules now sit side by
      side, and the version shares the bottom row with the buttons.

      **How to play**, a link beside the title, opens a help page: the
      aim, a turn in order, how a fight works, cards, the chosen map's
      continents and bonuses, how to play on the iPad, and every computer
      player easiest first. Every number on it comes from `balance.ts` or
      the map, so it cannot drift from the rules. `HelpScreen.tsx`.

- [x] 4.20 **Sea routes are drawn on the board.** Nick saw a computer
      player move armies from Brazil to China and took it for a bug. It
      was not: the route ran Brazil, North Africa, East Africa, Middle
      East, Afghanistan, China, across two crossings nobody could see.
      "I didn't realise there is a sea route there. We need to think of a
      way to show sea routes."

      Every border with WATER between the two coasts is now a faint dashed
      line, between the nearest points of the two coasts, as on the printed
      board. 24 on the world map, every one a crossing on the printed board
      too, and 5 on the detailed Australia map. Alaska to Kamchatka goes
      round the back of the world, so it is drawn as a short line off each
      edge of the map, not a line straight across it. `sea-routes.ts`,
      with a test that counts them. The help page explains the dashes.

      Three things the tests caught on the way. A city sits inside its
      state, so its outline shares no edge with anything, and the first
      version drew 33 dashes on the Australia map; a city is now judged by
      the state it is drawn on. Hand-drawn neighbours often meet at a single
      corner, so a crossing needs a gap of more than 2 units, not merely no
      shared edge. And a dash must stay over water: when the nearest two
      corners give a line that clips a third place, the next nearest pairs
      are tried, and a border with no water between at all, such as
      Gascoyne to the Nullarbor, gets no dash.

- [x] 4.21 **Knockouts win cards, and when to trade is an option.** Nick:
      "do any of the computer also know that annihilating an opponent wins
      his cards?" Nobody did, because the rule did not exist: a beaten
      player's cards simply left the game. Now whoever takes a player's last
      territory takes every card they hold, and six or more must be traded
      at once down to four, placed, and the attack carries on. Nick: "make
      it another play time option, default Classic." `cardTrading` is
      Classic (the printed rules), after a knockout, or any time during the
      attack. See spec 6.6.

      General values a knockout: 6 for the knockout and 4 for each card it
      wins, so a player holding five cards is worth far more than one
      holding one. Measured, General with it against without, three and
      four players: 83% against 82% on the tuning seeds, 84% against 83% on
      unseen ones. Level, and it never costs anything.

      **The choices are remembered.** "Can option selections be persisted
      in a cookie?" In the browser's own storage instead, which stays on
      the iPad and works offline. Checked when read back.
      `remembered-setup.ts`, with tests.

      **"Load it" now reloads the page.** "Pressing 'load it' doesn't
      reload the browser, I still have to do that in the browser control."
      The new version was taking over, but the page never heard the moment
      it did. The page now reloads itself when the new version takes
      control, and after four seconds regardless.

      Tests: knockouts hand over cards, Classic forces six cards down and
      carries on, five or fewer wait, each of the other two modes, Classic
      refusing a trade mid-attack, and the choices surviving a round trip.
- [x] 4.22 **Sea routes are clearer.** Nick: "Greenland looks like it is
      going twice to NWT and not to Ontario", "EAF to Middle East bit hard to
      see", "don't always use the smallest gap use a clearer one", "make
      black and a bit heavier", and "Alaska seems to be drawing to the inland
      junction of YAK, IRK and Kamchatka". Each dash now ends on open coast,
      at least 6 map units from any third place, and a dash of at least 16
      is preferred to the narrowest one. Crossings round the back of the
      world leave from each place's outer coast. The dashes are black and
      heavier. Tests: every end on its own place, Greenland to Ontario, East
      Africa to the Middle East long enough to see, and Kamchatka from its
      eastern coast.
- [x] 4.23 **The Turtle.** Nick, after reading the Wikipedia page on Risk:
      "one is even named as Turtle, we should offer it." It piles its
      armies on the border under most pressure, attacks once a turn for its
      card, and also takes any knockout or last territory of a continent in
      reach. It moves as few armies as it can into a capture. It plays as
      the General once it holds half as many armies again as the strongest
      other player, or once one opponent is left in a game that started
      with more than two. In a game that starts with two it would otherwise
      have been the General from the first move, and a test caught that.
      `turtle.ts`, with tests: it attacks for its card, stops once it has
      it, and still takes a knockout.

      Measured on the world map, unseen seeds (spec S21): it beats Reckless
      18 - 2 and 19 - 1, and loses to every other player. So it is listed
      second easiest. The General beats it 20 - 0 and 19 - 1, so the
      General needs no special answer to it.
- [x] 4.24 **A stronger Turtle, how big an advantage to wait for, and many
      fortify moves.**

      Nick: "make it stronger, turtle in an easy continent first." The
      Turtle now takes the continent the Planner would choose first, pushing
      all its armies into it, and only then hides in it, guarding its ways
      in. In four-player games it went from losing to everything but
      Reckless to beating Cautious, Greedy and the Planner about four games
      in five, and splitting level with the General.

      Nick: "In real-life I don't recall anyone waiting for a 2:1
      advantage... we should measure this." None of our players waits for
      2:1. The General wants one or two armies more than the defender, and
      the Turtle wanted two more. Measured on the Turtle, four players, two
      seed ranges of 80 games each (spec S22):

      | Attack for a card with | 5000 and 20000 | 90000 and 40000 | Total |
      |---|---|---|---|
      | Just more than the defender | 61 | 57 | 118 of 160 |
      | Two to one | 54 | 59 | 113 of 160 |
      | Two more than the defender | 52 | 50 | 102 of 160 |

      Nick's instinct was right: waiting for a big margin cost games, and
      "just more" did best on both ranges. Two to one was close behind.
      So the Turtle now attacks for its card with any advantage.

      In two-player games the choice made no difference at all: every
      version scored the same. A probe showed why. Those games are short,
      the Turtle spends them building its shell or ahead enough to play as
      the General, and whoever moves first usually wins.

      Nick: "Add the multi-fortify option but default to classic."
      `fortifyMoves`: one move, as in the printed rules, or as many as you
      like. Armies that arrived this turn stay where they are, so every
      player runs out of moves. Tests: the engine rules, and every computer
      player finishing a game with many moves.
- [x] 4.25 **The ceiling on a rising set is an option.** Nick: "Add an
      option to set the rising set redemption ceiling, default 20."
      `risingSetCap`, one of `RISING_SET_CAP_CHOICES` (15, 20, 25, 30, 40,
      50), shown on the new game screen only when sets rise. A saved game
      from before it existed plays at 20. Remembered with the other choices,
      and a ceiling that is not on the list is refused when read back.
- [x] 4.26 **The sound button says what it will do, and sound starts on.**
      Nick: "Change the sound button to say 'Turn sounds off / Turn sounds
      on'. Persist the last setting. First game default is to have sounds
      on." The setting was already remembered. Now a first visit starts
      with sound on, and the first tap anywhere starts the sound engine,
      because a browser lets sound through only from inside a tap. See spec
      S25.
- [x] 4.27 **Big dice under the board.** Nick: "Show some prominent dice,
      above or below the board, and if possible make them look like real
      rolling dice... Keep the dice roll commentary box as it is."
      `BoardDice.tsx`: dice with pips that tumble for about two thirds of a
      second, land on the real roll, then ring the winners and fade the
      losers. The turn panel is unchanged. Checked in the browser with three
      Generals playing: up to five dice tumbling at once, and no errors. See
      spec S24a.
- [x] 4.28 **The Counter.** Nick: "Do we also have a strategy that likes
      to do counter-attacks instead of frontal assaults?" and "build the
      counter-attack player but I would like to know how good that strategy
      is." It makes no frontal assaults. It guards its borders, and when
      attacked, it hits back next turn at the stack that attacked it, which
      the attack has thinned, and takes back what it lost. It still takes a
      card each turn and any knockout. To know who attacked it, the engine
      now keeps `recentFights`: the attacks each player made in their
      latest turn. `counter.ts`, with tests.

      How good it is, on the world map, 20 games per pairing over four seed
      ranges (5000, 20000, 90000, 40000):

      | Counter against | 2 players | 4 players |
      |---|---|---|
      | Reckless | 20 - 0 | 20 - 0 |
      | Turtle | 8 - 12 | 2 - 18 |
      | Cautious | 13 - 7 | 17 - 3 |
      | Greedy | 4 - 16 | 14 - 6 |
      | Planner | 2 - 18 | 13 - 7 |
      | General | 2 - 18 | 7 - 13 |

      So it is a good strategy at a full table and a poor one head to head.
      With several players, others keep attacking it and each other, and it
      feeds on the damage. With one opponent it waits while that opponent
      builds. Its worst match is the Turtle: a player that hardly attacks
      gives it nothing to hit back at. The General still beats it.
- [x] 4.29 **A fight round the back of the world, and buttons with colour.**
      Nick: "When alaska fights kamchatka the battle animation happens in
      the middle of the board." The smoke went halfway between the two
      places, which for a crossing off one edge of the map and on at the
      other is the middle of the board. Now such a fight is drawn where the
      defender stands, and armies moved that way arrive by boat from the
      near edge. `goesRoundTheBack` in `zoom.ts`, with tests. Nick: "The
      Sounds button and New Game button should have some colour, they
      appear greyed out." They are light blue now, a step below the solid
      blue of a primary button.
- [x] 4.30 **The counter-attack tactic in the General: measured, and left
      out.** Nick: "Roll the counter-attack idea into General. It should be
      a tactic that General chooses to play sometimes." Built as a worth
      on the stack that attacked it and on land it lost, played only when
      somebody had attacked it and two or more opponents were left.
      Measured on the world map, four players, 80 games each over seeds
      5000, 20000, 90000 and 40000, against Greedy, the Planner, the
      Turtle and the Counter:

      | The tactic | General won |
      |---|---|
      | Off | 69 of 80 |
      | Hit back 8, retake 6, worth an even chance | 56 |
      | Hit back 16, retake 12, worth an even chance | 57 |
      | Hit back 8, retake 6, safe attacks only | 62 |
      | Hit back 4, retake 3, safe attacks only | 54 |

      Every version made it weaker, so the General does not play it. The
      likely reason: the General already attacks where the odds and its
      plan say, and hitting back pulled armies away from both. The Counter
      wins with it because it has no plan to lose. `recentFights` stays in
      the engine for the Counter.
- [x] 4.31 **The General hits back sometimes, so it is harder to read.**
      Nick: "I want General to be the best computer player, sometimes being
      unpredictable will be beneficial especially if there are human players
      that know the strategies being played." In a turn after somebody
      attacked it, with two or more opponents left, it plays the
      counter-attack on 20% of turns (`counterChance`), and only as a safe
      attack. Whether it plays it is worked out from the round, its seat and
      the attacks made on it (`turnChance`), so the choice holds for the
      whole turn without any memory, and nobody at the table can see it
      coming.

      Measured, four players, 80 games per range:

      | How often it hits back | 5000 to 40000 | 60000 and 70000 | Total |
      |---|---|---|---|
      | Never | 69 | 57 | 126 of 160 |
      | 20% of those turns | 58 | 56 | 114 of 160 |
      | 35% of those turns | 56 | | |

      On the fresh seeds the two are level, so the 69 was partly luck. The
      cost against computer players is somewhere between nothing and about
      one game in thirteen. What it buys, not being read by a person who
      knows how the General plays, no tournament can measure, because
      computer players do not learn. Nick asked for it, and the cost is
      small and uncertain, so it is on. Set `counterChance` to 0 to turn it
      off.
- [x] 4.32 **The side panel stops jumping.** Nick: "I'm not a fan of how
      the right hand side panel keeps jumping around. Make the dice analysis
      a fixed height" and "Put the ranking first, then dice analysis, then
      history." The player table is now at the top, then the turn panel,
      then the choosers and cards when they are needed, then the history.
      The turn panel is a fixed height: its words stop at three lines, and
      its buttons sit on its bottom edge.
- [x] 4.33 **The General breaks a thinly held continent.** Nick, of a
      one-on-one game: the General had 20 on Ukraine while the Turtle held
      Europe and North America with one army a territory, and it "should
      have denied turtles next go continent bonuses but decided to attack
      in africa and take more of asia. that was poor play."

      A trace of real games found two faults. Before its card, the General
      counted only 30% of what a target is worth, so breaking Europe scored
      about the same as any lone army, and the near tie was settled at
      random. And a stack beside a continent held by one army would not
      attack if it also faced a big enemy elsewhere: it set aside enough to
      face that enemy first, and had nothing left, although ten against one
      loses an army or two.

      Fixed as two settings. `breakBeforeCard`: an attack at two to one or
      better on a continent, a knockout or a finish counts in full before
      the card, as it is nearly as sure of the card as the easy capture.
      Anything less sure still gives way to the card (plan 4.14).
      `breakWithEverything`: such an attack is judged on the whole stack,
      and what stays behind is decided when moving in.

      One on one, the General turns that ended with a continent it could
      have broken at two to one still whole fell from 32 in 217 to 6 in
      218. Measured on the world map, seeds 5000, 20000, 90000, 40000:

      | General | 2 players | 4 players | Total |
      |---|---|---|---|
      | Before | 68 of 80 | 58 of 80 | 126 |
      | After | 70 of 80 | 64 of 80 | 134 |

      Tests from the traced games: the stack facing a big enemy still
      breaks the continent, and a three-to-one break beats a lone army for
      the card every time.
- [x] 4.34 **Knockouts for Greedy and the Planner, and two ideas that
      failed.** Nick: "I've played quite a few 4 computer player games now
      General vs planner vs greedy vs turtle. Turtle is nearly always
      winning." And he saw a player "totally ignore an opportunity to
      annihilate greedy who only had a single army on one country."

      Measured first. Over 40 games at that table the Turtle won 15, the
      General and the Planner 10 each and Greedy 5. Knockouts, though, were
      mostly taken: 90 of 94 chances. Greedy walked past 3 and the General
      1. Greedy and the Planner had no knockout rule at all and took them
      only because a lone army is an easy capture. Both now weigh a
      player's last territory at 20 and will take it at level odds
      (`GREEDY_SETTINGS`, `PLANNER_SETTINGS`). On 80 unseen games that
      moved the table from General 27, Turtle 29 to General 30, Turtle 27.

      **Two ideas measured and thrown away.** Policing harder
      (`leaveItToOthers` 0.6 and 1) changed nothing: the Turtle still won
      15 to 17. Leaning on the leader, where every territory of the
      opponent with the biggest income is worth 6 more, looked wonderful on
      the seeds it was chosen on (General 20 of 40) and then lost on 80
      unseen ones: General 28, Turtle 34, against General 30, Turtle 27
      with it off. Removed. That is spec S22 a fourth time.

      **On the Turtle winning:** over 80 unseen games it is level with the
      General, 27 to 30, not ahead. Nick's run of 40 games showed 15 to 10.
      Both are true; the bigger sample is the one to trust.
- [x] 4.35 **A player may roll fewer dice.** Nick: "The players always seem
      to roll the maximum number of dice they can. Is that right? ... if
      three dice are rolled then against 1 defender the attacker if he wins
      is required to move 3 armies into the destination, sometimes 2
      against 1 might be better in order to preserve the primary mass
      army."

      Right on both counts. An attack now carries an optional number of
      dice, 1 to 3, and rolls as many as the armies allow when it says
      nothing, so nothing changed for anybody who does not ask.

      Worked out exactly, by counting every roll rather than simulating
      (`scratchpad/dice-choice.mjs`). Against ONE defender with 20 armies:
      3 dice take it every time and leave 16.5 behind, 1 die takes it every
      time and leaves 17.6. So the tactic is real, and it is worth about
      one army. Against two or more defenders it is worse in every way: 10
      armies against 3 defenders win 97% of the time on three dice and 67%
      on one.

      Given to the Turtle, the player it suits best, it LOST games: its
      four-player wins fell from 40 in 60 to 33, because armies kept at
      home are territories not taken, and territories are income. So no
      computer player uses it. The engine keeps it, with tests, because it
      is the real rule and a person may want it. See spec 6.3.
- [x] 4.36 **No sitting ducks: the General guards what it denies.** Nick:
      "the computer players shouldn't [be] leaving sitting ducks for the
      next round... at the end of the round he would probably want to
      fortify alaska because almost certainly he would come under attack
      because of the motivation to regain north america."

      A territory of ours is a DENIAL when we hold exactly one territory of
      a region and one other player holds every other one. That single army
      is all that stops their bonus, and they have every reason to take it
      back. Such a territory is now garrisoned like a door into our own
      region: `denialGuard`, 2 armies more. Holding two of a region is not
      the same thing, so the rule does not fire there. A test from Nick's
      example: the General fortifies that lone territory rather than the
      quiet line behind its front.

      Measured on unseen seeds, guard 0, 2 and 4: the four-player table read
      General 13, 11, 14 and the Turtle 17, 21, 15, and head to head against
      the Turtle 35 - 5, 35 - 5, 36 - 4. So it changes no result outside
      the noise. It is kept because it is the behaviour Nick asked for and
      it costs nothing.
- [x] 4.37 **Costing the next player an army.** Nick: "if an attacker
      realises that the player playing next holds a number of countries
      exactly equal to that which would award him an extra army then a
      consideration should be given to taking one more country from the
      next player to play."

      Armies come one per three territories, never fewer than three. So
      taking one bites only when the victim sits on an exact multiple of
      three and above the floor: 12 becomes 3 armies a turn instead of 4,
      while 11 or 13 changes nothing (`losingOneCostsAnArmy`, with a test).
      Only the NEXT player counts, because anybody later has turns in
      between to win a territory back. Their land is then worth
      `taxIsWorth` more, 4.

      Measured on unseen seeds at 0, 4 and 8: the four-player table read
      General 8, 10, 8, and head to head 35 - 5, 34 - 6, 35 - 5 against the
      Turtle. No change outside the noise, and kept for the behaviour, like
      the denial guard. It only fires about one turn in three, and only
      nudges the choice between targets that were already close.
- [x] 4.38 **Chopping down a runaway leader: what worked and what did
      not.** Nick: "players should assess if one player is getting too much
      of a lead and increase the priority of attacking that player to knock
      him back to size", and "there are some tactics that every player
      should consider together with his overall strategic bias."

      A runaway leader is an opponent drawing at least 1.5 times the armies
      a turn that we draw, income counted with continent bonuses
      (`runawayLeader` in `board.ts`, shared by every thinking player).

      **What was measured, four-player tables of General, Planner, Greedy
      and Turtle, 40 to 50 games a version on unseen seeds:**

      | Version | General | Turtle |
      |---|---|---|
      | Nothing | 18 to 22 | 15 to 19 |
      | General leans on any opponent ahead of it (plan 4.34) | 28 of 80 | 34 |
      | General leans on a runaway, 1.25 or 1.5 times, worth 6 or 12 | 7 to 13 | 17 to 25 |
      | All three lean on a runaway | 10 to 13 | 16 to 20 |
      | Never leave a runaway's CONTINENT to others | 22 | 20 |
      | That, plus a flat weight of 4 | 19 | 18 |

      Adding worth to all of a leader's land lost games every way it was
      tried, alone or together. The reason is plain in the games: it sends
      players grinding at the best defended stacks on the board, and the
      Turtle is exactly the wrong player to grind against. Real ganging up
      also runs on talk and threats, which computer players do not have.

      **What is kept** is the narrow rule: the General never waits for
      somebody else to break a runaway leader's continent
      (`policeTheLeader`). It costs nothing measurable and it is the right
      instinct, so a test holds it in place, beside the ordinary play-order
      rule from plan 4.14.
- [x] 4.39 **Leaning on a runaway leader, but only where it is cheap.**
      Nick, on the finding above: "yes i agree, try it." Every earlier
      version made the leader's whole territory list worth more, so players
      ground against its best stacks. This one asks the question the other
      way round: when a capture is easy anyway, take it from the leader
      rather than from anybody else.

      It is judged when an attack is chosen, not when armies are placed, so
      the General never builds a stack to lean with. Cheap means at least
      `cheapLean` armies free for each defender, 3, and the target is then
      worth `leaderIsWorth` more, 12.

      Measured, four-player tables on two seed families, 50 games each:

      | Family | Off: General / Turtle | On: General / Turtle |
      |---|---|---|
      | 600000s | 12 / 28 | 16 / 14 |
      | 700000s | 17 / 24 | 17 / 21 |
      | Both | 29 / 52 | 33 / 35 |

      The Turtle's runaway wins fell in both families, so the direction
      holds even though the size does not. Head to head it changed nothing:
      13 - 7 against the Turtle either way, because with one opponent there
      is nobody else to lean on.

      So Nick's tactic works, once it is spent where the leader is thin
      rather than where it is strong.
- [x] 4.40 **Racing to finish off a dying player.** Nick: "when players can
      sense that another player is going to get wiped out soon there is
      often a race to be the one to do so in order to get his cards...
      but not always true because the target may have a large force amongst
      his remaining countries and grinding away at it is probably not the
      right move."

      Three things must hold together: they are down to `raceLand`
      territories or fewer (3), every army they hold anywhere is no more
      than the General has free for this attack, and the attack itself is
      cheap. Their land is then worth `raceIsWorth` (3) plus their cards.
      Two tests: it goes for them when it could finish them off, and when
      the same player keeps a garrison of 30 the rule stays out of the
      decision entirely.

      Measured on unseen seeds, five versions: 18 wins off, 15 to 20 on.
      No change outside the noise, so it is kept for the behaviour, like
      the denial guard and the next-player rule.
- [x] 4.41 **A card is worth what a set is worth now.** Nick: "the prize
      also scales according to how much a set is worth in the rising
      redemption version, early card sets are less valuable than later ones
      which might be worth 20 armies."

      `armiesPerCard` in `board.ts` is a third of the next set's value: about
      1.3 armies early, nearly 7 once sets reach 20, and 2.3 in a fixed-value
      game. The General's knockout rule used a flat 4 a card; it and the race
      rule now both use `cardsMatter` (3) times that figure, which is 4 early
      and rises through the game.

      Measured 80 games on fresh seeds against ignoring their cards
      altogether: the General is level, 24 to 25, and the Turtle's wins fall
      from 37 to 31. So it is kept at 3.
- [x] 4.42 **A tuner, and Optimus.** Nick: "is there a way that we could
      use machine learning techniques to work out the strongest strategy and
      tactics?"

      `tools/tune.mjs` is the cheapest of them and the one that keeps the
      game readable. Every number a player plays by is a dial. The tuner
      plays a spread of candidate settings, keeps the best few, narrows the
      spread around them, and repeats. That is the cross-entropy method: no
      neural network, and the answer is still a list of named numbers a
      person can argue with.

      It costs nothing in tokens: plain code on Nick's machine, no model
      calls anywhere in the loop. A four-player world game takes 156 ms on
      one core, so 15 cores play about 350,000 games an hour. The run that
      made Optimus was 25 rounds of 24 candidates at 48 games each, about
      30,000 games in six minutes.

      **The rules of measurement are built in** (spec S22): every round
      plays fresh seeds, and the winner is finally checked against today's
      settings on a family the tuner never saw. There it won 45.8% of games
      against 33.8%.

      **The tuner disagreed with us about four things**, and won: the line
      behind the front holds one army not two, the front holds half the
      biggest enemy beside it not all of it, breaking a continent is worth 2
      an army of bonus not 6, and attacks want a margin of 3 not 1, with
      twice as many armies kept to keep going. In short: a thinner line in
      fewer places, hitting harder where it hits.

      Nick: "Are we updating general or making a new personality?" A new
      one, named by Nick: "How about Optimus? Implying tuned and keep
      General as he is." `generalPlaying` in `general.ts` builds a player
      from a settings object, so the General and Optimus share every line of
      code and differ only in their numbers. The General we reasoned out by
      hand stays exactly as he was, and the pair measures what tuning is
      worth.

      **Optimus, on seeds nothing was tuned on:**

      | Four-player table, of 40 | Result |
      |---|---|
      | Optimus, Planner, Greedy, Turtle | Optimus 21, Turtle 14, Planner 4, Greedy 1 |
      | Optimus, General, Planner, Turtle | Optimus 18, Turtle 13, Planner 5, General 4 |
      | Optimus, General, Turtle, Counter | Optimus 21, General 9, Turtle 8, Counter 2 |

      | Head to head | Result |
      |---|---|
      | v General | 10 - 20 |
      | v Greedy | 13 - 17 |
      | v Planner | 14 - 16 |
      | v Cautious | 16 - 14 |
      | v Turtle | 23 - 7 |
      | v Counter | 24 - 6 |

      So Optimus is a TABLE specialist: it beats the General 18 to 4 with
      four players and loses to it 10 to 20 head to head. That is exactly
      what it was tuned for, and the honest limit of one run against three
      fixed opponents. Next: tune its one-on-one settings the same way, then
      the self-play league, where it must prove itself against a changing
      population instead.
- [x] 4.43 **Optimus plays a scattered board differently from a coalesced
      one.** Nick: "there must be a factor related to the maturity of the
      board, the game starts with a random distribution but starts to
      coalesce into clusters... Is there merit in having Optimus being able
      switch to a different tuning either by number of players being faced
      or the board maturity state?"

      Maturity, not player count. `boardMaturity` in `board.ts` is the share
      of the map's borders that join two territories of the SAME owner,
      normalised so that 0 is as scattered as the deal leaves it and 1 is
      solid blocks, whatever the number of players. It needs no memory.
      Measured through real games: a four-player board runs 0.20, 0.50 by
      round 5, 0.68 by round 9, then a plateau near 0.75. Two-player games
      start at 0.49 raw, which is why the normalising matters.

      Optimus now carries a second set of numbers, used once maturity
      reaches 0.4, about round 5 of a four-player game (`OPTIMUS_LATE`).
      The tuner learned it on its own. What it chose, read together: on a
      board of blocks, hold an even thinner front (0.3 of the enemy stack)
      with deeper stacks behind it (6 spare), and treat finishing YOUR OWN
      continent as the game (`onPlan` 9 to 15) while chasing the card far
      harder (`cardOdds` 7.5 to 16.5). Small change falls away: taxing the
      next player and racing a dying player's cards both drop.

      Measured, four-player tables on seeds nothing was tuned on:

      | | Optimus | Turtle | Planner | Greedy |
      |---|---|---|---|---|
      | One set, 120 games | 57 | 45 | 15 | 3 |
      | Two stages, 120 games | 66 | 38 | 12 | 4 |

      An earlier 40-game family showed 24 against 24, and the tuner's own
      held-back check said 57.5% against 50.8%. So the gain is real but
      small, and only a large sample sees it. Head to head nothing changes,
      because a two-player board is coalesced almost from the start.
- [x] 4.44 **Optimus learns the one-on-one game, and the tuner gets four
      new dials.** Nick: "what can be done to improve optimus further?"
      then "ok do them in the recommended sequence."

      **Its worst result first.** Optimus lost to the General 10 - 20 head
      to head, because it had never been tuned there: its one-on-one
      settings were still the General's hand-written ones. The tuner now
      plays several tables at once (`--tables`), so a setting cannot suit
      one opponent alone, and learned `OPTIMUS_DUEL` over four of them.

      What it chose reads like a different game, which it is: attack at a
      margin of 1 rather than 3, chase the card harder, and value costing
      the only opponent an army a turn far more (4.5 to 7). Finishing our
      own continent drops to nothing, because head to head the game is the
      opponent, not the map.

      | Optimus, two players | Before | After |
      |---|---|---|
      | v General | 10 - 20 | 15 - 15 |
      | v Greedy | 17 - 13 | 21 - 9 |
      | v Planner | 16 - 14 | 18 - 12 |
      | v Turtle | 27 - 3 | 28 - 2 |

      On the tuner's own held-back games it was 62.5% against 54.6%, and
      the four-player table did not suffer.

      **Four decisions became dials**, each starting at exactly what the
      code did before, so the General is unchanged: when to trade a set
      (`tradeAt`), whether to roll one die at a lone defender
      (`oneDieAbove`, the rule from plan 4.35 that no player used), how
      close counts as a tie when choosing between moves (`nearlyAsGood`),
      and how much garrison to leave behind after a capture
      (`keepAfterCapture`). A tuner can only turn dials that exist.
- [x] 4.45 **A bigger tuning run, a self-play league, and where the gains
      stopped.** The rest of Nick's sequence, and the answer is mostly
      negative, which is worth writing down.

      **A bigger run.** 30 rounds, 24 candidates, 80 games each over two
      tables, with the four new dials. It won 54.8% against 51.2% on 480
      held-back games. On a FRESH family it lost, 37 of 80 against 42. So
      the gain was luck. What the new dials said still stands, because they
      barely moved: trading a set at once beats hoarding, rolling one die
      at a lone defender is not worth using, and playing a little more
      decisively (`nearlyAsGood` 0.1 to 0.06) helps.

      **A league** (`tools/league.mjs`, `npm run league`). Candidates play
      EACH OTHER in tables of four, winners breed, and past champions stay
      in the field so the league cannot go round in circles. Our shipped
      players join as candidates, because every player here is the General
      with some numbers. Its champion beat Optimus 41 to 25 in its own
      check, then drew level on fresh games, 59 against 56 over 120
      four-player games, and was WORSE head to head, 15 against 19. Not
      adopted.

      **The finding that matters: our measurement floor is about 5 points.**
      Twice today a 3-to-4-point gain measured over 480 games vanished on
      the next family. So further tuning must be judged on thousands of
      games, not hundreds, and gains smaller than that cannot be told from
      luck. Optimus stays as plans 4.42, 4.43 and 4.44 left it.

      What is left, in order of what it would really buy: a much larger
      evaluation budget so small gains can be seen at all; more decisions
      turned into dials; and, the only big step, looking a whole turn ahead
      and scoring the position at the end, which no amount of tuning can
      substitute for.
- [x] 4.46 **Looking ahead: built, measured, and taken out again.** Nick:
      "let's build the look ahead." A player called Oracle: for each move
      worth thinking about, play it, finish the turn, let every opponent
      reply, and score the board that results. Territories, income, armies
      and cards, minus the best opponent's. The engine is pure, so a player
      can play hundreds of imaginary games and drop them.

      **It lost, every way it was built: about 13 - 27 to Optimus over 40
      head-to-head games.** The experiments, in the order that found the
      cause:

      | What Oracle did | Against Optimus, 40 games |
      |---|---|
      | Simply played Optimus's move | 22 - 18 |
      | Played the first move of its own shortlist | 22 - 18 |
      | Chose by playing each candidate out | 12 - 28 |
      | The same, but only departing on a 15, 40 or 80 army difference | 12 to 13 - 27 to 28 |
      | The same, with 6 or 10 imagined games a candidate | 12 to 14 - 26 to 28 |
      | The same, ending its own turn at once to cut the dice | 12 to 14 - 26 to 28 |

      So the plumbing was right and the shortlist was right. **The judging
      was wrong, and it is the winner's curse.** Each candidate's score is a
      handful of imagined games, and the dice diverge the moment two
      candidates make different attacks, so "the same dice for everyone"
      does not survive the first roll. The spread between candidates is
      then far larger than the real difference between them, and taking the
      best score picks the luckiest playout rather than the best move. More
      samples shrink that spread far too slowly, and a higher bar for
      departing does not help because the noise is bigger than any bar
      worth setting.

      Two wrong turns worth remembering. The first version scored armies
      and income only, so an attack, which costs armies and gains a third
      of an army of income, looked like a loss and it learned to sit still;
      counting territories fixed that. The second seeded its imagined games
      from the position, which turns Optimus's random tie-breaks into a
      fixed rule and cost games before any searching happened: 13 - 27 on
      its own.

      **What it would take to do properly:** resolve imagined attacks by
      their EXPECTED losses instead of rolling dice, using the odds worked
      out in spec 6.3. That removes the luck entirely and makes small
      differences visible. It also means a second, simplified simulator
      beside the real rules, which can silently disagree with them, so it
      needs its own guard test. That is a real piece of work and it was not
      worth starting on the back of a failed first attempt.

      Oracle is removed rather than shipped: a slower, weaker player helps
      nobody. Optimus remains the strongest.
- [x] 4.47 **The four new dials, one at a time.** Nick: "how about trying
      the new dials?" The big retune of plan 4.45 moved 28 numbers together
      and drowned in noise. One dial at a time, 120 four-player games and
      40 against the General each, on unseen seeds:

      | Optimus with | Table, of 120 | v General, of 40 |
      |---|---|---|
      | its own numbers | 74 | 21 |
      | trade at 4 cards | 63 | 22 |
      | trade at 5 cards | 65 | 21 |
      | one die when 6 armies free | 36 | 17 |
      | one die when 10 free | 50 | 21 |
      | tie width 0.06 | 68 | 23 |
      | tie width 0.2 | 57 | 19 |
      | keep 0.6 of the garrison | 69 | 20 |
      | keep 1.4 of the garrison | 61 | 19 |

      Nothing changes: what Optimus already does wins every comparison. Two
      findings are well clear of the noise floor, though.

      **Rolling fewer dice is bad, 36 against 74.** The arithmetic in plan
      4.35 was right, and beside the point: one die does take a lone
      defender just as surely and keeps about an army more where it stands,
      but the forced move-in is the POINT. Armies that stay behind are
      armies not taking the next territory. The Turtle losing games with
      the same tactic was not luck.

      **Holding cards for a bigger set costs games,** 63 or 65 against 74.
      Sets do rise in value, but armies now beat armies later.

      This is also the cleanest measurement of the session, because one
      change at a time is what our sample sizes can actually see.
- [x] 4.48 **Joining our own blocks: measured, and left out.** Nick: "if
      the player has more than one cluster of conquests he should give
      value to try to link them up in order to permit fortifications from
      one zone to another", and "several personalities should qualify for
      this tactic."

      The reasoning is right: armies move any distance through our own
      land, and no distance at all between blocks that do not touch, so a
      territory joining two blocks turns two armies into one army twice the
      size. It was built as a shared tactic beside `isTheirLast` and
      `runawayLeader`: work out our blocks, and value an enemy territory
      that touches two or more of them. The second version valued a join by
      the size of the smaller block joined, capped at three, so linking a
      lone island counted for little.

      Every personality was measured with it, one at a time, 120
      four-player games each on unseen seeds, everybody else's copy of the
      tactic switched off:

      | Player | Off | On |
      |---|---|---|
      | Optimus | 66 | 51 |
      | Turtle | 83 | 73 |
      | Planner | 17 | 13 |
      | Greedy | 9 | 9 |
      | General | 33 | 38 |
      | Counter | 8 | 13 |

      It costs the two strongest players plainly. The two apparent gains
      were 5 games in 120, inside the noise, and neither survived a check
      on a fresh family: the General went 43 to 37 with it, the Counter 6
      to 7. So it is removed.

      **Why a right-sounding idea does not pay.** Our players already fight
      along their own borders, and continents are contiguous by nature, so
      their land tends to be one block anyway. When it is not, a separate
      reward for bridging pulls attacks towards awkward targets they were
      right to ignore. The value of joining is largely already counted, in
      the plan and in the front line.
- [x] 4.49 **Looking ahead without dice: the odds table is kept, the
      lookahead is not.** Nick asked to hear more about the deterministic
      lookahead named at the end of plan task 4.46, then said to build it.
      It was built in the four steps set out then, measuring at each.

      **Step 1, the odds table. It works, and it stays.**
      `src/engine/odds.ts` answers exactly what a fight to a finish comes
      to, with no dice rolled: 20 armies against 15 take it 82.2% of the
      time, leaving 7.83 of mine and 0.72 of theirs. Two things keep it
      honest. The one-exchange odds are COUNTED rather than restated, by
      walking all 6^5 dice combinations through the real `resolveAttack`,
      so it cannot disagree with the rules about ties or pairs. The
      chaining is checked by `odds.test.ts`, which rolls 20000 real fights
      at each of eleven sizes: the worst gap is 0.007 on the chance and
      0.036 on the armies.

      That guard was mutation-tested rather than trusted, because a guard
      nobody proves is a guard that fails open. Three deliberate mistakes,
      each failing many tests: giving ties to the attacker (12 failed),
      stopping the attack one army early (10), and rolling one defending
      die instead of two (9).

      **Steps 2 and 3, the lookahead itself. No signal, at any weight.** A
      move was scored by the board it would leave: the chance of taking it
      times how good the board is if taken, plus the chance of failing
      times how good it is if failed. Both endings are exact, because a
      failed attack always leaves exactly one army. Step 3 added the
      opponent HITTING BACK at what the move just touched, which is the one
      thing a player cannot read off the board as it stands.

      It was added to Optimus as a single dial, so that zero is exactly
      Optimus today. 120 four-player games a setting, every seat played,
      Optimus against Turtle, General and Planner:

      | seeAhead | Family A | Family B |
      |---|---|---|
      | 0 (off) | 63 | 58 |
      | 10 | 58 | 64 |
      | 25 | 58 | |
      | 50 | 46 | |
      | 100 | 55 | |
      | 10, with the reply | 61 | 55 |
      | 25, with the reply | 53 | |
      | 50, with the reply | 52 | |
      | 100, with the reply | 55 | |

      The same dial at 10 went five games DOWN on one seed family and six
      games UP on another. Pooled, it is 122 of 240 against the baseline's
      121. That is the measurement floor of about five points, and nothing
      else in the sweep climbs out of it either. The reply did not rescue
      it, and cost about 60% in speed.

      **The one result worth keeping from the failure.** With the hand
      terms switched off entirely, so the imagined board CHOSE every
      attack, Optimus scored 52 of 120 against 63 for the full hand-tuned
      version. An evaluation of four made-up weights is only nine games
      behind roughly twenty dials tuned over several sessions. The
      evaluation is not the weak part. The lookahead is simply telling
      Optimus things it already knows: it fights along its own borders,
      values continents and counts odds by hand already, so a one-attack
      position score is largely a restatement.

      A bug worth recording, because the guard earned its keep. Turning on
      the reply crashed at once: `A fight needs whole armies, not 2 against
      1.6392430206941389`. An imagined board carries fractional armies, and
      the reply then asked the odds table about them. The strict guard
      refused rather than quietly answering something wrong, which is
      exactly what it is for. Rounding belongs at the imagination boundary.

      `imagine.ts` and both dials are removed. `odds.ts` stays: it is
      exact, it is tested, and it would answer a question a PLAYER might
      like asked out loud, which is what an attack is likely to cost before
      committing to it.
- [x] 4.50 **How to rank a position: measured, and why a ranking is not a
      move chooser.** Nick, on the failure above: "How do you rank the value
      of a player's position? I would think it is determined by the total
      number of armies a player has and the likely income he will receive
      from that position by the time his turn comes around next... Either
      way for the deterministic idea to work we need a post move ranking."

      The judging in plan task 4.49 used four numbers made up on the spot.
      This measured them instead. 240 four-player games were played and
      every live player's position was recorded at every turn boundary,
      82846 positions in all, each labelled with whether that player went
      on to win. A logistic fit then asked which numbers predicted the
      winner. **Every model below is scored on 240 DIFFERENT games, from a
      seed family the fit never saw.**

      | What the model looks at | Loss | Right |
      |---|---|---|
      | Guessing nobody wins | 0.6094 | 70.7% |
      | Armies alone | 0.5466 | 73.9% |
      | Land alone | 0.4937 | 76.7% |
      | Income alone | 0.4989 | 77.3% |
      | Armies + income (Nick's pair) | 0.4927 | 77.8% |
      | Armies + income + income x wait | 0.4911 | 77.9% |
      | Land + armies + income | 0.4876 | 77.5% |
      | Shares of the board | 0.4704 | 78.0% |
      | Shares + cards + front line + bonus | 0.4653 | 78.4% |
      | The same, judging armies AFTER income arrives | 0.4645 | 78.4% |
      | The same, discounted by the wait | 0.4633 | 78.6% |
      | Against the best opponent | 0.4560 | 78.8% |
      | Everything at once | 0.4388 | 79.1% |

      **What the numbers say.**

      1. **Income beats armies as a single measure** (0.4989 against
         0.5466). Nick's pair is right that both matter, but they are not
         equal partners.
      2. **The exchange rate is about thirty to one.** In the land + armies
         + income fit the weights are land 0.107, income 0.111, armies
         0.0037. One territory, and one army of income per turn, are each
         worth roughly THIRTY armies standing on the board. The guess in
         4.49 put it at ten, so it over-valued armies threefold.
      3. **Shares beat counts.** What matters is not how many armies you
         hold but what share of every army on the board is yours: as a
         weight, 5.9 against 0.0037 for the raw count.
      4. **Nick's "by the time his turn comes around" is real, and has the
         sign he predicted.** Income multiplied by the number of players
         who move first carries a NEGATIVE weight of -0.022 against
         income's +0.281. Income three seats away is worth about a quarter
         less than income you collect next. It improved the held-out loss
         every time it was added.
      5. **A long front line is a weakness**, at -0.039 a territory. That is
         why a corner region is worth more than its bonus says.
      6. **Judged against the field beats judged alone** (0.4560 against
         0.4876). A position is only good compared with the best opponent.

      **And then the part that matters most: it does not work as a move
      chooser.** Wired in as the judging for the lookahead, at every weight:

      | seeAhead | Won of 120 |
      |---|---|
      | 0 (off) | 63 |
      | 20 | 59 |
      | 100 | 63 |
      | 400 | 63 |
      | 1500 | 56 |
      | Choosing every attack alone | **30** |

      Choosing attacks on the measured ranking alone scored 30 of 120,
      against 52 for the made-up one it replaced. A ranking fitted to
      predict the winner got WORSE at picking moves the better it got at
      predicting.

      The cause was checked rather than guessed. Over one game, the
      measured judge called 1074 of 1335 available attacks a WORSENING of
      the board, and on nine turns in fifty-four even the best attack
      available scored negative. At the opening every attack scored exactly
      -0.0389, which is precisely the front-line weight: the land gained and
      the armies lost cancel, so the whole verdict is "you now have one more
      territory facing an enemy, which is bad".

      **Why a good description makes a bad guide.** The fit says winners
      hold a large share of the armies. That is true. But attacking SPENDS
      armies, so a rule that maximises army share says never attack, and
      never attacking is how you lose. The model learned what winning looks
      like, not what causes it. This is the same trap Oracle fell into in
      plan task 4.46, reached from the opposite direction, and the data
      walked straight back into it.

      **Nick's own fix was tried and did not rescue it.** Judging a position
      by the armies it WILL hold once income arrives predicted slightly
      better (0.4645 against 0.4653), but left the incentive almost
      untouched: 1072 of 1335 attacks still scored negative. The reason is
      a rule, not a weight. Income is `floor(land / 3)`, a step. One
      territory usually adds NO income at all. So counting future income
      rewards nothing except at every third capture.

      **What is worth keeping.** The ranking is a good ranking. It names the
      winner from the board alone 78.4% of the time, on games it never saw,
      against 70.7% for guessing. The weights, should anyone want them
      again: land share 2.976, army share 5.898, each card 0.101, each
      front-line territory -0.039, each army of region bonus 0.079, starting
      at -3.722, read as a log-odds. That would make an honest "who is
      winning" reading for a player, which is a thing to SHOW, not a thing
      to steer by. It is recorded here rather than shipped, because nothing
      in the game asks for it yet. **Shipped the next day as the leaderboard
      of plan task 4.51.**
- [x] 4.51 **The scores panel is a leaderboard.** Nick: "the scoring could be
      used to sort the player's panel of counts into a leadership board that
      updates during the game."

      `engine/strength.ts` carries the weights measured in plan task 4.50.
      The panel gains a Winning column beside Land and Armies, showing each
      player's chance as a figure with a bar behind it, and the rows are
      ordered by it so the table reorders as the game turns. A player who is
      out reads "out" and sits below everyone still in. See spec S30.

      The chances are scaled to add up to 100%. The fit answers each player
      separately, so four players can each honestly read "40%", which is no
      use as a table.

      **The argument for showing it, which is not a cosmetic one.** Optimus,
      the General and the others already work out who the leader is every
      turn and gang up on them. A person at the table was guessing. The
      column levels information the rules never meant to weight one way.

      Driven live in the browser on a World game of Optimus, Turtle and
      Planner. The order changed from Optimus, Planner, Turtle to Turtle,
      Optimus, Planner within two rounds, and the reason was readable in the
      other columns: the Planner led on land with 16 and still ranked last,
      because its armies were fewer and its front line long. Checked in both
      light and dark, no console errors. Six new tests, 579 green.

      **The guard that matters** plays sixty whole games and checks that the
      player on top of the table one move BEFORE the end is the player who
      wins. Measured at 100% on those seeds; the bar is set at 80%, because
      the point is that the table tracks the game rather than that it is
      never wrong.

      `strength.ts` is imported by the screen and by nothing in `players/`,
      which spec S30a states as a rule. Plan task 4.50 measured what happens
      when a player chooses moves by it: 30 games of 120 against 63.

      **The sorting was taken out again, the next day.** Nick: "restore the
      player board as it was before, it's more important to know who is
      playing next than who the current leader is, and besides with the %
      and bar graph we are providing that information anyway." Right on both
      counts. Turn order is the one thing the panel can say that nothing
      else on the screen says, and sorting spent it to repeat what the bar
      already shows. The column stays, the order goes back. Spec S30.

      **A Cards column, added 2026-09-15.** Nick: "the player board is
      missing representation of how many cards each player has." How MANY,
      never which, which is how the real game works. A hand of five is
      marked, because the rules then force a trade on that player's next
      turn and a pile of armies is coming.

      It went in wearing the class name `cards`, which is already the cards
      PANEL: a padded white box with a border and rounded corners. The table
      cell wore all of it and drew a box down the middle of the scores. No
      test could have caught that, and it was only found by looking at the
      screen. Renamed to `in-hand`, with the reason written beside it.
- [x] 4.52 **Planning a whole turn: built, measured, and the end of this
      line of work.** Nick: "In order to make a deployment and attack plan
      at the start of a turn, do you determine a finite set of different
      approaches, measure the likely position strength of each post move and
      then pick the highest score?" Yes, and that is what was built.

      **A player called Seer.** Six whole-turn aims, each one coherent and
      nameable: finish the region we are nearest to owning, break the region
      the leader holds whole, cut the leader down, knock out a player who is
      nearly gone, take the easy ones, press the weakest neighbour, and sit
      tight. A finite SAMPLE, because deploying eight armies across twelve
      frontier territories alone is 75582 choices before a single attack is
      sequenced. Each aim is played out to the end of the turn with the odds
      table of 4.49, no dice, and the board it leaves is scored with the
      measured ranking of 4.50. Everything that is not a deployment or an
      attack is left to Optimus, so the measurement is about the planning
      alone.

      **It lost, and no dial rescued it.** 120 four-player games, every seat
      played, against Optimus, the Turtle and the Planner:

      | Change | Seer | Optimus |
      |---|---|---|
      | As built | 20 | 53 |
      | Attack bars 0.4 / 0.3 / 0.2 | 11 | 64 |
      | Attack bars 0.25 / 0.2 / 0.15 | 15 | 52 |
      | Attack bars 0.15 / 0.1 / 0.05 | 7 | 67 |
      | Attack bars all 0.05 | 9 | 65 |
      | Judge's army weight 4 | 17 | 59 |
      | Judge's army weight 2 | 16 | 59 |
      | Judge's army weight 0 | 13 | 62 |

      Head to head on an unseen seed family, 60 games: Seer 20, Optimus 40.

      **The measurement that reopened this was confounded, and I said so at
      the time and built anyway.** Plan task 4.50 ended by showing the
      ranking rising with the territories taken in a turn: -0.11 for a turn
      that took nothing, up to +1.22 for five or more. That looked like the
      answer to 4.50's failure. It was not a controlled comparison. Turns
      where a player took five territories were turns where that player was
      already strong and rising for other reasons.

      The controlled comparison is the one Seer makes: the SAME board, the
      SAME armies, attack or do not. Watched over 128 Seer turns, **"sit
      tight" won 41 of them**, nearly a third. Taking one territory gains
      about 0.07 of land share, costs about 0.07 of army share and another
      0.04 for the longer front line, so it nets out slightly negative. The
      ranking is right about the long run and cannot see the compounding
      from one turn away.

      Turning the army weight down to zero did not help either, which rules
      out passivity as the binding constraint. Seer is simply weaker: six
      crude plans chosen perfectly lose to twenty tuned terms chosen
      greedily.

      **The verdict on the whole line of work.** Four framings now, all
      measured, none paying:

      | Attempt | Result |
      |---|---|
      | 4.46 Oracle, rolled dice | 13 - 27 |
      | 4.49 One attack, guessed judge | No signal at any weight |
      | 4.50 One attack, measured judge | 30 of 120, against 63 |
      | 4.52 Whole-turn plans, measured judge | 20 of 120, against 53 |

      The pattern across all four is the same. Optimus already holds the
      information a lookahead would add. It fights along its borders, values
      continents, counts odds, races a dying player and gangs up on a
      leader. Judging the position afterwards restates what it already knew,
      and the restatement is cruder than the original.

      Seer and `imagine.ts` are removed. What stays is what measured:
      `odds.ts` from 4.49 and `strength.ts` from 4.50 and 4.51, both of them
      shipped and both earning their place on the screen rather than in a
      player. Anyone rebuilding Seer has the whole design above; the reason
      not to is in the tables.
- [x] 4.53 **The ruler was too short. Optimus improves once it is not.**
      Nick, on the four failures above: "so we've made the strongest player
      we can with Optimus and there's nothing worthwhile doing to improve
      him?" No. We had never measured well enough to know.

      **The floor was self-imposed.** This plan had recorded for weeks that
      measurements have a floor of about five points, and had discarded
      everything smaller. That came from choosing 120-game samples, and
      nobody checked what a bigger one costs. **1200 games take 32
      seconds.** Three seed families, same four players, gave 46.3 / 46.5 /
      44.3 percent for Optimus: about two points of spread, not five to ten.
      Spec S22a now sets 1200 games as the smallest comparison worth
      reporting.

      **The tuner was worse.** `tune.mjs` judged each candidate on 12 seeds,
      which is 48 games. The error on 48 games is about seven points, so it
      could not tell apart two candidates less than roughly twenty points
      apart. It was choosing at random among everything reasonable, and its
      own honest held-back check kept reporting, correctly, that the winner
      was no better. We blamed the ideas. Raised to 480 games a candidate,
      and the league with it.

      **Then every dial was swept, one at a time, 1200 games each**, 111
      changes, 87 minutes. Nothing cleared one standard error, which is
      about 24 games. The six best were taken to four fresh families and
      pooled over 4800 games each, then the survivors to 8820, then three
      more families. What survived:

      | Change | Pooled, 26460 games | Sigma |
      |---|---|---|
      | `onPlan` 9 to 16, `secondLine` 1 to 2, `tradeAt` 3 to 4 | +370 | 3.2 |
      | `onPlan` 16 alone | +180 over 17640 | 1.9 |
      | `secondLine` 2 and `tradeAt` 4, without `onPlan` | +34 over 8820 | 0.5 |
      | `retakeIsWorth` 11 | +9 over 8820 | 0.1 |

      That is **44.5% to 45.9%**, confirmed on a fourth family the work
      never touched: 4052 of 8820.

      **Two of the three are corrections, not discoveries.** `secondLine`
      says what the line behind the front holds, and its own comment quotes
      Nick: "at least more than one". The tuner had cut it to exactly one.
      `tradeAt` 4 was rejected in plan task 4.47 on 120 games. Only `onPlan`
      is new, and it says something worth saying: a scattered board should
      chase a continent about as hard as a coalesced one already does. The
      two-stage split of plan 4.43 had the early value at 9 against the late
      15, and that gap was wrong. `onPlan` is flat between 16 and 20 and
      falls away by 26.

      **A trap the four families exposed.** On one of them EVERY candidate
      beat the baseline by 30 to 46. That is not six discoveries, it is one
      low baseline draw: baselines across four families ran 493, 523, 535,
      558 at 1200 games. Anyone reading a single family would have shipped
      six false wins. Confirm on a fresh family, always.

      **A real bug the sweep found.** Some dials moved NOTHING at any value,
      which should be impossible. `general.ts` read
      `GENERAL_SETTINGS.leaveItToOthers` instead of `rules.leaveItToOthers`.
      Optimus shares that code, so its tuned 0.25 was thrown away and it
      quietly used the General's 0.3. Nothing ever failed, and the tuner
      went on tuning a number nothing read. Fixed, and guarded by
      `players/dials.test.ts`, which reads the source and fails if any
      setting is named off one player's object. Proven to block by stashing
      the fix: it fails on the old line and passes on the new. See spec S31.

      `knockoutIsWorth` is live but fires only when a player is down to
      exactly one territory, which is too rare to measure. Not a bug, and
      not doing much. `oneDieAbove` is confirmed badly harmful at far higher
      confidence than 4.47 could reach: -142 and -95 games.

      **What this says about everything above.** Every "inside the noise"
      verdict in tasks 4.20 to 4.52 was recorded at 120 games. They are not
      wrong, they are blind, and each should be read as "not measured". The
      four lookahead failures stand: 20 of 120 is far outside any noise
      floor. The small stuff was never measured at all.
- [x] 4.54 **The tuner, run once with a working ruler: Optimus gains seven
      points.** With the sample raised from 48 games a candidate to 480
      (plan task 4.53), the same cross-entropy search that had found nothing
      for weeks moved all 28 numbers together and found a large, real gain.
      20 rounds, 24 candidates, about 230000 games, 95 minutes.

      Its own held-back set said 50.0% against 57.3%. That was big enough to
      be suspicious of, so it was checked four ways on seed families it
      never saw:

      | Against | Before | After | Sigma |
      |---|---|---|---|
      | Planner, Greedy and the Turtle | 49.7% | 56.6% | 9.3 |
      | Turtle, General and Planner | 45.2% | 48.9% | 4.5 |
      | the General, head to head | 47.0% | 53.0% | 4.1 |
      | the Turtle, head to head | 85.1% | 88.3% | 3.0 |

      Then verified once more with the SHIPPED build on a family none of the
      work had touched: 48.8% and 56.4% on the two four-player tables.
      Against 44.5% where the day started, that is **more than four points**.

      **The gain was in the interactions, and this is the lesson.** The
      one-at-a-time sweep of 4.53 tested 111 changes at 1200 games each and
      found nothing above one standard error. Moving the dials TOGETHER
      found seven points. A one-at-a-time sweep cannot see an interaction by
      construction, however many games it plays. It is the right tool for
      finding a broken dial and the wrong one for finding a better player.

      **Two findings arrived twice, by different roads.** The tuner chose
      `onPlan` 15.47 and `tradeAt` 4 from scratch, where the morning's hand
      sweep had chosen 16 and 4. Agreement between two methods is worth more
      than either alone.

      **`secondLine` stays at 2.** The tuner wanted 1. Measured over 17640
      games the two are level (+55 and +16 to 2, 0.8 sigma), so the tie goes
      to Nick's rule that the line behind the front holds "at least more
      than one".

      **One dial moved for the first time ever.** `leaveItToOthers` went
      0.25 to 0.41. It had been read off the General's own numbers by
      mistake, so every past tuning of it was thrown away. Plan task 4.53
      fixed that hours earlier, and this is the first run in which the tuner
      could move it at all.

      The largest changes read as a coherent player rather than a scatter:
      chase cards far harder (`cardOdds` 7.5 to 16.94), punish the next
      player twice as hard (`taxIsWorth` 4.5 to 8.31), care far less about
      the prize on a runaway leader but lean much harder on cheap odds
      before going (`leaderIsWorth` 7 to 2.21, `cheapLean` 2.5 to 3.72), and
      push on after a capture instead of leaving the garrison the front line
      asked for (`keepAfterCapture` 1 to 0.44).

      The General is unchanged, as always. That is the point of the pair:
      the difference between them is now worth about eleven points, and it
      is all measurement.
- [x] 4.55 **Watching a finished game again.** Nick: "could we create a post
      game replay animation, no sounds, that lets the human player see the
      map change as it was played? The player board should track with it."

      It cost very little, and the reason is spec S2 and S3. The engine is
      pure and never changes a value in place, and every dice roll comes
      from a source handed in. So a whole game is three small things: the
      board it started on, the actions taken, and the dice seed. **No board
      is stored.** A long game is a few thousand small objects, not a few
      thousand boards.

      The replayed board simply takes the place of the live one at the one
      line in `App.tsx` that chooses which board to draw. So the map, the
      scores panel and the history all follow it without knowing it is a
      replay. That is the whole of "the player board should track with it".

      **A frame is one MOVE.** Whole turns were built first and Nick was
      right that they jump: "moves will be nicer to watch, by turns will be a
      bit jerky." Moves flow, because armies gather and a border gives way a
      little at a time. It plays at 5 to 50 moves a second with a slider.
      `turnStarts` was written, tested and then deleted rather than left
      unused.

      Sounds and dice are both out, as asked. Sounds come free: they are
      only played by the code that makes a real move, and a replay never
      calls it.

      **The bug this found, which only driving it could find.** With the
      board swapped underneath, the computer players read a position from
      the MIDDLE of the game and tried to move in the finished game behind
      it: "Optimus has already won." The taps and the set bell had the same
      fault. All three now stand down while a replay shows, which is spec
      S32b. The test suite could not have caught this: every test was green
      throughout.

      The guard that matters is `engine/replay.test.ts`. It plays whole
      games keeping every board, then replays and compares board for board,
      log and all, because a second way of producing states can quietly
      disagree with the first. If it ever fails, the engine has stopped
      being pure, which is worth knowing whatever the replay is doing.

      Not offered across iPads: there the moves were made elsewhere and this
      device never recorded them. Driven live end to end, 590 tests green.
- [x] 4.56 **Region bonuses are paid at the start of a turn, and now the
      screen says so.** Nick: "check that continent bonuses are being applied
      at the start of the turn."

      They were. `reinforce.test.ts` already checked the sum, but nothing
      checked that the GAME hands that sum over when a turn begins, so
      `turn-start.test.ts` now plays whole games and stops at every turn
      start, working out what is owed by hand from the board rather than by
      asking `reinforcementsFor` to check itself. 1804 turn starts on all
      three maps, 824 of them carrying a bonus, none wrong.

      Proven to block rather than trusted: with the bonus deliberately
      dropped from the sum, three of its four tests fail.

      **But nothing on screen said so**, which is almost certainly why the
      question was asked. The turn panel only ever read "7 armies left to
      place". It now lists where they came from, for example "4 territories
      3 · The West +3 · Cards +8". The parts are recorded when the turn
      begins rather than worked out again, because with `cardTrading:
      'anyTime'` a set can be traded after the board has changed hands.
      Spec S34.
- [x] 4.57 **The player's own cards, above the map, and the rule that makes a
      card a benefit to a territory.** Nick: "a player should be able to see
      a representation of his own cards. Put their images above the map.
      Should include the card type and the country it is a benefit for."

      **The rule did not exist.** In the printed rules, trading a set that
      includes a card showing a territory you hold puts two extra armies
      there. Spec 14 had left it out, "until trading works", and trading had
      worked for weeks. Without the rule, "the country it is a benefit for"
      would have described a benefit the game never paid.

      Built as option `territoryCardBonus`, on by default. The armies go
      straight onto the territory, since the rules give no choice of where,
      and that is what removed the "fiddly special case in the screen" that
      had kept it out. Once a turn at most; when several cards qualify, the
      one facing the most enemy armies. A game from before the option is
      played without it. The new game screen offers it, and the choice is
      remembered: turning it OFF was being forgotten at first, because the
      remembered-setup reader kept only words and one number.

      **Measured: it changes nothing about who wins.** 1200 four-player games
      a line on two seed families, Optimus, Turtle, General and Planner:

      | | Off | On | Off, 2nd family | On, 2nd family |
      |---|---|---|---|---|
      | Optimus | 49.8% | 48.4% | 47.7% | 48.6% |
      | Turtle | 30.9% | 30.3% | 29.5% | 31.2% |
      | General | 15.0% | 16.8% | 17.5% | 15.1% |
      | Planner | 4.3% | 4.5% | 5.3% | 5.2% |

      Pooled, Optimus wins 1170 of 2400 with the rule off and 1164 with it
      on. Every difference is inside one standard error, and the two
      families disagree about which way each small difference goes. Every player collects
      the bonus the same way, so it moves armies without moving the
      balance.

      **The cards.** The side panel moved above the map, and each card is
      now drawn upright: its symbol, the territory it shows, and a footer
      saying who holds that territory now, "Yours: +2 here", "Yours",
      "Held by Turtle" or "Any territory". A band along the top is the
      holder's colour, so a card matches the map at a glance. Spec S33.

      Checked on a throwaway preview page with a made-up hand covering every
      case, in light and dark, then deleted. 13 tests for the rule, 627 in
      all.

      **Then cut down, the same day.** Nick: "the cards are far too big and
      I only need to see my cards. 'Owned by ...' is private I think in the
      classic game. My cards are not showing."

      All three were right. The cards were 5.6 by 8 rem; they are now about
      62 by 50 pixels, with the territory and a small "+2" badge when
      trading pays, and nothing about who else holds what. The panel
      chrome became one slim strip.

      "Not showing" had a real cause. The hand was drawn only while a
      PERSON was taking a turn, so against computer players it vanished for
      most of the game and the map jumped each turn. It now stays up for
      the whole game: this iPad's own player across iPads, the only person
      when one person plays, and each person on their own turn when several
      share one iPad, so nobody sees another's hand. The strip keeps a
      card's height when empty, so the map never moves. Driven live: played
      a turn, took the Whitsundays, earned an infantry card for Queensland,
      and watched it stay on screen, marked "+2", through the computer's
      turn. Spec S33.

      **Spec 14 was wrong in three rows.** It listed as missing the card
      bonus, placing first armies by hand, and taking a beaten player's
      cards. The last two had been built long ago. A list of what we chose
      NOT to build is worthless once it lists things we did build, so all
      three came off it, with a note saying where each now lives.
- [x] 4.58 **Nick's four-player games, measured under his own rules, and a
      way to send a game.** Nick: "Turtle seems to win practically every 4
      computer player [game] even when going last. If I setup a new game as
      Planner/Optimus/General/Turtle to play in that order the winning order
      is usually the reverse sequence. General outlasts Optimus more than I
      would expect... I'm expecting Optimus... at least a 25% win rate."
      His rules: fixed set values, trading after a knockout, one-step
      fortify moves as many as you like.

      **Every measurement before this used the default rules**, and so did
      the tuning of Optimus. So his rules were measured directly, 1200 games
      a line, in his seating:

      | | Planner | Optimus | General | Turtle |
      |---|---|---|---|---|
      | World, his order | 5.6% | **42.8%** | 16.8% | 34.8% |
      | World, seats rotated | 6.4% | **38.8%** | 18.3% | 36.5% |
      | Australia in detail, his order | 5.8% | **40.2%** | 19.6% | 34.5% |
      | World, first armies by hand | 10.9% | **43.3%** | 12.5% | 33.3% |

      Optimus is the strongest in every one, well above the 25% he asked
      for, and Turtle a clear second. His finishing order is real but not
      usual: Turtle, General, Optimus, Planner is the SECOND most common
      order, 178 games in 1200, behind Optimus, Turtle, General, Planner at
      255. General outlasts Optimus in 38% of games, because Optimus plays
      for the win and when it misses it tends to go out third. So the
      simulation cannot reproduce "Turtle nearly always", and the next step
      is one of his actual games. The live site runs build `73b5a94`, which
      has the retuned Optimus; the new game screen shows which build a
      device is running.

      **Games were not logged**, so now they can be. A "Save game" button
      writes the game so far to a file, through the iPad share sheet or as
      a download, and `npm run read-game -- <file>` replays it and tells its
      story round by round. Spec S35. A saved game played under his rules
      goes through text and back and lands on the identical board, tested.
      Driven live: the button produced a valid file stamped with the
      running build.
- [x] 4.59 **Fortify with "one step only, as many as you like": no army
      crosses two borders.** Nick: "it doesn't mean a player can walk an army
      from one territory to one multiple borders away... in the same time
      frame multiple armies can all move at once crossing different
      borders."

      Tested first rather than assumed: the game already refused it. Four
      armies moved from Western Australia into the Northern Territory, and
      the Northern Territory was refused any move onward. The rule since
      plan 4.24 is that once armies arrive in a territory, NOTHING more
      leaves it that turn.

      That is stricter than Nick's own description, which let a territory
      still send what it began with, less one. That version was built and
      tested, then put back when Nick said: "If this is true... then that's
      a simpler rule to adopt." So the rule stands, with two changes around
      it:

      - How to Play said only "Armies that arrived this turn stay where they
        are", which is true but reads as if the territory's own armies
        could still move. It now says nothing more can leave, and to move
        armies out of a territory before moving others in.
      - Two tests lock it in: an army cannot be walked two borders, and a
        territory CAN send its own armies if it sends them first. The refusal
        now names the territory. Spec S36.
- [x] 4.60 **Two players with the same name are numbered.** Nick: "when
      there are multiple computer players with the same personality their
      names are all the same, they need to be numbered to distinguish each
      one." Two Generals both read "General" everywhere: the scores, the
      history, the replay and a saved game.

      `numberedNames` gives a shared name a number in turn order and leaves
      a name nobody shares alone, so one General is still "General". It
      never hands out a number somebody already holds: General, General,
      "General 1" becomes "General 2", "General 3", "General 1". Eight tests,
      one of which checks that no two players ever come out with the same
      name whatever list is handed in.

      Done in `createGame`, not on the new game screen, so it covers every
      way a game starts: one iPad, several iPads, the tournament tools and
      saved games. Driven live: the scores panel reads "General 1" and
      "General 2". Spec S37.

      **The new game screen shows the numbers too**, asked for straight
      after. The box being TYPED IN keeps the raw text until the player
      leaves it, and the others renumber around it. Without that, typing a
      name another seat already had would rewrite the box under the
      player's fingers the moment it matched. Driven live: typing "General"
      into seat 1 left that box alone and turned the others into "General 2"
      and "General 3"; leaving the box made all three 1, 2 and 3.

      A tooling trap worth recording. Three edits to the same file landed
      within one second, and the dev server went on serving a HALF-EDITED
      version: it had the new `typingIn` state and not the new `shownName`.
      The screen looked unchanged after a full reload, and the fault was
      only found by fetching the module the page was really running and
      looking for the new name in it. Touching the file fixed it. Checking
      the served source, not the file on disk, is what settles "did my
      change actually reach the page".
- [x] 5.12 **`touchingLength` was not symmetric, and both Australia maps
      were drawn wrong because of it.** Reported by another session, which
      found it in copied code. Verified at source here before anything was
      changed, and it is worse than reported.

      `sharedLength` measured how far the other edge's ENDS were from THIS
      edge, using a distance that clamps to the ends. So the other edge had
      to STOP inside this one. Two coasts that merely overlap never do.

      The report suggested measuring both ways round and taking the larger.
      That fixes one case and not the other, which a test showed: a short
      coast lying along a long one then works, but two edges that each run
      past the other, 0 to 100 against 50 to 150, still answer nothing.
      **The real fix is to measure to the LINE the edge runs along rather
      than to the edge**, then clip the overlap. That is symmetric by
      construction and covers every case.

      **What it was doing to the maps**, counted before and after:

      | Map | Before | After |
      |---|---|---|
      | World | 58 land, 25 sea | unchanged |
      | Australia in detail | 32 land, 33 sea | 48 land, 17 sea |
      | Australia | 3 land, 10 sea | 9 land, 4 sea |

      Ten of the small Australia map's thirteen borders were drawn as dashed
      SEA CROSSINGS, between places that plainly share a coast. Only one
      dashed line belongs there, Victoria to Tasmania across Bass Strait,
      plus the stubs out to the two islands. The picture had been lying for
      as long as the map has existed and nobody noticed, because a dashed
      line looks deliberate.

      **The world map is untouched, and the reason matters.** Its shapes
      come from Nick's drawing through `read-map-drawing.mjs`, which gives
      neighbours the identical run of points, so each edge does end inside
      its neighbour. The Australia maps are built from a shared table of
      whole numbers, where one long edge meets several short ones. That is
      exactly the case the fault hid.

      **Seven disagreements it uncovered, NOT settled here.** On the
      detailed Australia map seven pairs share a coast without naming each
      other: `arnhem`/`gulfCountry`, `barkly`/`gascoyne`,
      `darlingDowns`/`outbackSa`, `farWest`/`outbackSa`,
      `gascoyne`/`outbackSa`, `goldfields`/`outbackSa` and
      `pilbara`/`topEnd`. This is the disagreement Nick settled once before,
      for Eyre Peninsula and The Riverland, by adding the border. Seven more
      changes how that map plays, and `pilbara`/`topEnd` share only 2 units
      where the map allows a stray of 2.5 (spec 3.2 rule 9), so that one may
      be a slip of the pen rather than a coast. Nick's call.

      **Nick chose to add all seven**, including `pilbara`/`topEnd`. Same
      answer as last time and for the same reason: the picture must not tell
      a player something the rules will not allow. Each was checked against
      the corner table before it was added, and all seven are real shared
      edges. For instance `outbackSa` and `darlingDowns` both carry an edge
      at x=601, overlapping from y=390 to y=443, which is the 53 units
      reported.

      The detailed map now agrees with itself, so `edits.test.ts` asks all
      three maps for nothing left to add, which is the guard against drifting
      apart again. Driven live: no dashed line anywhere on the mainland, only
      the two islands, Tasmania and the city links.

      **Measured before and after, and it changed nothing.** 1200 games a
      line, and the after figures on two seed families:

      | | Before | After | After, second family |
      |---|---|---|---|
      | Planner against Cautious | 62.2% | 63.9% | 62.8% |
      | Optimus, four-player table | 47.2% | 49.2% | 50.7% |
      | Turtle | 29.0% | 27.3% | 27.9% |
      | General | 17.9% | 20.2% | 17.8% |
      | Planner | 5.9% | 3.4% | 3.5% |

      Every difference is about one standard error, which at 1200 games is
      roughly 2 points. So the claim in `australia-big.ts` stands: a plan is
      worth about six games in ten on a board this size.

      That is worth saying plainly, because seven new attack routes into and
      out of The Far North sounded like it ought to matter. It did not. The
      map is large enough that one region being easier to enter does not
      move who wins, and the honest reading is that the fix was a fix to the
      PICTURE, not to the game.
- [x] 5.13 **The map reader could not cope with an apostrophe.** Also
      reported, also verified here, and it is two faults rather than one.

      `read-map-drawing.mjs` writes a map out as TypeScript with
      `name: '${place.name}'` and no escaping, so "Cote d'Ivoire" would have
      written a file that does not compile. It reads the old map back with
      `name: '([^']+)'`, which stops dead at the backslash of an escaped
      quote: the whole block then fails to match and the place is dropped
      without a word.

      Both halves fixed, with `quoted` and `unquoted` and a pattern that
      understands escapes. `main()` now runs only when the file is the one
      being RUN, so a test can import the tool without it setting off and
      rewriting a map.

      `src/maps/names.test.ts` round-trips awkward names, checks the written
      form is something both a pattern and JavaScript itself agree with, and
      shows the old pattern failing where the new one does not. It also
      reads the REAL world map back and checks all 42 places come through
      with their names, short names, regions and borders, because rewriting
      those patterns is the kind of change that quietly breaks what worked.

      Latent in Conquest: no place on any map of ours has an apostrophe.

---

## Phase 5 - maps of your own

**Goal: Conquest plays a map nobody wrote code for.**

**Task 4.13 turned this phase from a nice-to-have into the thing the game
needs.** The computer players are as good as a ten-territory board lets them
be. A bigger Australia is what makes strategy mean anything.

- [x] 5.0 **A bigger Australia.** Built 2026-09-07. 38 places in 7 regions,
      the states and territories, with Perth, Darwin, Adelaide, Sydney,
      Canberra and Melbourne playable in their own right.

      **Tasmania is the prize.** It has ONE way in, from Melbourne. Every
      mainland region has four or more. That makes it the same kind of base
      Australia is on a real Risk board: not rich, but cheap to hold, and a
      test fails if that ever stops being true.

      Built from a shared table of corners rather than free-hand paths, so
      neighbouring places share exact points. A check over 45,696 sample
      points found no two shapes overlapping anywhere, which is the bug that
      got through on the small map and sat there for days.

      The small map stays, and is chosen on the new game screen.
- [x] 5.2 **Tap an area to zoom into it.** Nick's idea, built 2026-09-07.
      Tapping the whole board opens a close view of that place and everywhere
      it borders. Names are written out in full there, and a "Whole map"
      button steps back out.

      Three things had to be worked out, and each was found by looking at it:

      1. **Frame the PLACE, not the region.** Framing regions was the first
         try. Western Australia covers a third of the board, so it zoomed by
         1.1 while containing Perth and Rottnest, the two smallest targets on
         the map. A small place needs a small frame.
      2. **Cap the zoom.** Unlimited, tapping Perth filled the screen with
         three places. That is not a close view of the board, it is a
         different board, and you stop knowing where you are. Capped at 3.2.
      3. **Hold the labels steady.** Labels are drawn in map units, so they
         grew with the land and came out enormous. Dividing by the zoom keeps
         a count the same size on the glass at any distance.

      The view also follows what you pick up: choosing somewhere to attack
      from re-frames on it, because its targets are exactly what needs to be
      on screen. And a computer player's turn is always watched from above,
      since it moves anywhere on the board.
- [x] 5.3 **Say when a new version is ready.** Built 2026-09-07, after Nick
      asked how to get the latest version onto the iPad. There was no way to
      tell: the service worker WAITS by choice, so an update arrived silently
      and you had to guess whether you had it.

      A bar now appears when one is waiting, and says what it will cost. Mid
      game it warns that loading it ends the game, because a game is not
      saved anywhere. With nothing running it says it costs nothing.

      **The first update after this ships still needs the manual close and
      reopen**, because the version currently on the iPad has no bar in it.
      From then on it will say so itself.
- [x] 5.4 **Make a computer's turn possible to follow.** Nick: "the whole
      sequence of deploy, attack, fortify is done in a flash and it is
      difficult to know what happened."

      Speed was only half of it. The other half was mine: the map was
      DELIBERATELY blanked during a computer turn, so there was nothing to
      watch however slowly it went.

      Now the two places in its move light up exactly as they would for a
      person, the attacker outlined and the target dashed, and the panel
      says what it did in plain words: "Cautious attacks The Murray from The
      Riverina. Attacker rolls 3, 3, 1, defender rolls 4."

      An attack waits 1.5 seconds and everything else 0.7, because an attack
      is the only move with a result worth reading. The rest just change a
      number.
- [x] 5.5 **A map file format, and reading it.** Built 2026-09-07. JSON,
      because a browser reads it without help, a person can read one, and
      nothing in it can run. See spec 3.3.

      **Places are written as CORNERS, not as drawn paths.** That is the
      decision that matters. Neighbours then share the exact same points, so
      a border cannot come out with a sliver of no-man's land or a sliver of
      overlap along it.

      **The proof is a round trip, not a map written for a test.** Both maps
      we ship are written out to a file, read back, and compared whole. That
      is two maps of 38 and 10 places, every shape exact, and it is a far
      harder test than anything written by hand for the purpose.

      It found one real thing on the first run: the detailed map carried
      `isIsland: false` and `drawnOver: undefined` on places where neither
      applies. A file leaves both out, so the two did not match. The map now
      says only what is true.
- [x] 5.6 **Faults reported in plain words.** Built 2026-09-07 as part of
      5.5. Every fault at once, not one per attempt, because the person
      reading the complaint is the person who wrote the map.

      Two passes: that the file makes sense at all, then the ten rules of
      spec 3.2. Both lists come back together. The one exception is a file
      with a hole in it, where a place was thrown away, because checking the
      rules against a map with a missing place invents faults that are not
      in the file.

      Seen live with a file holding three real mistakes, and all three came
      back: a colour written as "green", a border named on one side only,
      and two places covering the same ground.
- [x] 5.7 **Load a map from a file the player picks.** Built 2026-09-07. The
      new game screen takes a file, remembers it, and offers it in the map
      list beside the two built in.

      **It also saves the map you are looking at.** There is no blank page.
      A map of your own starts as the map we ship with one thing changed,
      which is the only way the format is ever going to be discovered.

      Driven live end to end: saved the detailed map (23 kB, 1632 lines),
      renamed it, raised Tasmania's bonus to 9, renamed Hobart, loaded it
      back, and played it. The board said "James's Australia" and the place
      said "Hobart Town".
- [x] 5.8 **The world.** Nick's request, built 2026-09-08. Forty-two places
      in six continents: North America 9, South America 4, Europe 7, Africa
      6, Asia 12, Australia 4. The bonuses are 5, 2, 5, 3, 7 and 2.

      This is the second map, and it was the point of the whole phase: it
      proves the first one was not a special case. It also proves the
      guards, because it passed all ten rules on the first run.

      **It is the layout everybody who has played the classic war game
      already knows**, so nobody has to learn a new world before they can
      play. The names are the names of real places. The drawing is our own,
      not a copy of anybody's artwork, and the game is Conquest.

      **Australia has ONE way in, from Siam to Indonesia**, and pays the
      least of any continent. Asia pays 7 and has five ways in. That is the
      same lesson Tasmania teaches on the detailed Australia map, and a test
      holds both facts.

      Drawn the same way as the detailed Australia: borders inside a
      continent are straight lines whose corners the two places share
      exactly, and only the coasts wander. That is how the real board looks,
      and it is the only way to be sure of no overlaps.

      Two things needed fixing after looking at it. The map was called "The
      World", and the screen reads out "The <name> board", so it announced
      "The The World board". And the Mediterranean was ten units wide, which
      read as one landmass rather than two continents. Africa moved 30
      further down, and the Middle East reaches down to meet Egypt across
      Suez.

      It is now the map the game opens on.

      **REDRAWN TWICE on 2026-09-08.** Nick on the first: "far too blocky
      with not enough detail." Hand-drawn rectangles were never going to be
      anything else.

      The second was traced from somebody else's drawing of the board, which
      looked right but came with a licence asking for credit and asking that
      the result be shared on the same terms. Nick: "I don't want to have
      license obligations... I provided the examples to you for inspiration
      not direct copying." Fair, and a good map of the world is public
      property anyway. That version is gone.

      **The third is ours.** The coastlines come from Natural Earth, whose
      own words are "No permission is needed to use Natural Earth.
      Crediting the authors is unnecessary." The data sits in `tools/data`
      so a build needs no internet.

      **The coasts are real and the inland borders are ours.** Each place is
      the land inside a straight-sided CELL we drew, cut out with
      Sutherland-Hodgman clipping. So a coast wanders and a border between
      two places runs in a line, which is how the world looks and how the
      board looks. The cells are in `tools/world-cells.json` and they are
      the whole of what a person designs.

      Two cells sharing an edge give two places sharing it exactly. That is
      what the traced version could never manage: it left eleven hairline
      overlaps and forced rule 9 to be loosened. This one passes every rule
      first time, with nothing loosened for its sake.

      The first run had eight overlaps, every one a pair of cells I had
      drawn over each other. The guard named all eight and each was a line
      to move. That is the difference between a fault in the DESIGN, which
      is easy to fix, and a fault in traced artwork, which is not.

      **REDRAWN A FOURTH TIME.** Nick: "the inner borders have too many
      straight lines, I'd like the maps to be more impressive and
      realistic." Cells of our own fixed the coast and left every inland
      border dead straight, which is the one thing they could never fix.

      Each place is now a group of real COUNTRIES, joined together, so the
      line between Peru and Brazil in the game is the line between Peru and
      Brazil in the world. Where a place is only part of one country, such
      as either half of the United States, it is a group of that country's
      real provinces. Which side of a split each province falls on is a
      RULE, not a list: Russia has eighty-five of them and nobody should
      type those out.

      **The join works because the data shares its edges.** Where two
      countries meet, both hold the same line, one running each way. Throw
      away every edge whose reverse is also in the group, because that is a
      border inside it, and stitch what is left. Half the edges in the file
      have their reverse present, which is exactly the half that is a land
      border.

      Joined straight from the data the map came to 18,511 corners, which
      is more than the game can redraw and far more than an eye can see.
      Simplified to 2,065, with each shared border simplified ONCE so the
      two sides stay together.

      42 places, 2,065 corners, and it passes all ten rules first time with
      nothing loosened for it. `node tools/make-world-map.mjs` builds it.

      **Known and left:** a place made of several islands keeps only its
      biggest. Indonesia is one island rather than many, Japan is Honshu,
      Great Britain has no Ireland. Fixing it means letting one place be
      several shapes, which the map format and three of the guards would
      all have to learn.

      **THE GENERATOR IS GONE, 2026-09-08.** It was six goes at drawing
      the world by program, and Nick liked none of them: "far too blocky",
      "looks a bit odd", "very distorted and child like", "still
      problematic", "still looks all wrong to me", "in general this is
      worse than before". Then the question that ended it: "you seem
      determined to map this to the real world when it is not necessary...
      How will custom non-real world maps work if that is what is going
      on?"

      There was no good answer. A custom map could never have worked that
      way, because the whole machine ran on real country data. So the
      world map is now a plain file like the Australia ones (spec S51),
      changed in the editor, and `tools/make-world-map.mjs`,
      `tools/fit-world-sheet.mjs`, `tools/world-groups.json` and the
      Natural Earth data are all deleted. Nothing in the game or its tools
      reads real-world data any more.

      The map kept is the one from before the last change, because Nick
      said that one was better. Its coasts are his own drawing, which
      stays in `tools/data` for the record.

      **What the editor gained instead: cutting a place in two** (spec
      S52, plan 5.9). Drawing a line across a place splits it, and both
      halves are given the identical points along the cut, so the border
      is exact. That is the one thing a person could not do by dragging
      corners, and it is how a continent becomes territories. Driven live:
      cutting North Africa in two left a 43-place map with no faults.

- [x] 5.11 **A whole map, drawn and read in.** Built 2026-09-08. Nick,
      after the generator was deleted: "Is the problem the inner borders?
      I can put them back into an outline." It was. He draws the coasts
      and the borders together, and `node tools/read-map-drawing.mjs`
      reads the drawing into a map (spec S53).

      This is the same machinery as the deleted generator with the whole
      middle taken out. Reading an SVG, filling the land, walking each
      piece's outline and simplifying shared borders once all stay. The
      country data, the projection, the sheet, the pins and the fitting
      are gone, and with them every fault they caused.

      A border line has one rule: it cuts only if it goes right across,
      sea to sea, or you can walk round the end of it. When a line falls
      short the tool NAMES the places still joined, which is the only
      guidance needed to finish. Names, continents and bonuses carry over
      from the map being replaced, by whichever old label sits inside each
      new piece.

      **Then Nick drew the board himself**, coasts and borders in one PNG:
      "Try this map." The tool reads pictures now. 52 white areas: 42
      places, six islands that belong to one of them (Ireland, Tierra del
      Fuego, Hokkaido, Sumatra, Java, Sulawesi), and the enclosed seas.
      A names file says which is which, by a point inside each. Every
      land border in the picture was already a border of the board.

      The first read had 6,447 corners and the map rules took over five
      seconds, which failed the test on time rather than on any rule.
      Thinning at 3 cells gives 3,616, fewer than the map it replaced,
      checked in under two seconds. All 456 tests green.

- [x] 5.9 **A map editor.** Built 2026-09-07, in `src/editor/`, as a second
      page at `/editor.html`. It ships WITH the game, so it works offline,
      needs nothing installed, and is one link away. See spec 3.4.

      What it does: start from either map we ship or from a file, drag
      corners, add and remove corners, move where the army count sits, add
      and delete places, edit regions, tick borders both ways at once, work
      land borders out from the shapes, undo, save to a file, and send a map
      straight to the game.

      **A corner dropped near another snaps onto it exactly.** That is the
      most useful thing in it. Two places that share a border must share the
      same corners, nobody can click the same point twice by hand, so the
      editor does it for them.

      **It never starts from a blank page**, and opening a file does NOT
      check the rules, because a map with an overlap in it is exactly the
      map somebody wants to open in an editor.

      **It found a real fault in the map we ship.** Eyre Peninsula and The
      Riverland share 28 units of edge at x=543, and neither named the other
      as a border, so the picture said you could walk across South Australia
      there and the rules said you could not.

      **Nick chose to add the border, 2026-09-08.** Both places are inside
      South Australia, so this does not change how many ways into the region
      there are. It makes moving within it easier, and it makes the picture
      and the rules agree. A test now watches the two stay in step.

      Driven live: selected a place and got its seven corners, dragged one
      into the neighbour and watched the overlap fault appear naming the
      exact point, undid it, worked out borders and got the Eyre finding,
      added a place and got the honest "nothing can reach it" fault, then
      sent the map to the game and confirmed the game's own reader accepts
      what the editor wrote.

Numbered from 5.5 on purpose. Tasks 5.0 to 5.4 were done first and took
those numbers, and `australia-big.ts` names task 5.0 in its own comments.
Renumbering the finished work would have made that comment a lie.

---

## Phase 6 - separate devices

**Goal: several people play one game from separate iPads and computers.**

This is the only phase needing a server. See D15.

- [x] 6.1 A Cloudflare Worker with a Durable Object holding one game.
      **Built 2026-09-08.** One Durable Object per game, named by the game
      code, which is the whole reason for using one: Cloudflare guarantees
      there is only ONE of them anywhere, so two iPads can never both be the
      one deciding what happened.

      **It costs nothing.** Durable Objects with SQLite storage are on the
      Cloudflare free plan: 100,000 requests and 13,000 GB-seconds a day.
      A family game uses a tiny fraction. The wrangler settings say
      `new_sqlite_classes` for exactly this reason, because the older
      key-value kind does need a paid plan.

      **The engine runs on the server unchanged.** Not one line. That is
      what spec S2 bought two weeks ago: an engine that touches no browser,
      no clock and no hidden randomness runs in a place that has none of
      those things.

      One engine change was needed, and only one. The dice now carry how far
      through they are, so a server shut down between two moves picks up the
      same numbers. See `SavedRandom` and spec S42.
- [x] 6.2 Create a game, and a code other people use to join it. **Built
      2026-09-08.** Four letters, read out across the room. No accounts, no
      signing in, nothing to install, because every one of those is a place
      a twelve year old and his friends give up.

      The letters O, I and Z are left out. Somebody reads this code ALOUD,
      and those three are heard as zero, one and two.
- [x] 6.3 Send actions to the server and receive the new state. **Built
      2026-09-08.** A socket each way. The map is sent once and left out of
      every message after it, and the log is cut to its last 80 lines with
      the true count beside it. See spec S43.
- [x] 6.4 Show what other players are doing while you wait. **Built
      2026-09-08.** The server says what the last MOVE was, not only the new
      state, so the other iPads can draw it. Watching somebody else's turn
      looks exactly like watching a computer's: the two places light up, the
      panel says what happened, and the smoke or the parachutes or the
      convoy plays.

      Seen live: Nick placed an army on Rottnest Island on one machine, and
      the other drew the landing craft arriving, having worked that out for
      itself from the action. See spec S44.
- [x] 6.5 Cope with a player closing the lid and coming back. **Built
      2026-09-08.** A person is known by a key they keep, not by the
      connection they are on, so coming back finds the SAME seat. The seat
      is held for them and only the light saying they are here goes out.

      This had a real bug. The Worker built a fresh address to hand the
      socket to the room and forgot to carry the key, so coming back was
      told the game was full. Caught by `tools/try-server.mjs`.
- [x] 6.6 Computer players in a game played across devices. **Built
      2026-09-08.** The SERVER plays them, one step at a time on an alarm,
      and sends each move out. Every iPad running its own copy would mean
      four of them all deciding the same move at once.

      Seen live: after both people finished their turns, the computer added
      four lines to the log with nobody asking it to.

### What was measured, and what had to change

**All of the thinking is in `src/server/room.ts`, which knows nothing about
Cloudflare.** No sockets, no storage, no network anywhere in it. So the 24
tests covering who may do what run in under half a second with no server,
and the Durable Object around them has almost nothing left to be wrong.

The two tests that matter most:

- A move sent by the wrong person is refused. `applyAction` acts on
  whoever's turn it is, so without that check a move from the wrong iPad
  would be carried out in the RIGHT person's name.
- Twenty-five moves played twice, once straight through and once with the
  room written out and read back before every single move, end with the
  same state and the same roll count. That is the proof that a server
  restart mid-game changes nothing.

**Two bugs only driving it could find**, both in `tools/try-server.mjs`:

1. The key was dropped when the Worker handed the socket to the room, so
   coming back after closing the lid was told the game was full.
2. "Play together" read the setup from the LAST game rather than what was
   picked on the screen, so a shared game always opened with three people
   and the wrong map.

**And one that cost an hour.** Vite replaces `import.meta.env.NAME` written
with a DOT and quietly leaves `import.meta.env['NAME']` alone. The built
site simply did not offer playing together, with nothing anywhere to say
why. The setting is now declared by name in `vite-env.d.ts` so the dot form
type-checks.

**Not deployed.** The server runs locally and everything above was driven
against it. Putting it on Cloudflare is a change to Nick's live account,
which also runs the datacrafter.net DNS and the demo and test instances, so
that waits for him to say go. Until an address is set at build time, the
game does not offer playing together at all, which is better than offering
it and failing.

---

## Phase 7 - things you can see and hear

Nick's request, after watching a computer take a turn: "could we have some
animations and sounds? Explosions and smoke on the border when attacking,
landing craft arriving at an island, parachutists inland, a convoy when
fortifying."

This phase does not depend on phase 5 or phase 6. It can be built at any
time, and it improves the game people already play. See spec 11.5.

- [x] 7.1 Mark each island in both map files, and let the map type carry it
- [x] 7.2 `effects.ts`: turn one action into a list of effects, tested with no browser
- [x] 7.3 Draw a battle: smoke and a flash on the border between the two places
- [x] 7.4 Draw an arrival: parachutists inland, landing craft from the open sea
- [x] 7.5 Draw a convoy travelling from where armies leave to where they land
- [x] 7.6 Keep effects the same size on screen however far the map is zoomed
- [x] 7.7 Obey "reduce motion", the system setting for people animation upsets
- [x] 7.8 Build the sounds in code, one per effect, no audio files
- [x] 7.9 A sound switch in the header, off until a player turns it on
- [ ] 7.10 Nick: play a real game on the iPad and check nothing is slower
- [x] 7.11 Make the sound work on the iPad, not only in a browser
- [x] 7.12 Make a sound measurable, and turn the hammer into an explosion
- [x] 7.13 Keep a lorry and a boat the right way up, whichever way they go

### What was measured, and what had to change

**Islands cannot be worked out from the shapes.** That was the first thing
tried, because the map is built from a shared corner table and two places
that share a land border share an edge. Measuring how far each pair of
borders touch separates them cleanly: 48 of the 64 borders touch along a
real edge, and 16 touch along nothing.

The 16 are not the sea crossings. They are the sea crossings AND every
coastal city, because a city is drawn on top of the coast and so meets the
land around it at one corner only. Perth came out an island. Testing whether
one shape sits inside another does not separate them either. Only Canberra
is fully inside its place.

So each island is written down in the map file instead. There are five on
the detailed map and three on the small one. See spec S26.

**The drawings were far too small at first.** Each was drawn at its own
size, about 13 across on the glass, and read as a speck. They are now scaled
against the army counts, which are 30 across, so a parachute is about 48.

**The first explosion washed out.** One pale yellow circle over tan land is
not a bang. It is now an orange ball with a white-hot middle, over darker
and more solid smoke.

**Lorries were driving across Bass Strait.** Armies fortifying to Tasmania
got a convoy, because the rule only looked at deploying. A move now counts
as a sea crossing when exactly ONE end is an island, and those armies go by
boat. Launceston to Hobart stays a convoy, because both are on the same
island.

**Sound worked in a browser and did nothing on the iPad.** Nick found this
by playing it. Safari on iPadOS does not accept `resume()` on its own as
permission to make a noise. It wants a sound actually STARTED while the
finger is still down. The switch now starts one frame of silence inside the
tap, which counts, and everything after it is allowed.

Two more things came out of that. The sound engine is now woken again on
any later tap, because an iPad puts it to sleep when the app goes to the
back, and waking it only counts from inside a tap. And the switch now plays
two notes and says so, because three different things can leave a player in
silence and only the game can tell them apart. See spec S25a and S25b.

**The explosion was a hammer.** Nick's words, and he was right. An ear
hears a strike when a sound starts in an instant, is bright, stops quickly
and has a tuned thump under it. The first attempt had all four.

None of that can be fixed by listening, because I cannot listen. So a sound
is now built into ANY audio context rather than played at a speaker, which
means one can be rendered offline and measured. See spec S28.

| Measured | Before | After |
|---|---|---|
| Time to reach full loudness | 31 ms | 72-137 ms |
| Time to fall to a tenth | 143 ms | 596-696 ms |
| Share of energy below 250 Hz | 0.50 | 0.77 |

What changed to get there: the crack was cut back to a quiet edge that the
body swallows, the roar now opens at 1100 Hz rather than 3400, the thump
slid down to 74 Hz which is below a hammer, the fade was made to run longer
than the sound so the tail rolls instead of stopping dead, and the whole
thing is sent through an echo worked out in code. Everything now passes
through a squeezer, so two explosions close together add up without
crackling.

**The convoy drove upside down.** Nick again: "the convoy trucks are often
moving upside down." A lorry is drawn from the side and was turned to face
its direction of travel, so heading west was half a turn, and half a turn
puts the wheels in the air.

`facingAlong` replaces it. It mirrors the drawing to face the other way and
leans it at most 30 degrees, which is what a map application does. The boats
had the same fault more quietly: they never faced their course at all, so
one sailing east looked the same as one sailing west. They use the same rule
now. See spec S29.

The test walks all 360 degrees rather than the four directions that came to
mind, because this is exactly the kind of bug that hides in the angles
nobody thought to try.

Measured after: 325 tests green. The board holds 236 shapes at rest and 252
at the peak of an effect, so an animation adds at most 16 and nothing builds
up. Battle, parachute, landing and convoy were each driven live and looked
at frame by frame.

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
| 2 - the screen | **COMPLETE** 2026-09-07, both guards included. |
| 3 - the Home Screen app | **Live at conquest.datacrafter.net.** Only 3.6 left. |
| 4 - computer players | **COMPLETE** 2026-09-07. 4.1 to 4.13 all done. |
| 5 - maps of your own | **COMPLETE** 2026-09-08. Three maps, a file format and an editor. |
| 6 - separate devices | **Built and driven** 2026-09-08. Not deployed: Nick's call. |
| 7 - things you can see and hear | **Built** 2026-09-07, bar 7.10 on the iPad, which is Nick's. |
