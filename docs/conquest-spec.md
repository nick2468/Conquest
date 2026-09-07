# Conquest - specification

Version 1. Written 2026-09-06.

This document says what the program does and how it is built. The
[design brief](../DESIGN-BRIEF.md) says what we are making and why. Read the
brief first.

Where the two disagree, this document wins on detail and the brief wins on
direction.

Decisions carry a number, D1 to D20 in the brief and S1 upward here. A numbered
decision has a reason attached. Do not change one without reading the reason.

---

## 1. Words

One name for one thing. This list is the whole vocabulary. Code uses these exact
words.

| Word | Meaning |
|---|---|
| **Territory** | One area on the map. A player can own it. Australia has 10 in phase 1. |
| **Region** | A group of territories. Owning all of a region earns a bonus. The board game Risk calls this a continent. |
| **Border** | A link between two territories. A player may attack across a border. Some borders cross water. |
| **Army** | One playing piece. A territory holds one or more armies. |
| **Player** | A human or a computer taking part in the game. |
| **Turn** | One player's full go, from reinforcing to ending. |
| **Round** | One turn for each player still in the game. |
| **Phase** | A stage inside a turn. Reinforce, attack, occupy, or fortify. |
| **Card** | A card a player earns by conquering. Three cards make a set. |
| **Set** | Three cards a player may trade for armies. |
| **Reinforce** | Place new armies at the start of a turn. |
| **Attack** | Roll dice against a bordering territory owned by someone else. |
| **Occupy** | Move armies into a territory just captured. |
| **Fortify** | Move armies once between two owned territories, at the end of a turn. |
| **Eliminate** | Remove a player who owns no territories. |

Words we do not use, to avoid two names for one thing: continent, country,
province, state, unit, troop, piece, deploy, reinforcement (as a noun for the
armies themselves), move (unqualified).

**S1. The word "state" is reserved for program state, never for an Australian
state.** New South Wales is a territory. `GameState` is program state. This
avoids a confusion that would otherwise appear on every page.

---

## 2. Shape of the program

Three layers. Each one may only use the layer above it.

```
  src/engine/    The rules. Pure TypeScript. Knows no browser.
       |
  src/maps/      Map data. Territories, borders, shapes. Data, not code.
       |
  src/ui/        The screen. React. Draws the map, reads taps and clicks.
```

**S2. `src/engine/` and `src/maps/` must never import from `src/ui/`, and must
never touch `window`, `document`, `Math.random` or `Date`.** This is what makes
every rule testable in under a second. A test in
`src/engine/engine-purity.test.ts` enforces it by reading the files, and a
second block in the same test proves each of its checks really does catch the
thing it names. A rule nobody checks is a rule that breaks. See D4.

**S3. The engine never changes a value in place. Every function returns a new
value.** So a test can hold the state from before and the state from after and
compare them. It also makes undo possible later at no extra cost.

---

## 3. The map

### 3.1 What a map is

A map is data. No code changes when the map changes. This is what makes phase 4
possible. See D12.

```ts
interface GameMap {
  readonly id: string
  readonly name: string
  readonly viewBox: string                    // the SVG coordinate space
  readonly territories: readonly TerritoryDefinition[]
  readonly regions: readonly RegionDefinition[]
}

interface TerritoryDefinition {
  readonly id: TerritoryId                    // 'wa'
  readonly name: string                       // 'Western Australia'
  readonly shortName: string                  // 'WA', drawn when space is tight
  readonly regionId: RegionId                 // 'west'
  readonly borders: readonly TerritoryId[]    // territories you may attack
  readonly shape: string                      // an SVG path
  readonly labelAt: Point                     // where the army count is drawn
}

interface RegionDefinition {
  readonly id: RegionId
  readonly name: string
  readonly bonus: number                      // extra armies for owning it all
  readonly outline: string                    // colour of the territory outline
}
```

**S4. The `borders` list is the truth. The `shape` is only a picture.** Two
territories are neighbours because the data says so, never because their drawn
outlines touch. So a rough drawing cannot break the rules, and an island can
border the mainland with no bridge drawn.

### 3.2 Rules a map must obey

A map is valid only if all of these hold. `validateMap()` checks them and a test
runs it against every map we ship.

