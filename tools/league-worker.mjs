import { parentPort } from 'node:worker_threads'

/**
 * One core, playing league games. Plan task 4.45.
 *
 * Unlike the tuner's worker, every seat here plays by its OWN numbers, so
 * candidates meet each other rather than the players we shipped. It is
 * handed a table of settings and answers with who won each game.
 */

const engine = await import('./dist/engine.js')

const { applyAction, createGame, generalPlaying, seededRandom } = engine

const MAPS = {
  world: engine.WORLD,
  'australia-big': engine.AUSTRALIA_BIG,
}

/** A player that plays by one candidate's numbers. */
function candidatePlayer(settings) {
  return generalPlaying(
    'optimus',
    'Candidate',
    'A candidate in the league.',
    settings.early,
    settings.duel,
    settings.late,
    settings.lateFrom,
  )
}

/** One game between the given candidates. Answers the seat that won. */
function playOne(map, players, seed) {
  const random = seededRandom(seed)
  const choices = seededRandom(seed * 31 + 7)
  let state = createGame({
    map,
    players: players.map((unused, index) => ({ name: `p${index}`, kind: 'optimus' })),
    random,
  })

  for (let step = 0; step < 60000 && state.winnerId === null; step += 1) {
    const seat = state.players.findIndex((each) => each.id === state.turn.playerId)

    state = applyAction(state, players[seat].chooseAction(state, choices), random)
  }

  return state.players.findIndex((each) => each.id === state.winnerId)
}

parentPort.on('message', (job) => {
  const map = MAPS[job.map]
  const players = job.seats.map(candidatePlayer)
  const wins = job.seats.map(() => 0)

  for (const seed of job.seeds) {
    // Every seat order, so no candidate wins by moving first.
    for (let turn = 0; turn < players.length; turn += 1) {
      const order = players.map((unused, index) => players[(index + turn) % players.length])
      const won = playOne(map, order, seed + turn)

      if (won >= 0) {
        // Undo the rotation to find whose candidate that seat was.
        wins[(won + turn) % players.length] += 1
      }
    }
  }

  parentPort.postMessage({ id: job.id, wins })
})
