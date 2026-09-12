import { writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { Worker } from 'node:worker_threads'

/**
 * A league of candidates, playing each other. Plan task 4.45.
 *
 * The tuner (`tune.mjs`) measures a candidate against the players we
 * shipped, so it can learn to beat Planner, Greedy and the Turtle in
 * particular. A league never lets that happen: candidates play EACH OTHER,
 * and the ones that win breed. Nobody can specialise, because the field
 * changes every generation.
 *
 * Champions of past generations stay in the field as well. Without them a
 * league goes round in circles: A beats B, B beats C, C beats A, and each
 * generation forgets what the last one learned.
 *
 *   npm run league                 a short run, about ten minutes
 *   npm run league -- --rounds 30  a longer one
 *
 * A candidate is three sets of numbers: for a scattered board, for a
 * coalesced one, and for a game with one opponent left. See general.ts.
 */

const args = process.argv.slice(2)
const numberArg = (name, fallback) => {
  const at = args.indexOf(`--${name}`)

  return at === -1 ? fallback : Number(args[at + 1])
}

const ROUNDS = numberArg('rounds', 12)
const POPULATION = numberArg('population', 16)
const KEEP = numberArg('keep', 6)
/** Seeds per table. Each is played from every seat. */
const SEEDS = numberArg('seeds', 3)
/** How many tables of four each candidate sits at per round. */
const TABLES_EACH = numberArg('tables', 4)
const MAP = args.includes('--map') ? args[args.indexOf('--map') + 1] : 'world'
const OUT = 'tools/league-report.txt'

/** What may vary, and how far. The same dials the tuner uses. */
const DIALS = [
  { name: 'secondLine', low: 1, high: 4, whole: true },
  { name: 'doorGuard', low: 0, high: 5, whole: true },
  { name: 'denialGuard', low: 0, high: 5, whole: true },
  { name: 'frontShare', low: 0.2, high: 1.5 },
  { name: 'breakIsWorth', low: 0, high: 14 },
  { name: 'onPlan', low: 0, high: 20 },
  { name: 'finishIsWorth', low: 0, high: 12 },
  { name: 'toKeepGoing', low: 0, high: 8, whole: true },
  { name: 'safeMargin', low: 0, high: 4, whole: true },
  { name: 'evenMargin', low: 0, high: 2, whole: true },
  { name: 'cardOdds', low: 0, high: 20 },
  { name: 'cardWorthShare', low: 0, high: 1 },
  { name: 'leaveItToOthers', low: 0, high: 1 },
  { name: 'knockoutIsWorth', low: 0, high: 20 },
  { name: 'cardsMatter', low: 0, high: 8 },
  { name: 'taxIsWorth', low: 0, high: 10 },
  { name: 'counterChance', low: 0, high: 0.5 },
  { name: 'hitBackIsWorth', low: 0, high: 16 },
  { name: 'retakeIsWorth', low: 0, high: 16 },
  { name: 'cheapLean', low: 1.5, high: 6 },
  { name: 'leaderIsWorth', low: 0, high: 24 },
  { name: 'leaderLead', low: 1.1, high: 2.5 },
  { name: 'raceLand', low: 1, high: 6, whole: true },
  { name: 'raceIsWorth', low: 0, high: 10 },
  { name: 'tradeAt', low: 3, high: 5, whole: true },
  { name: 'oneDieAbove', low: 0, high: 14, whole: true },
  { name: 'nearlyAsGood', low: 0.02, high: 0.4 },
  { name: 'keepAfterCapture', low: 0.4, high: 2 },
]

const engine = await import('./dist/engine.js')

/** The players we ship, as candidates, so they can join the field. */
const SHIPPED = {
  general: {
    early: { ...engine.GENERAL_SETTINGS },
    late: {},
    duel: { ...engine.GENERAL_DUEL },
    lateFrom: 1,
  },
  optimus: {
    early: { ...engine.OPTIMUS_SETTINGS },
    late: { ...engine.OPTIMUS_LATE },
    duel: { ...engine.OPTIMUS_DUEL },
    lateFrom: 0.4,
  },
}

// -------------------------------------------------------- the workers

const cores = Math.max(1, availableParallelism() - 1)
const workers = Array.from({ length: cores }, () => new Worker('./tools/league-worker.mjs'))
const waiting = new Map()
let nextJob = 0

for (const worker of workers) {
  worker.on('message', (answer) => {
    const settle = waiting.get(answer.id)

    waiting.delete(answer.id)
    settle(answer)
  })
  worker.on('error', (fault) => {
    console.error(fault)
    process.exit(1)
  })
}

function playTable(worker, seats, seeds) {
  const id = (nextJob += 1)

  return new Promise((settle) => {
    waiting.set(id, settle)
    worker.postMessage({ id, seats, seeds, map: MAP })
  })
}

/** Play every table, one per free core at a time. */
async function playAll(tables) {
  const answers = new Array(tables.length)
  let next = 0

  await Promise.all(
    workers.map(async (worker) => {
      while (next < tables.length) {
        const mine = next
        next += 1
        answers[mine] = await playTable(worker, tables[mine].seats, tables[mine].seeds)
      }
    }),
  )

  return answers
}

// ------------------------------------------------------- the breeding

function bell() {
  return Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random())
}