1. Every territory id appears once.
2. Every region id appears once.
3. Every territory names a region that exists.
4. Every border names a territory that exists.
5. No territory borders itself.
6. Borders are symmetric. If A borders B then B borders A.
7. Every region holds at least one territory.
8. The map is connected. From any territory you can reach every other territory
   by crossing borders.
9. No two places claim the same ground. They may share a border. They may not
   share any land.
10. No army count is drawn inside a place that is not its own.

Rule 6 catches the most common mistake by far, which is typing a border on one
side and forgetting the other. Rule 8 stops a map where part of the board can
never be reached, which would make the game unwinnable.

Rules 9 and 10 came late, in phase 7, and both were put off for a day on the
same wrong belief: that this needs a browser, because `isPointInFill` is a
browser thing. Whether a point is inside a shape is arithmetic. Rule 9 found
a real fault on the day it was written, in a map that had been played for
days.

**Rule 9 allows exactly one overlap, and the map must declare it.** A city is
drawn on top of the place around it, and that is deliberate. A city says so
with `drawnOver`, and the check then makes sure the claim is true: the two
must border each other, they must really touch, and the city must be the
smaller of the two.

**Rule 10 is not "the count sits on its own land".** Rottnest and the
Whitsundays are too small to hold a number, so theirs sit out at sea with a
line pointing at them, and Perth's sits beside it on The South West. A count
may sit on its own place, on the place its city is drawn over, or on nothing
at all. Anywhere else it looks like somebody else's number.

### 3.3 The map file

A map is a JSON file. See plan tasks 5.5 to 5.7.

**S31. A map file holds data, never code.** JSON, because a browser reads it
without help, a person can read and change one, and nothing in it can run.
A map written as TypeScript would have to be compiled, and loading one would
mean running code from a file somebody else wrote.

**S32. A place is written as a list of CORNERS, not as a drawn path.** This
is the decision that matters. Neighbouring places then share the exact same
points, so a border cannot come out with a sliver of no-man's land along it
or a sliver of overlap. The detailed Australia was built that way for that
reason, and it STILL had one overlap that took a guard to find, so the
format gives every map the same protection.

**S33. Every fault in a file is reported at once, in the words of the person
who wrote it.** A file is read in two passes. First that it makes sense at
all, then the ten rules of section 3.2. Both lists come back together,
because somebody writing a map wants to see everything that is wrong with
it, not one thing per attempt.

The one exception is a file with a hole in it. A place with no corners is
thrown away, and checking the RULES against a map with a missing place
invents faults that are not in the file: a border would point at something
that is not there, and the complaint would name the wrong mistake. Then the
game says the rules have not been checked yet.

A file from outside gets the suspicion any outside file gets. There are
limits on how big it may be, how many places and regions it may hold, and
how long a name may be. Colours must be written as `#b8763a`, so nothing
else can reach an SVG attribute.

The shape of a file:

```json
{
  "conquestMap": 1,
  "id": "australia",
  "name": "Australia",
  "viewBox": "136 100 690 648",
  "regions": [
    { "id": "tas", "name": "Tasmania", "bonus": 2, "outline": "#8a6f3a" }
  ],
  "places": [
    {
      "id": "hobart",
      "name": "Hobart",
      "shortName": "HOB",
      "region": "tas",
      "borders": ["westCoast", "launceston"],
      "corners": [[672, 673], [738, 669], [731, 700]],
      "labelAt": [716, 694],
      "isIsland": true
    }
  ]
}
```

`isIsland` and `drawnOver` are left out unless they are true. A place that
says `"isIsland": false` is not the same shape of thing as one that says
nothing, and the two would not match after a trip through a file.

**There is no blank page.** The new game screen saves the map you are
looking at, so a map of your own starts as the map we ship with one thing
changed. That is also the only place the format needs explaining, because
you are looking at it.

### 3.4 The map editor

A second page beside the game, at `/editor.html`. See plan task 5.9.

**S34. The editor ships WITH the game, not somewhere else.** It is a second
page in the same build, so it works with no internet, needs nothing
installed, and is one link away from the game it makes maps for. It is
cached by the same service worker.

**S35. A map never starts from a blank page.** It starts as one of the two
maps we ship, or as a file you already have. A blank page is where a project
like this dies, and there is nowhere to learn the shape of a file from.

