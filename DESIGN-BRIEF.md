# Conquest - design brief

A strategy game for the iPad, in the style of the classic board game Risk. It
also runs in a web browser on a desktop or laptop computer.

Started 2026-09-04. Answers from James and Nick added 2026-09-06.

This page holds every decision made so far. Read it first. Nothing here is
locked. Any of it can change.

## What we are building

A turn-based territory game that runs on an iPad. James (12) and Nick build it
together. The real goal is to teach James programming, so the code has to be
readable and testable, not clever.

**The game is called Conquest.** "Risk" is a trademark of Hasbro, so we do not
use that name for our game. This document names the board game Risk only when it
describes where a rule came from.

## The three ways to build an iPad app, and why we picked one

We looked at three routes.

| Route | Needs a Mac? | Needs an Apple account? | Can Claude test it? |
|---|---|---|---|
| Native Swift app | Yes | Yes | No |
| PWA (a web app you add to the Home Screen) | No | No | Yes |
| React Native / Expo | Only for the App Store build | For the App Store | Mostly |

**We picked the PWA.** Reasons:

1. Nick has no Mac, so the native route is closed.
2. A change reaches the iPad in seconds. James sees his work immediately.
3. It costs nothing and needs no Apple approval.

A free Apple ID can sign a native app, but Apple gives that signature a 7-day
life. After 7 days the app stops opening. That alone rules out route 1.

### What PWA means

PWA is short for Progressive Web App. It is an ordinary web page plus two extra
files.

- **A manifest.** A small text file that gives the app a name, an icon, and a
  "run full screen" flag. This makes the Home Screen icon work with no browser
  bars around it.
- **A service worker.** A small script the browser keeps after the page closes.
  It stores the app files, so the game opens with no internet.

That is the whole trick. It is a normal website that behaves like an app.

## Where it will live

The URL will be **https://conquest.datacrafter.net**.

Nick already owns `datacrafter.net` through Cloudflare. Adding `conquest` is
one more DNS record.

**Hosting: Cloudflare Pages.** It builds the site from a Git repository and
serves it for free. No machine of Nick's has to stay switched on.

We rejected DuckDNS. DuckDNS exists to give a name to a home internet address
that keeps changing. We own a real domain, so we do not need it.

## The one design decision that matters most

Split the code in two parts and keep them apart.

**1. The rules engine.** Pure TypeScript. It knows about territories, borders,
dice, reinforcements, combat, cards, turn phases and winning. It knows nothing
about screens, taps or colours.

**2. The view.** The part that draws the map and reads taps and clicks.

Why this matters:

- The rules engine can be tested without running the game. James writes a test
  that says "3 attackers against 2 defenders rolls 3 dice against 2 dice", and
  it either passes or fails in under a second.
- If we ever move to a native app, the rules engine moves across unchanged. Only
  the view gets rewritten. In a game like this the rules are most of the
  interesting code.

**The shape to aim for:** each rule is a small function that takes the game state
and returns a new game state. It changes nothing outside itself. This is the
same idea as a Scratch block that reports a value.

## Two devices, one view

Phase 5 lets people play from a desktop or laptop browser as well as an iPad.
That changes the view, so we plan for it now. Retrofitting it later is far more
work.

Two rules, from the first line of view code:

1. **Read pointer events, not touch events.** A pointer event covers a finger, a
   mouse and a stylus with one piece of code. Touch events only cover the
   finger. Choosing pointer events costs nothing today and saves a rewrite
   later.
2. **Let the map scale.** Draw the map in its own coordinates and scale it to
   fit whatever screen it lands on. Never write a size in pixels.

Two smaller points to remember:

- A mouse can hover over a territory. A finger cannot. So hover may add
  information, but it must never be the only way to see something.
- A desktop screen is wide, an iPad held upright is tall. The panels around the
  map have to move, not just shrink.

None of this needs building in phase 1. It only needs us to avoid the two
choices that would block it.

## The rules

### Settled rules

**Cards and sets: yes.** A player who takes at least one territory in a turn
draws one card. Three matching cards, or three different cards, make a set. A
player trades a set in for extra armies.

