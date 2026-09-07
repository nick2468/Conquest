import { CAUTIOUS } from './cautious'
import { GREEDY } from './greedy'
import { RECKLESS } from './reckless'
import type { ComputerPlayer, Skill } from './types'

export type { ComputerPlayer, Skill } from './types'
export { ALL_SKILLS } from './types'
export { RECKLESS } from './reckless'
export { CAUTIOUS } from './cautious'
export { GREEDY } from './greedy'

export {
  armiesOn,
  bonusForTaking,
  bordersOf,
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
  greedy: GREEDY,
}

/** The player for a skill. */
export function playerFor(skill: Skill): ComputerPlayer {
  return BY_SKILL[skill]
}