**S36. A corner dropped near another one snaps onto it exactly.** This is
the most useful thing the editor does. Two places that share a border have
to share the exact same corners, or the border comes out with a sliver of
no-man's land or a sliver of overlap along it. Nobody can click the same
point twice by hand, so the editor does it for them.

**S37. The editor shows the same faults the game would, beside the drawing
rather than after it.** It runs `validateMap` on every change. A fault
appears the moment it is made, next to the thing that made it.

**S38. Opening a file in the editor does NOT check the rules of a map.** A
map with an overlap in it is exactly the map somebody wants to open in an
editor. Refusing it would send them back to a text editor to fix the very
thing the editor exists for. The faults are shown beside the drawing
instead.

**Borders can be worked out from the shapes, but only added, never taken
away.** Where two shapes run along one another, the border is there to be
read, and a border typed on one side and forgotten on the other is the
mistake people make most. A border with no shared edge is NOT a mistake:
Melbourne to Launceston crosses Bass Strait and no shape can tell you that.

### 3.5 The Australia map, phase 1

Ten territories in four regions. Agreed 2026-09-06.

Eight states and territories, plus Rottnest Island and the Whitsunday
Islands. Tasmania is both a state and an island, so it is counted once.

| Region | Territories | Bonus |
|---|---|---|
| The West | Western Australia, Rottnest Island, Northern Territory | 3 |
| The North East | Queensland, Whitsunday Islands | 2 |
| The South East | New South Wales, Australian Capital Territory, Victoria | 3 |
| The South | South Australia, Tasmania | 2 |

**S18. The shapes shipped in phase 1 are placeholders.** They are simple
polygons. They read as Australia only if you already know that is what they
are. Replacing them is a data change, because a shape is one string per
territory and nothing but the drawing layer reads it.

Better shapes are drawn by hand and refined by eye, in phase 2.1, when the map
is on screen and we can judge it. Drawing them blind in phase 1 means guessing
twice. Australia's coast has four or five features that carry the whole
recognition: Cape York, the Gulf of Carpentaria, the Great Australian Bight and
Shark Bay. Getting those right matters more than accuracy anywhere else.

If hand-drawing stalls, the fallback is real boundary data. Natural Earth is
public domain and the Australian Bureau of Statistics publishes official state
boundaries under CC BY 4.0. Both need a download, a conversion to SVG and a
heavy simplification pass, because survey data carries far more detail than a
game map can use. That is why it is the fallback and not the first choice.

**S5. The bonuses above are a first guess, not a considered balance.** In the
board game Risk a region bonus is roughly the number of territories needed to
hold its edge. We have not played a game yet, so these numbers are untested.
They live in the map file and change in one place. See section 12.

Borders:

| Territory | Borders |
|---|---|
| Western Australia | Northern Territory, South Australia, Rottnest Island |
| Rottnest Island | Western Australia |
| Northern Territory | Western Australia, South Australia, Queensland |
| South Australia | Western Australia, Northern Territory, Queensland, New South Wales, Victoria |
| Queensland | Northern Territory, South Australia, New South Wales, Whitsunday Islands |
| Whitsunday Islands | Queensland |
| New South Wales | Queensland, South Australia, Victoria, Australian Capital Territory |
| Australian Capital Territory | New South Wales |
| Victoria | South Australia, New South Wales, Tasmania |
| Tasmania | Victoria |

Two territories are worth noticing. The Australian Capital Territory has one
border, so it is safe but useless. South Australia has five, so it is the
hardest place on the board to hold and the most valuable.

---

## 4. Game state

One value holds the whole game. Nothing about the game lives anywhere else.

