import { parentPort } from 'node:worker_threads'

/**
 * One core, playing games. Plan task 4.42.
 *
 * It is handed a set of numbers for the General to play by and a list of
 * seeds, and it answers with how many of those games the General won. It
 * holds no opinion about anything: all the thinking is in tune.mjs.
 */

const engine = await import('./dist/engine.js')

const { applyAction, createGame, playerFor, seededRandom } = engine

/**
 * The settings object each job may change. Plan tasks 4.42 and 4.43.
 *
 * 'general' and 'optimus' are the same player with different numbers.
 * 'optimus-late' is the second set Optimus uses once the board has
 * coalesced, which is tuned on its own.
 */
const DIALS_OF = {
  general: engine.GENERAL_SETTINGS,
  optimus: engine.OPTIMUS_SETTINGS,
  'optimus-late': engine.OPTIMUS_LATE,
}

/** Which player wins a game for the job that is tuning these dials. */
const PLAYS_AS = {
  general: 'general',
  optimus: 'optimus',
  'optimus-late': 'optimus',
}

/** The maps the tuner may use, by name. */
const MAPS = {
  world: engine.WORLD,
  'australia-big': engine.AUSTRALIA_BIG,
}

function playOne(map, order, seed, players) {
  const random = seededRandom(seed)
  const choices = seededRandom(seed * 31 + 7)
  let state = createGame({
    map,
    players: Array.from({ length: players }, (unused, index) => ({
      name: `p${index}`,
      kind: order[index % order.length],
    })),
    random,
  })

  for (let step = 0; step < 60000 && state.winnerId === null; step += 1) {
    const kind = state.players.find((each) => each.id === state.turn.playerId)?.kind

    state = applyAction(state, playerFor(kind).chooseAction(state, choices), random)
  }

  return state.players.find((each) => each.id === state.winnerId)?.kind ?? null
}

parentPort.on('message', (job) => {
  Object.assign(DIALS_OF[job.tuning], job.settings)

  const map = MAPS[job.map]
  const mine = PLAYS_AS[job.tuning]
  let won = 0
  let played = 0

  for (const seed of job.seeds) {
    // Every seat, so a result is never about who moved first.
    for (let seat = 0; seat < job.table.length; seat += 1) {
      const order = job.table.map(
        (unused, index) => job.table[(index + seat) % job.table.length],
      )

      if (playOne(map, order, seed + seat, job.table.length) === mine) {
        won += 1
      }
      played += 1
    }
  }

  parentPort.postMessage({ id: job.id, won, played })
})
