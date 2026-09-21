import { readFileSync } from 'node:fs'

/**
 * Read a game saved from the app, and tell its story. Plan task 4.58.
 *
 *   npm run tune:build                    once, to build the engine
 *   node tools/read-game.mjs <file>       the story, round by round
 *   node tools/read-game.mjs <file> --log every line of the game's history
 *
 * The game is REPLAYED from the file, not read back from a summary: the
 * file holds the board it began on, the dice seed, and every action. So
 * every board of the game can be looked at, and the replay is checked
 * against how the app said the game stood when it was saved.
 */

const engine = await import('./dist/engine.js')
const { readSavedGame, replayTo, seededRandom, applyAction, endingOf, standings } = engine

const file = process.argv[2]

if (file === undefined) {
  console.error('Say which file: node tools/read-game.mjs <file>')
  process.exit(1)
}

const saved = readSavedGame(readFileSync(file, 'utf8'))
const first = saved.first
const nameOf = (id) => first.players.find((each) => each.id === id)?.name ?? id
const kindOf = (id) => first.players.find((each) => each.id === id)?.kind ?? '?'

console.log(`Saved ${saved.savedAt}, by build ${saved.build?.commit ?? 'unknown'}`)
console.log(`Map: ${first.map.name}. ${saved.actions.length} actions.`)
console.log('Players, in turn order:')
first.players.forEach((each, at) => console.log(`  ${at + 1}. ${each.name} (${each.kind})`))
console.log('Rules:', JSON.stringify(first.options))

// Play it through, keeping the board at the start of each round.
const random = seededRandom(saved.diceSeed)
let state = first
let round = state.round
const rounds = [{ round, state }]

for (const action of saved.actions) {
  state = applyAction(state, action, random)

  if (state.round !== round) {
    round = state.round
    rounds.push({ round, state })
  }
}

// Does the replay land where the app said the game stood?
const wanted = saved.ending
const got = endingOf(state)
const sameOwners = Object.keys(wanted.owners).every((id) => wanted.owners[id] === got.owners[id])

if (got.winnerId !== wanted.winnerId || got.round !== wanted.round || !sameOwners) {
  console.log('\nWARNING: the replay does not end the way the saved game did.')
  console.log('The rules have probably changed since this build. Read what follows with care.')
} else {
  console.log('\nReplay checked: it ends exactly where the saved game did.')
}

console.log(
  state.winnerId === null
    ? `\nNot finished. Saved in round ${state.round}.`
    : `\nWinner: ${nameOf(state.winnerId)} (${kindOf(state.winnerId)}), in round ${state.round}.`,
)

console.log('\nWho went out, and when:')
for (const entry of state.log) {
  const out = /^(.*) is out of the game\./.exec(entry.text)
  if (out) console.log(`  round ${entry.round}: ${out[1]}`)
}

// Land, armies, cards and chance of winning at the start of every round.
const players = first.players
const width = 22
console.log('\nAt the start of each round: land / armies / cards / chance')
console.log('round  ' + players.map((each) => `${each.name} (${each.kind})`.slice(0, width).padEnd(width)).join(''))

for (const { round: at, state: board } of rounds) {
  const chance = new Map(standings(board).map((each) => [each.playerId, each.chance]))
  const cells = players.map((player) => {
    const now = board.players.find((each) => each.id === player.id)
    if (now?.isEliminated) return 'out'.padEnd(width)
    const land = Object.values(board.territories).filter((each) => each.ownerId === player.id)
    const armies = land.reduce((total, each) => total + each.armies, 0)
    const odds = Math.round((chance.get(player.id) ?? 0) * 100)
    return `${land.length} / ${armies} / ${now?.cards.length ?? 0} / ${odds}%`.padEnd(width)
  })
  console.log(String(at).padStart(5) + '  ' + cells.join(''))
}

// Who held each continent at the start of each round, when it changed.
console.log('\nContinents changing hands (at the start of a round):')
let before = new Map()
for (const { round: at, state: board } of rounds) {
  for (const region of board.map.regions) {
    const inside = board.map.territories.filter((each) => each.regionId === region.id)
    const owners = new Set(inside.map((each) => board.territories[each.id]?.ownerId))
    const holder = owners.size === 1 ? [...owners][0] : null
    if (holder !== before.get(region.id)) {
      console.log(`  round ${at}: ${region.name} ${holder === null ? 'held by nobody' : `held by ${nameOf(holder)}`}`)
    }
    before.set(region.id, holder)
  }
}

if (process.argv.includes('--log')) {
  console.log('\nThe whole history:')
  for (const entry of state.log) console.log(`  [${entry.round}] ${entry.text}`)
}