```ts
interface GameState {
  readonly options: GameOptions
  readonly map: GameMap
  readonly players: readonly Player[]
  readonly territories: Readonly<Record<TerritoryId, TerritoryState>>
  readonly turn: TurnState
  readonly round: number                  // the first round is 1
  readonly deck: DeckState
  readonly winnerId: PlayerId | null
  readonly log: readonly LogEntry[]
}

interface DeckState {
  readonly undrawn: readonly Card[]       // in the order they will be drawn
  readonly discarded: readonly Card[]     // return to the deck when it empties
  readonly setsTraded: number             // across the whole game, see 6.6
}

interface Card {
  readonly id: CardId
  readonly symbol: 'infantry' | 'cavalry' | 'artillery' | 'wild'
  readonly territoryId: TerritoryId | null   // null on a wild card
}

interface LogEntry {
  readonly round: number
  readonly playerId: PlayerId | null      // null for something the game did
  readonly text: string
}

interface Player {
  readonly id: PlayerId
  readonly name: string
  readonly colour: string
  readonly kind: 'human' | 'computer'
  readonly cards: readonly Card[]
  readonly isEliminated: boolean
}

interface TerritoryState {
  readonly ownerId: PlayerId | null
  readonly armies: number
}

interface TurnState {
  readonly playerId: PlayerId
  readonly phase: TurnPhase
  readonly armiesToPlace: number
  readonly hasConquered: boolean          // earns a card at end of turn
  readonly hasFortified: boolean          // one fortify move per turn
  readonly pendingOccupation: Occupation | null
  readonly lastAttack: AttackOutcome | null   // for the view to animate
}

type TurnPhase = 'reinforce' | 'attack' | 'occupy' | 'fortify' | 'gameOver'

interface Occupation {
  readonly fromId: TerritoryId
  readonly toId: TerritoryId
  readonly minimumArmies: number    // the number of dice the attacker rolled
  readonly maximumArmies: number    // armies in the attacking territory, less 1
}
```

**S6. `occupy` is a real phase, not a pop-up.** When a capture leaves the
player something to decide, the game stops in the `occupy` phase and waits.
Making that a phase keeps one rule true everywhere: the phase says what the
game is waiting for. When a capture leaves nothing to decide, see S19, the
game never enters the phase at all.

**S7. `log` records every event in plain words.** It drives the on-screen
history, it explains a computer player's move, and it is the fastest way to see
what went wrong in a test. Cheap to add now and awkward to add later.

---

## 5. The turn

A turn runs in order. A player cannot go back a phase.

```
reinforce  ->  attack  <->  occupy  ->  fortify  ->  next player
                  |                        ^
                  +------------------------+
```

1. **Reinforce.** The game works out how many armies the player gets. The player
   may trade a card set first. The player places every army before moving on.
2. **Attack.** The player may attack as often as they like, or not at all.
   Capturing a territory moves the game to occupy, and back to attack when the
   move-in is done.
3. **Occupy.** The player chooses how many armies move into the captured
   territory.
4. **Fortify.** The player may make one army move between two owned territories,
   or skip it.
5. The turn ends. If the player conquered anything this turn, they draw one
   card. Play passes to the next player who is not eliminated.

**S8. The player must place every reinforcing army before attacking.** Holding
armies back would be a second kind of reserve and a second set of rules. One
way to do a thing.

---

## 6. The rules

### 6.1 Reinforcements at the start of a turn

```
armies  =  max(3, floor(territories owned / 3))
        +  the bonus for each region the player owns completely
```

The minimum of three matters. Without it a player down to two territories can
never come back.

### 6.2 Attacking

The attacker picks a territory they own and a bordering territory owned by
someone else.

- The attacking territory must hold at least 2 armies. One army must always stay
  behind.
- The attacker rolls `min(3, attacking armies - 1)` dice.
- The defender rolls `min(2, defending armies)` dice.

### 6.3 Working out an attack

**This is the first piece of code we write. See D13.**

1. Sort each side's dice from high to low.
2. Compare the highest attacker die with the highest defender die.
3. If both sides rolled two or more dice, compare the second pair too.
4. For each pair, the lower die loses one army.
5. **If a pair is equal, the attacker loses the army.**

Step 5 surprises people. The defender wins a tie. It makes attacking expensive,
which is what stops the game ending in ten minutes.

```ts
function resolveAttack(
  attackerDice: readonly number[],
  defenderDice: readonly number[],
): AttackOutcome
```

**S9. `resolveAttack` does not roll the dice. The dice are handed to it.** So a
test states the exact dice and the exact answer, with no randomness anywhere.
This is the single most important testing decision in the project.

### 6.4 Occupying

When the defending territory reaches zero armies, the attacker takes it.

- The captured territory changes owner.
- **The smallest legal garrison moves in at once**, which is the number of
  dice the attacker just rolled, or everything the attacking territory can
  spare if that is fewer. So a captured territory is never left standing
  empty, not even for a moment.
