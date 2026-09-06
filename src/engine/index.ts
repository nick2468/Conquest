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
export { fixedRandom, scriptedRandom, seededRandom, shuffle } from './random'

export {
  CARDS_FORCING_A_TRADE,
  FIXED_SET_VALUE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MINIMUM_REINFORCEMENTS,
  PLAYER_COLOURS,
  RISING_SET_INCREMENT,
  RISING_SET_VALUES,
  STARTING_ARMIES,
  TERRITORIES_PER_ARMY,
  WILD_CARDS,
} from './balance'

export { createDeck } from './cards'

export type { Board } from './reinforce'
export {
  ownsWholeRegion,
  regionBonusFor,
  reinforcementsFor,
  territoriesOwnedBy,
} from './reinforce'

export type { NewGame, NewPlayer } from './setup'
export { DEFAULT_OPTIONS, createGame } from './setup'

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