**Occupying a territory you win.** When a player removes the last defending army
from a territory, that player must move armies in from the attacking territory.
The minimum is the number of dice that player rolled.

**Reinforcements at the start of a turn.** The player counts their territories
and divides by three, rounding down. The minimum is three armies. Owning a whole
region adds a bonus for that region.

### Selectable rules

The player picks these before the game starts. The rules engine reads them from
a settings value. It never hard-codes them.

| Setting | Choices | Default |
|---|---|---|
| Card set value | Fixed, or rising | Rising |
| Fortify move distance | Adjacent territory only, or any connected distance | Any connected distance |
| Dice display | One die at a time, or all at once | All at once |

**Card set value** means how many armies a set of three cards is worth.

- *Fixed* gives the same number every time, based on the symbols on the cards.
- *Rising* makes each set worth more than the one before it: 4 armies, then 6,
  then 8, then 10, and so on. This one is the default.

**Fortify move distance** means the one army move a player may make at the end of
a turn, after all attacking has finished.

- *Adjacent territory only* means the armies move one step.
- *Any connected distance* means the armies may travel any number of steps, as
  long as the player owns every territory on the path. This one is the default.

**Dice display** changes how an attack looks on screen. It changes nothing about
the result.

Building these as settings, not as fixed rules, is a good lesson. The rules
engine takes an options value and obeys it. The same code plays every variant.

## The map

**The map is Australia, with islands.** Named so far: Tasmania, the Whitsunday
Islands off Queensland, and Rottnest Island off Perth.

**Drawing style: a simplified real map with coloured regions.** The shapes look
like the real states, but with the small wiggles taken out. Each territory is
one flat colour.

### The phase 1 map

Agreed 2026-09-06. It has 10 territories in 4 regions.

| Region | Territories | Bonus |
|---|---|---|
| The West | Western Australia, Rottnest Island, Northern Territory | to decide |
| The North East | Queensland, Whitsunday Islands | to decide |
| The South East | New South Wales, Australian Capital Territory, Victoria | to decide |
| The South | South Australia, Tasmania | to decide |

Borders between territories, including sea crossings:

- Western Australia touches the Northern Territory and South Australia.
- Rottnest Island touches Western Australia by sea.
- The Northern Territory touches Western Australia, South Australia and
  Queensland.
- South Australia touches Western Australia, the Northern Territory, Queensland,
  New South Wales and Victoria.
- Queensland touches the Northern Territory, South Australia and New South
  Wales.
- The Whitsunday Islands touch Queensland by sea.
- New South Wales touches Queensland, South Australia, Victoria and the
  Australian Capital Territory.
- The Australian Capital Territory touches New South Wales only.
- Victoria touches South Australia and New South Wales.
- Tasmania touches Victoria by sea.

Two things about this map are worth noticing.

1. **The Australian Capital Territory sits inside New South Wales.** It has one
   border. A player who holds it is safe from three sides but can never break
   out except through New South Wales. That is an interesting square to own.
2. **South Australia touches five other territories.** It is the hardest
   territory on the map to defend and the most useful to hold.

### How the map grows later

Do not split the states yet. Later, each state can break into several
territories. Western Australia could become the Kimberley, the Pilbara, the
Goldfields and Perth. That turns the same map into 40 or more territories with
no new code, because the map is data, not code.

## The plan, in five phases

Each phase ends with a game you can actually play.

### Phase 1 - the rules engine and a hot-seat game
Players pass the one iPad around. The 10-territory Australia map. Cards, combat,
fortify moves and a win check all work. No computer player yet.

### Phase 2 - computer opponents
The richest programming lesson in the whole project. A computer player has to
look at the board and choose. It starts stupid, attacking anything it can, and
gets smarter in steps James can understand and change.

### Phase 3 - the PWA wrapper
Add the manifest and the service worker. Publish to
`conquest.datacrafter.net`. Add it to the iPad Home Screen. The game now runs
with no internet.

### Phase 4 - custom maps
Load a map from a file, so Australia is one map among many. Later, a companion
map editor tool for drawing new maps.