/** A copy of one set of numbers, nudged. `much` is how hard to nudge. */
function nudged(settings, much) {
  const changed = { ...settings }

  for (const dial of DIALS) {
    if (settings[dial.name] === undefined || Math.random() > 0.3) {
      continue
    }

    const step = (dial.high - dial.low) * much * bell()
    const value = Math.min(dial.high, Math.max(dial.low, settings[dial.name] + step))

    changed[dial.name] = dial.whole ? Math.round(value) : Math.round(value * 100) / 100
  }

  return changed
}

function child(parent, much) {
  return {
    early: nudged(parent.early, much),
    late: nudged({ ...parent.early, ...parent.late }, much),
    duel: parent.duel,
    lateFrom: parent.lateFrom,
  }
}

// -------------------------------------------------------- the league

let field = [
  SHIPPED.optimus,
  SHIPPED.general,
  ...Array.from({ length: POPULATION - 2 }, () => child(SHIPPED.optimus, 0.15)),
]
const champions = []
const lines = [
  `A league of ${POPULATION}, ${ROUNDS} rounds, ${TABLES_EACH} tables each of ${SEEDS * 4} games, on ${MAP}.`,
  `${cores} cores.`,
  '',
]

console.log(lines.join('\n'))

for (let round = 1; round <= ROUNDS; round += 1) {
  const runners = [...field, ...champions.slice(-4)]
  const played = runners.map(() => 0)
  const won = runners.map(() => 0)
  const tables = []

  for (let table = 0; table < (runners.length * TABLES_EACH) / 4; table += 1) {
    const seats = []

    while (seats.length < 4) {
      const pick = Math.floor(Math.random() * runners.length)

      if (!seats.includes(pick)) seats.push(pick)
    }

    tables.push({
      seats: seats.map((at) => runners[at]),
      seeds: Array.from({ length: SEEDS }, () => 9_000_000 + Math.floor(Math.random() * 900_000)),
      who: seats,
    })
  }

  const answers = await playAll(tables)

  tables.forEach((table, at) => {
    table.who.forEach((runner, seat) => {
      won[runner] += answers[at].wins[seat]
      played[runner] += SEEDS * 4
    })
  })

  const ranked = runners
    .map((settings, at) => ({
      settings,
      share: played[at] === 0 ? 0 : won[at] / played[at],
      games: played[at],
    }))
    .sort((one, two) => two.share - one.share)

  const elite = ranked.slice(0, KEEP)

  champions.push(elite[0].settings)
  field = [
    ...elite.map((each) => each.settings),
    ...Array.from({ length: POPULATION - KEEP }, () =>
      child(elite[Math.floor(Math.random() * KEEP)].settings, 0.12),
    ),
  ]

  const line =
    `round ${String(round).padStart(2)}: best ${(elite[0].share * 100).toFixed(0)}% of ` +
    `${elite[0].games} games, elite average ${((elite.reduce((total, each) => total + each.share, 0) / KEEP) * 100).toFixed(0)}%`

  console.log(line)
  lines.push(line)
}

// ------------------------------------------- the honest final check

const champion = champions[champions.length - 1]
const HELD_BACK = Array.from({ length: 30 }, (unused, index) => 9_900_000 + index * 271)
const table = [champion, SHIPPED.optimus, SHIPPED.general, SHIPPED.optimus]
const check = await playTable(workers[0], table, HELD_BACK)
const total = check.wins.reduce((sum, each) => sum + each, 0)

lines.push(
  '',
  `Champion against Optimus, the General and Optimus again, ${total} games the league never saw:`,
  `  champion ${check.wins[0]}, optimus ${check.wins[1]}, general ${check.wins[2]}, optimus ${check.wins[3]}`,
  '',
  'The champion, for a scattered board:',
  JSON.stringify(champion.early, null, 2),
  '',
  'And once it has coalesced:',
  JSON.stringify(champion.late, null, 2),
)

writeFileSync(OUT, lines.join('\n'))
console.log(`\nWritten to ${OUT}`)

for (const worker of workers) {
  await worker.terminate()
}
