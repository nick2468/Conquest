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
  RISING_SET_CAP_CHOICES,
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
  TERRITORY_CARD_BONUS,
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
  territoryForBonus,
} from './cards'

export type { FortifyDistance } from './fortify'
export {
  armiesAvailableToMove,
  canFortify,
  fortifyProblem,
  fortifyTargets,
} from './fortify'

export type { ArmySource, TurnStartArmies } from './reinforce'
export {
  armiesAtTurnStart,
  ownsWholeRegion,
  regionBonusFor,
  reinforcementsFor,
  territoriesOwnedBy,
  whereArmiesCameFrom,
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
  COUNTER_SETTINGS,
  GENERAL,
  GENERAL_DUEL,
  GENERAL_SETTINGS,
  GREEDY_SETTINGS,
  OPTIMUS,
  OPTIMUS_DUEL,
  OPTIMUS_LATE,
  OPTIMUS_SETTINGS,
  PLANNER_SETTINGS,
  boardMaturity,
  generalPlaying,
  howClustered,
  SPREADING,
  TURTLE,
  TURTLE_SETTINGS,
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

export { numberedNames } from './names'

export type { BuildStamp, Ending, SavedGame } from './saved-game'
export {
  SAVED_GAME_FORMAT,
  SAVED_GAME_VERSION,
  SavedGameError,
  endingOf,
  readSavedGame,
  toSavedGame,
} from './saved-game'

export type { Recording } from './replay'
export { replayTo } from './replay'

export type { Standing } from './strength'
export { STRENGTH, standings, strengthOf } from './strength'

export type { FightOdds } from './odds'
export { BIGGEST_FIGHT, howAFightGoes } from './odds'
