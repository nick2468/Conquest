/**
 * The one door into the engine. See spec S17.
 *
 * The screen imports from '../engine' and never from '../engine/attack'.
 * So a file inside the engine can move or split without the screen noticing.
 */

export const GAME_NAME = 'Conquest'

export type {
  Card,
  CardId,
  CardSymbol,
  DeckState,
  GameMap,
  GameOptions,
  GameState,
  LogEntry,
  Occupation,
  Player,
  PlayerId,
  PlayerKind,
  Point,
  RegionDefinition,
  RegionId,
  TerritoryDefinition,
  TerritoryId,
  TerritoryState,
  TurnPhase,
  TurnState,
} from './types'

export type { RandomSource } from './random'
export { fixedRandom, scriptedRandom, seededRandom } from './random'

export { DIE_FACES, rollDice, scriptedDice } from './dice'

export type { AttackOutcome } from './attack'
export {
  ARMIES_LEFT_BEHIND,
  MAX_ATTACKER_DICE,
  MAX_DEFENDER_DICE,
  attackerDiceCount,
  defenderDiceCount,
  resolveAttack,
} from './attack'