- The attacker may then send more, up to everything the attacking territory
  can spare. One army must always stay behind.
- If the smallest garrison is already everything that can be spared, there is
  nothing left to decide and the game does not stop to ask.

**S19. The garrison moves in at the moment of capture, not when the player
chooses.** The first version left the captured territory on zero until the
player was asked. That looked tidy until a game was won by its last capture:
the game ended before anyone was asked, so the winning territory stayed empty
for good. The whole-game test in plan 1.5.6 found it. Moving the garrison at
once removes the empty state altogether, which turns "a territory is never
empty" into a rule with no exceptions.

### 6.5 Fortify

One move per turn, at the end.

- Both territories must belong to the player.
- At least one army must stay behind.
- The distance allowed depends on `options.fortifyDistance`. See D10.
  - `'adjacent'`: the two territories must share a border.
  - `'connected'`: a path must exist between them where the player owns every
    territory on the way. The engine finds this with a breadth-first search,
    which means it checks all territories one step away, then all two steps
    away, and so on.

### 6.6 Cards

A player who captures at least one territory during a turn draws one card at the
end of that turn. One card per turn at most, however many territories they took.

A card carries one symbol: infantry, cavalry or artillery. Two wild cards carry
no symbol and count as any symbol.

A set is three cards with the same symbol, or three cards with three different
symbols.

A player may trade one set during the reinforce phase. A player holding five or
more cards must trade before doing anything else.

Value of a set, from `options.cardSetValue`. See D9.

| Setting | Value |
|---|---|
| `'fixed'` | Infantry 4, cavalry 6, artillery 8, three different 10 |
| `'rising'` | 4, then 6, 8, 10, 12, 15, and 5 more for every set after that |

Rising is the default. The count rises across the whole game, not per player.
That is what makes late turns big and ends the game.

### 6.7 Elimination and winning

A player who owns no territories is eliminated at once and takes no more turns.

A player who owns every territory on the map has won. The phase becomes
`gameOver` and `winnerId` is set.

---

## 7. Options

```ts
interface GameOptions {
  readonly cardSetValue: 'fixed' | 'rising'          // default 'rising'
  readonly fortifyDistance: 'adjacent' | 'connected' // default 'connected'
  readonly diceDisplay: 'oneByOne' | 'allAtOnce'     // default 'allAtOnce'
}
```

`diceDisplay` belongs to the view only. The engine ignores it. It sits here so
that one value holds every setting a player picked.

See D9, D10 and D11.

---

## 8. Randomness

**S10. The engine never calls `Math.random`. A random source is handed in.**

```ts
interface RandomSource {
  nextInt(maxExclusive: number): number   // 0 to maxExclusive - 1
}
```

Three go in the box:

| Name | What it does | Used by |
|---|---|---|
| `seededRandom(seed)` | The same seed always gives the same game | The real game |
| `scriptedRandom([...])` | Returns the numbers you listed, in order | Tests |
| `fixedRandom(n)` | Always returns n | Tests |

Using a seeded source for the real game costs nothing and buys two things. A
game can be replayed exactly from its seed. And a bug found in a real game can
be reproduced in a test.

Dice are built on top:

```ts
function rollDice(random: RandomSource, count: number): number[]   // each 1 to 6
```

---

## 9. Driving the engine

One way in. One way to ask what is allowed.

```ts
function applyAction(
  state: GameState,
  action: GameAction,
  random: RandomSource,
): GameState

function legalActions(state: GameState): GameAction[]
```

```ts
type GameAction =
  | { type: 'tradeCards';      cardIds: readonly [string, string, string] }
  | { type: 'placeArmies';     territoryId: TerritoryId; count: number }
  | { type: 'attack';          fromId: TerritoryId; toId: TerritoryId }
  | { type: 'occupy';          count: number }
  | { type: 'endAttackPhase' }
  | { type: 'fortify';         fromId: TerritoryId; toId: TerritoryId; count: number }
  | { type: 'skipFortify' }
```

**S11. `legalActions` serves both the screen and the computer player.** The
screen uses it to grey out what a player cannot do. The computer player picks
its move from the same list. So the two can never disagree about the rules, and
the rules live in one place.

Where an action carries a number of armies, the listed action carries the
SMALLEST legal number, and `armyLimitFor(state, action)` reports the largest.
`applyAction` accepts anything between. Listing every count separately would
give hundreds of near-identical entries and help nobody.

