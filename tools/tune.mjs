import { writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { Worker } from 'node:worker_threads'

/**
 * Find better numbers for the General to play by. Plan task 4.42.
 *
 * Nick: "is there a way that we could use machine learning techniques to
 * work out the strongest strategy and tactics?" This is the first and
 * cheapest of them. Every number the General plays by is a dial. The tuner
 * tries a spread of settings, keeps the best few, narrows the spread around
 * them, and repeats. That is the cross-entropy method, and it is the whole
 * idea: no neural network, and the answer is still a readable list of
 * numbers a person can argue with.
 *
 * Run it:
 *
 *   npm run tune:build          once, to build the engine for the workers
 *   npm run tune                a short run, about five minutes
 *   npm run tune -- --rounds 60 a longer one
 *
 * The rules of measurement from spec S22 are built in. Every round plays
 * FRESH seeds, so a setting cannot flatter itself by being lucky twice, and
 * the winner is finally checked against today's settings on a seed family
 * the tuner never saw.
 */

// ------------------------------------------------------------- the dials

/**
 * What the tuner may change, and how far. `whole` means armies, which come
 * in ones. Anything not listed here is left exactly as it is, including
 * every true-or-false setting: those say what KIND of player it is, and
 * measuring them one at a time has been the job of the plan.
 */
const DIALS = [
  { name: 'secondLine', low: 1, high: 4, whole: true },
  { name: 'doorGuard', low: 0, high: 5, whole: true },
  { name: 'denialGuard', low: 0, high: 5, whole: true },
  { name: 'frontShare', low: 0.25, high: 1.5 },
  { name: 'breakIsWorth', low: 0, high: 14 },
  { name: 'onPlan', low: 0, high: 20 },
  { name: 'finishIsWorth', low: 0, high: 12 },
  { name: 'toKeepGoing', low: 0, high: 6, whole: true },
  { name: 'safeMargin', low: 0, high: 3, whole: true },
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
]

// --------------------------------------------------------- what to run

const args = process.argv.slice(2)
const numberArg = (name, fallback) => {
  const at = args.indexOf(`--${name}`)

  return at === -1 ? fallback : Number(args[at + 1])
}

const ROUNDS = numberArg('rounds', 20)
const CANDIDATES = numberArg('candidates', 24)
const KEEP = numberArg('keep', 6)
/** Seeds per candidate. Each is played once from every seat. */
const SEEDS = numberArg('seeds', 12)
const MAP = args.includes('--map') ? args[args.indexOf('--map') + 1] : 'world'
/**
 * Which numbers to tune: 'general', 'optimus', or 'optimus-late', the set
 * Optimus uses once the board has coalesced (plan task 4.43).
 */
const TUNING = args.includes('--tuning') ? args[args.indexOf('--tuning') + 1] : 'general'
const PLAYS_AS = TUNING.startsWith('optimus') ? 'optimus' : 'general'
const TABLE = args.includes('--table')
  ? args[args.indexOf('--table') + 1].split(',')
  : [PLAYS_AS, 'planner', 'greedy', 'turtle']
const OUT = 'tools/tune-report.txt'

// -------------------------------------------------------- the workers

const cores = Math.max(1, availableParallelism() - 1)
const workers = Array.from({ length: cores }, () => new Worker('./tools/tune-worker.mjs'))
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

/** Give one worker a batch of games and wait for the score. */
function score(worker, settings, seeds) {
  const id = (nextJob += 1)

  return new Promise((settle) => {
    waiting.set(id, settle)
    worker.postMessage({ id, settings, seeds, map: MAP, table: TABLE, tuning: TUNING })
  })
}

/** Play every candidate, one per free core at a time. */
async function scoreAll(candidates, seeds) {
  const answers = new Array(candidates.length)
  let next = 0

  await Promise.all(
    workers.map(async (worker) => {
      while (next < candidates.length) {
        const mine = next
        next += 1
        answers[mine] = await score(worker, candidates[mine], seeds)
      }
    }),
  )

  return answers
}

// ------------------------------------------------------ the tuning itself

/** A number drawn from a bell curve, then kept inside the dial's range. */
function draw(dial, middle, spread) {
  const bell =
    Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random())
  const value = Math.min(dial.high, Math.max(dial.low, middle + bell * spread))

  return dial.whole ? Math.round(value) : Math.round(value * 100) / 100
}

