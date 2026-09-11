import type { GameAction } from '../game'
import type { RandomSource } from '../random'
import type { GameState } from '../types'

/**
 * How well a computer player plays. See plan phase 4.
 *
 * The three are built in steps so the difference between them is easy to
 * see. That is the point of having three, not an accident.
 */
export type Skill = 'reckless' | 'turtle' | 'cautious' | 'greedy' | 'planner' | 'general'

export const ALL_SKILLS: readonly Skill[] = [
  'reckless',
  'turtle',
  'cautious',
  'greedy',
  'planner',
  'general',
]

/**
 * The seam. Plan task 4.1.
 *
 * A computer player is asked for ONE action and returns one. It never
 * changes the game itself, and it may only return something `legalActions`
 * offered. So a computer player cannot cheat, and cannot disagree with the
 * rules, because it never sees them: it only sees the list of what is
 * allowed. See spec S11.
 */
export interface ComputerPlayer {
  readonly skill: Skill
  /** What to call it on screen. */
  readonly name: string
  /** One sentence a player can read, for the new game screen. */
  readonly describe: string
  chooseAction(state: GameState, random: RandomSource): GameAction
}