A test checks that every action `legalActions` offers is one `applyAction`
accepts. If the two ever drift apart, the screen would offer a move that then
throws.

**S12. `applyAction` throws `IllegalActionError` when handed an illegal action.**
It does not return an error value. The screen never sends an illegal action,
because it only offers what `legalActions` returned. So a throw means a real bug
and should be loud.

---

## 10. Setting a game up

**S13. Phase 1 sets the board up automatically. The players do not place their
first armies by hand.**

Manual placement is a whole interactive phase of its own, and it stands between
us and a game we can play. It is worth building later, and it is recorded in
section 14 as deliberately left out, not forgotten.

Automatic setup:

1. Shuffle the territories using the random source.
2. Deal them out one at a time to each player in turn. Every player gets a whole
   number of territories, or one more than another player at most.
3. Put one army on each territory.
4. Spread each player's remaining armies over the territories they own, one at a
   time, going round.

Starting armies, following the board game Risk:

| Players | Armies each |
|---|---|
| 2 | 40 |
| 3 | 35 |
| 4 | 30 |
| 5 | 25 |
| 6 | 20 |

A two-player game of Risk normally uses a neutral third army. We do not build
that in phase 1. See section 14.

---

## 11. The screen

### 11.1 How it is drawn

React, with the map as SVG. See D17 and D18.

Each territory is one `<path>`. The browser then owns the tap handling, so no
code works out which shape a finger landed on.

- **Fill colour** shows the owner. Grey means nobody owns it.
- **Outline colour** shows the region.
- **The army count** is drawn at `labelAt` in a circle, so it stays readable over
  any fill.

### 11.2 One direction of flow

**S14. The screen is built from the game state, every time. Nothing on screen is
patched by hand.**

```
  game state  ->  React works out the screen  ->  the player taps
       ^                                                |
       +--------  applyAction returns a new state  <----+
```

So the screen cannot disagree with the game. This is D18, and it is why React
earns its place here.

### 11.3 Both a finger and a mouse

See D16.

1. Read `onPointerDown`, never `onTouchStart`. One event covers a finger, a
   mouse and a stylus.
2. Never write a size in pixels. The SVG scales to whatever screen it lands on.
3. Hover may add information. It must never be the only way to see something,
   because a finger cannot hover.

---

## 11.5 Animations and sounds

Nick asked for these while watching a game: smoke on the border during an
attack, landing craft arriving at an island, parachutists inland, a convoy
when armies move. They are there so a person can see WHAT happened, not only
read that it happened.

**S23. An effect is worked out from the action, and nothing else.** One pure
function takes the map and one action and returns a list of effects to draw.
It touches no browser and no clock, so it is tested the same way the rules
are. The screen draws whatever the list says.

**S24. The game never waits for an animation.** The state changes at once and
the effect is drawn over the top of it. So a slow iPad, a player who turns
animations off, and a browser that refuses to animate all still play the same
game at the same speed. This follows from S14: the screen is built from the
state, and an effect is not state.

**S25. Sound is off until a player turns it on.** Two reasons, both outside
our control. A browser refuses to make a sound before the person has touched
the page, so a sound at the wrong moment is silently dropped. iPadOS also
mutes web audio in silent mode, so a player can have sound switched on in
the game and hear nothing, and think the game is broken.

**S25a. Switching sound on must START a sound inside the tap, not only ask
for permission.** Safari on iPadOS does not count `resume()` on its own. It
wants a sound actually playing while the finger is down. One frame of
silence counts. This was found the hard way: sound worked in a browser on
the computer and did nothing at all on the iPad.

**S25b. The switch proves itself.** Turning sound on plays two notes and
says so. Three different things can leave a player in silence, and they need
three different answers: the browser has no sound engine, the browser is
still holding sound back, or the iPad is in silent mode. Only the last one
is common, and no website can do anything about it, so the game has to say
which one it is rather than leave a person guessing.

Every sound is built in code from an oscillator and noise. No audio files.
That keeps the app small, keeps it working offline, and means there is
nothing to host.

**S30. The game says when a set is waiting to be traded.**