function freshSeeds(round) {
  return Array.from({ length: SEEDS }, () => 2_000_000 + round * 100_000 + Math.floor(Math.random() * 90_000))
}

const engine = await import('./dist/engine.js')
// Where each round starts from. The late set begins as a copy of the early
// one, so the tuner starts by asking "should anything change at all?".
const BASELINE = {
  general: { ...engine.GENERAL_SETTINGS },
  optimus: { ...engine.OPTIMUS_SETTINGS },
  'optimus-late': { ...engine.OPTIMUS_SETTINGS },
}[TUNING]

// Start from today's settings, with a wide spread around each.
let middles = DIALS.map((dial) => BASELINE[dial.name] ?? (dial.low + dial.high) / 2)
let spreads = DIALS.map((dial) => (dial.high - dial.low) / 4)

const lines = [
  `Tuning ${TUNING}: ${ROUNDS} rounds, ${CANDIDATES} candidates, ${SEEDS * TABLE.length} games each, on ${MAP}.`,
  `Table: ${TABLE.join(', ')}. ${cores} cores.`,
  '',
]

console.log(lines.join('\n'))

let best = { settings: BASELINE, share: 0 }

for (let round = 1; round <= ROUNDS; round += 1) {
  const candidates = Array.from({ length: CANDIDATES }, (unused, index) =>
    index === 0 && round === 1
      ? { ...BASELINE }
      : Object.fromEntries(DIALS.map((dial, at) => [dial.name, draw(dial, middles[at], spreads[at])])),
  )
  const seeds = freshSeeds(round)
  const answers = await scoreAll(candidates, seeds)
  const ranked = candidates
    .map((settings, at) => ({ settings, share: answers[at].won / answers[at].played }))
    .sort((one, two) => two.share - one.share)
  const elite = ranked.slice(0, KEEP)

  // The middle of the elite becomes the next middle, and their spread the
  // next spread. That is the whole of the cross-entropy method.
  middles = DIALS.map(
    (dial) => elite.reduce((total, each) => total + each.settings[dial.name], 0) / elite.length,
  )
  spreads = DIALS.map((dial, at) => {
    const apart = elite.map((each) => (each.settings[dial.name] - middles[at]) ** 2)
    const width = Math.sqrt(apart.reduce((total, each) => total + each, 0) / elite.length)

    // Never let a dial go completely still: it could never move again.
    return Math.max(width, (dial.high - dial.low) / 40)
  })

  if (elite[0].share > best.share) {
    best = elite[0]
  }

  const line = `round ${String(round).padStart(2)}: best ${(elite[0].share * 100).toFixed(0)}%, elite average ${((elite.reduce((total, each) => total + each.share, 0) / elite.length) * 100).toFixed(0)}%`

  console.log(line)
  lines.push(line)
}

// --------------------------------------------- the honest final check

const HELD_BACK = Array.from({ length: 60 }, (unused, index) => 7_000_000 + index * 137)
const [wasScored, nowScored] = await Promise.all([
  score(workers[0], BASELINE, HELD_BACK),
  score(workers[1] ?? workers[0], best.settings, HELD_BACK),
])

const changed = DIALS.map((dial) => ({
  name: dial.name,
  was: BASELINE[dial.name],
  now: best.settings[dial.name],
})).filter((each) => each.was !== each.now)

lines.push(
  '',
  `On ${HELD_BACK.length * TABLE.length} games the tuner never saw:`,
  `  today's settings  ${(wasScored.won / wasScored.played * 100).toFixed(1)}%`,
  `  tuned settings    ${(nowScored.won / nowScored.played * 100).toFixed(1)}%`,
  '',
  'What changed:',
  ...changed.map(
    (each) => `  ${each.name.padEnd(18)} ${String(each.was).padStart(6)} -> ${each.now}`,
  ),
  '',
  'As a settings object:',
  JSON.stringify(best.settings, null, 2),
)

writeFileSync(OUT, lines.join('\n'))
console.log(`\nWritten to ${OUT}`)

for (const worker of workers) {
  await worker.terminate()
}
