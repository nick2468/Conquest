/**
 * The one door into the engine. See spec S17.
 *
 * The screen imports from '../engine' and never from '../engine/attack'.
 * So a file inside the engine can move or split without the screen noticing.
 */

export const GAME_NAME = 'Conquest'

export type {
  Board,
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

export type { RandomSource, SavedRandom } from './random'
export { fixedRandom, scriptedRandom, seededRandom, shuffle } from './random'

export {
  CARDS_AFTER_A_KNOCKOUT,
  RISING_SET_CAP,
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

export type { CardTrio } from './cards'
export {
  createDeck,
  isSet,
  mustTradeASet,
  risingValueOf,
  setValue,
  setsInHand,
} from './cards'

export type { FortifyDistance } from './fortify'
export {
  armiesAvailableToMove,
  canFortify,
  fortifyProblem,
  fortifyTargets,
} from './fortify'

export {
  ownsWholeRegion,
  regionBonusFor,
  reinforcementsFor,
  territoriesOwnedBy,
} from './reinforce'

export type { GameAction } from './game'
export {
  IllegalActionError,
  applyAction,
  armyLimitFor,
  legalActions,
  tradingAllowedNow,
} from './game'

export type { ComputerPlayer, Skill } from './players'
export {
  ALL_SKILLS,
  CAUTIOUS,
  GENERAL,
  GREEDY,
  PLANNER,
  RECKLESS,
  bonusForTaking,
  entrancesTo,
  frontierOf,
  interiorOf,
  ownedBy,
  playerFor,
  pressureOn,
  regionHoldings,
} from './players'

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