Nick, after losing games: "sometimes we've lost a game and realised that we
should have traded a set." Nothing on screen ever said so. The cards were
all there to see, and spotting three of a kind among five cards while you
are thinking about an attack is a job nobody should have to do.

So the trade button turns green and the game rings once. It rings ONCE, when
the set appears. A bell that goes off every turn is a bell nobody hears.

Green only during the reinforce phase, because that is the only time a set
can be traded. Green at any other moment would send a player to a button
that does nothing.

**The green button trades in one tap.** It picks the set itself when the
player has picked nothing, and respects their choice when they have. The
reported fault is that the trade gets forgotten, so every step between
noticing and trading is another chance to forget. Trading is also never the
wrong move to have made: a set traded is armies now, and holding one gains
nothing on its own.

**S29. Anything drawn from the side is never turned past upright.**

A lorry and a boat are drawn from the side. Turning one to face its
direction of travel is the obvious answer and it is wrong: heading west is
half a turn, and half a turn puts the wheels in the air. Nick saw it -
"the convoy trucks are often moving upside down."

So `facingAlong` mirrors the drawing to face the other way and leans it at
most 30 degrees. It is the rule a map application follows, and it holds for
every direction rather than for the ones that happen to be tested. The test
walks all 360 degrees.

**S28. A sound is built INTO a context, not played at a speaker.**

`soundInto(context, kind)` builds the sound and stops there. `playSound`
hands it the live context. A check hands it an offline one, renders it and
measures what came out.

That is the only way to judge a sound without ears, and it is what fixed the
explosion. Nick heard the first one as "someone using a hammer". Four things
say HIT rather than BLAST, and it had all four, each of them a number:

| Measured | Hammer | Blast | Before | After |
|---|---|---|---|---|
| Time to reach full loudness | instant | slow | 31 ms | 72-137 ms |
| Time to fall to a tenth | short | long | 143 ms | 596-696 ms |
| Share of energy below 250 Hz | low | high | 0.50 | 0.77 |
| Something to roll away into | none | echo | none | 1.6 s |

The after figures cover a range because each explosion scatters its debris
differently, so no two are the same.

**S26. Whether a place is an island is written in the map file.** It is not
worked out from the shape.

That was measured, not assumed. Shapes that share a land border also share
an edge, so a shared edge of zero length looks like a sea crossing. It
finds Rottnest, the Whitsundays and Bass Strait correctly. It also calls
Perth an island, because a coastal city is drawn on top of the coast and
juts into the water, so it touches the land around it at one corner only.
Containment does not separate them either: only Canberra is fully inside
its place.

A one-word fact in the map file is also the kind of thing James can read and
change, which the geometry would not be. See D14.

**S27. Armies cross water when exactly ONE end of the move is an island.**

So Melbourne to Launceston crosses Bass Strait and goes by boat. Launceston
to Hobart does not, because both are on the same island, and those armies
drive. Perth to Rottnest crosses, Sydney to Melbourne does not.

The rule holds even for a long fortify, where armies may move any distance
through their own land. If one end is an island and the other is not, water
is crossed somewhere along the way.

---

## 11.4 Computer players

**S20. A computer player is asked for ONE action and returns one, and it may
only return something `legalActions` offered.** So it cannot cheat, because it
never sees the rules. It sees only the list of what is allowed, the same list
the screen greys out from. A test walks every position and checks this.

Three of them, built as steps so the difference is visible:

| Name | What it does |
|---|---|
| Reckless | Picks at random. The baseline everything else is measured against. |
| Cautious | Attacks only when ahead. Reinforces its frontier, fortifies forward. |
| Greedy | The same, but chooses attacks and placements by region value. |

`PlayerKind` is `'human'` or one of the three, as ONE field. Two fields would
allow "a computer with no skill" and "a person with a skill", neither of which
means anything.

**S21. Strength is measured, not asserted.** A tournament plays hundreds of
games and reports the score. Measured 2026-09-07:

| Match | 200 games |
|---|---|
| Greedy vs Reckless | 199 - 1 |
| Cautious vs Reckless | 198 - 2 |
| Greedy vs Cautious | 94 - 100 |

Greedy is NOT stronger than Cautious, and the tests say so.

**S22. A tournament runs several SEPARATE seed ranges, never one long run.**