### Phase 5 - several players on separate devices
Several people play the same game from separate devices. An iPad, or a web
browser on a desktop or laptop computer. Computer players can join the same
game beside the humans.

This is the only phase that needs a server. Cloudflare Workers with Durable
Objects can hold the game state and pass turns between devices, on the free
tier, on the Cloudflare account Nick already has.

Phases 1 to 4 need no server at all. The game runs entirely on the device.

## Who does what

**Nick and Claude write the code. James watches and learns.** Decided
2026-09-06. This is not a "child types the program" project.

That changes what the code has to be. It must be readable out loud. A person
watching should be able to follow what a function does without stopping to
work it out. Names matter more than usual. Long clever lines are worse than
several plain ones.

It also changes what James can own. Three parts of the game are data, not
code, so he can change them himself and see the result at once:

- The balance numbers. Region bonuses, starting armies, card set values.
- The player colours.
- The map itself, once phase 4 lands.

Keep all the balance numbers in one file for exactly this reason.

## What we build first

**The dice roll.** It is small, it is testable, and it is the heart of the game.

The attack rule is a good size for the first piece of real code:

1. The attacker rolls up to three dice. The defender rolls up to two.
2. Sort each side's dice from high to low.
3. Compare the highest attacker die with the highest defender die.
4. If both sides rolled at least two dice, compare the second pair too.
5. The lower die loses one army. If the two dice are equal, the attacker loses.

That last rule surprises people. The defender wins a tie. It makes attacking
expensive, which is what stops the game ending in ten minutes.

## Where James is starting from

James turns 12 in October 2026. He has used Scratch at school and writes
instruction sequences for Vernie, the Lego Boost robot.

Scratch has already taught him events, loops, conditions and variables. This
game maps straight onto those: a turn is a sequence, a phase is a state, an
attack is a condition plus dice. So he can follow the shape of the code even
before he can write it.

He watches rather than types, so the feedback on screen carries the lesson.
Tests that flick from red to green, and a browser that updates the moment a
file is saved, show cause and effect without anybody explaining it.

Nick is also teaching him Git, using this repository.

## Decisions

- D1. Build a PWA, not a native app. Nick has no Mac and free Apple signing
  expires after 7 days.
- D2. Host on Cloudflare Pages at `conquest.datacrafter.net`. Not DuckDNS.
- D3. Language is TypeScript.
- D4. Keep the rules engine pure and separate from the view.
- D5. Phase 1 uses a small Australia map of 10 territories. The count was
  written as 11 until 2026-09-06, when building the map showed the table had
  only ever listed 10. Eight states and territories, plus Rottnest Island and
  the Whitsunday Islands. Tasmania is both a state and an island, so it is
  counted once.
- D6. Cross-device play is the last phase, not the first.
- D7. The game is called Conquest.
- D8. Use cards and sets.
- D9. Card set value is selectable, fixed or rising. Rising is the default.
- D10. A player may fortify at the end of a turn. The distance is selectable,
  adjacent only or any connected distance. Any connected distance is the
  default.
- D11. Dice display is selectable, one at a time or all at once. All at once is
  the default.
- D12. The map is Australia with islands, drawn as simplified coloured regions.
- D13. The dice roll is the first piece of code.
- D14. Nick and Claude write the code. James watches. So the code must read
  aloud plainly, and the balance numbers live in one file James can change.
- D15. Phase 5 lets several people play one game from separate devices. An
  iPad, or a web browser on a desktop or laptop computer. Computer players may
  join the same game beside the humans.
- D16. The view must work with a mouse and with touch, from the first line of
  code. See "Two devices, one view" above.
- D17. Draw the map as SVG, not canvas. The browser then owns the shapes and
  the tap handling.
- D18. Build the view with React. The screen is rebuilt from the game state,
  never patched by hand. Nick already knows React from another project.
- D19. Test with Vitest, in watch mode.
- D20. Build and serve with Vite.

## Still to decide

- How the map file is shaped.
- The army bonus for each region.
- How many armies each player starts with.
- The colour for each player.
