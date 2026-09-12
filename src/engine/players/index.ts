import { CAUTIOUS } from './cautious'
import { GENERAL } from './general'
import { GREEDY } from './greedy'
import { PLANNER } from './planner'
import { RECKLESS } from './reckless'
import { TURTLE } from './turtle'
import { COUNTER } from './counter'
import { OPTIMUS } from './optimus'
import type { ComputerPlayer, Skill } from './types'

export type { ComputerPlayer, Skill } from './types'
export { ALL_SKILLS } from './types'
export { RECKLESS } from './reckless'
export { CAUTIOUS } from './cautious'
export { GREEDY } from './greedy'
export { PLANNER } from './planner'
export { GENERAL } from './general'
export { TURTLE } from './turtle'
export { COUNTER } from './counter'

// Every number a player plays by, so a tuner can change them and measure
// what happens. See tools/tune.mjs and plan task 4.42.
export { GENERAL_SETTINGS, GENERAL_DUEL } from './general'
export { GREEDY_SETTINGS } from './greedy'
export { PLANNER_SETTINGS } from './planner'
export { TURTLE_SETTINGS } from './turtle'
export { COUNTER_SETTINGS } from './counter'
export { OPTIMUS, OPTIMUS_SETTINGS, OPTIMUS_DUEL, OPTIMUS_LATE } from './optimus'
export { boardMaturity, howClustered } from './board'
export { SPREADING } from './board'

export {
  armiesOn,
  bonusForTaking,
  bordersOf,
  entrancesTo,
  frontierOf,
  interiorOf,
  isFrontier,
  ownedBy,
  pressureOn,
  regionHoldings,
} from './board'
export type { RegionHolding } from './board'

const BY_SKILL: Readonly<Record<Skill, ComputerPlayer>> = {
  reckless: RECKLESS,
  cautious: CAUTIOUS,
  turtle: TURTLE,
  counter: COUNTER,
  greedy: GREEDY,
  planner: PLANNER,
  general: GENERAL,
  optimus: OPTIMUS,
}

/** The player for a skill. */
export function playerFor(skill: Skill): ComputerPlayer {
  return BY_SKILL[skill]
}