This was learned the hard way, twice. A 40-game run read 21-19 in Greedy's
favour and would have let a false claim through. Later, a rule tuned on
seeds 1 to 200 scored 108 to 88 and looked like a real improvement. On
seeds starting at 5000, 20000 and 90000 it scored 93-107, 97-102 and
103-96. Across all 800 games it was 401 to 393.

The first range had been used to CHOOSE the rule, so of course the rule did
well on it. A rule must be judged on games it was not tuned against, or the
measurement only tells you what you already did.

### The odds a Conquest attack really has

Worked out exactly, by counting every outcome rather than by simulating.
Kept here because it is easy to get wrong and easy to check.

With three dice against two, per exchange, the attacker loses 0.921 armies
and the defender 1.079. **The attacker is favoured.**

Over a whole conquest that reverses, because a shrinking attacking stack
rolls fewer dice. The armies needed to take a territory:

| Defenders | For an even chance | For 70% | For 85% |
|---|---|---|---|
| 1 | 3 | 3 | 4 |
| 2 | 4 | 5 | 6 |
| 5 | 6 | 8 | 10 |
| 10 | 11 | 13 | 16 |
| 20 | 19 | 23 | 26 |

So "attack when you have more armies than them" is roughly an even chance,
not the safe rule it sounds like. Curiously, players built to demand better
odds than that played WORSE, because they attacked too rarely. See plan
task 4.7.

---

## 12. Numbers we will get wrong

**S15. Every number that affects balance lives in one place.**

Region bonuses live in the map file. Everything else lives in
`src/engine/balance.ts`.

These numbers are settings, not facts. We picked them from the board game Risk
and from guesswork. They will be wrong. Changing them must be a one-line edit
that needs no hunting, because we will do it many times.

This is also the part of the project James can change by himself with no
programming. See D14.

---

## 13. Testing

**S16. Every rule in section 6 has a test. No test uses real randomness.**

- Tool: Vitest, in watch mode. See D19.
- Engine tests need no browser and run in milliseconds.
- Every test that involves dice uses `scriptedRandom`, so the answer is exact.
- `engine-purity.test.ts` reads the engine source and fails if it imports the
  screen or touches `window`, `document`, `Math.random` or `Date`.
- `map.test.ts` runs `validateMap()` against every map we ship.

The tie rule in section 6.3 gets its own test with its own name, because it is
the rule people misremember.

---

## 14. Left out on purpose

Each item here is a real rule of the board game Risk that we decided not to
build in phase 1. This section exists so that "we chose not to" never gets
confused with "we forgot".

| Left out | Why |
|---|---|
| Placing your first armies by hand | A whole interactive phase. It stands between us and a playable game. Worth doing in phase 2. |
| The neutral third army in a two-player game | Only affects two-player games. Play three-handed until it exists. |
| Two extra armies for trading a card showing a territory you own | A small rule with a fiddly special case in the screen. Add once trading works. |
| Taking a beaten player's cards | Needs the forced trade-down rule when the winner then holds six or more. Both together, later. |
| Mission cards, such as "capture Asia" | A different way to win. A big change. Not phase 1. |
| Saving a game part way through | Needs the game state written to storage. Cheap once the state settles, so wait until it has. |

---

## 15. Folder layout

```
Conquest/
  DESIGN-BRIEF.md
  README.md
  docs/
    conquest-spec.md              this file
    conquest-build-plan.md        the phases and their tasks
  src/
    engine/                       the rules, pure TypeScript
      types.ts                    every type in section 4
      balance.ts                  every number from section 12
      random.ts                   the three random sources
      dice.ts                     rollDice
      attack.ts                   resolveAttack
      reinforce.ts                the sum in section 6.1
      cards.ts                    sets and their value
      fortify.ts                  the reachability search
      setup.ts                    section 10
      game.ts                     applyAction and legalActions
      index.ts                    what the rest of the program may use
    maps/
      australia.ts                the map from section 3.3
      validate.ts                 the checks from section 3.2
    ui/
      App.tsx
      MapView.tsx
      TerritoryShape.tsx
      ...                         more as they are built
    main.tsx                      starts the program
  index.html
  package.json
  tsconfig.json
  vite.config.ts
```

**S17. `src/engine/index.ts` is the only door into the engine.** The screen
imports from `../engine`, never from `../engine/attack`. So we can move a file
inside the engine without touching the screen.
