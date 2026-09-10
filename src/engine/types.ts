/**
 * Every type the game is made of. See spec section 4.
 *
 * Everything here is readonly. The engine never changes a value in place, it
 * returns a new one. See spec S3. That is what lets a test hold the state from
 * before and the state from after and compare them.
 */
import type { AttackOutcome } from './attack'
import type { Skill } from './players/types'

export type PlayerId = string
export type TerritoryId = string
export type RegionId = string
export type CardId = string

export interface Point {
  readonly x: number
  readonly y: number
}

// ---------------------------------------------------------------- the map

/** One area on the map. See spec 3.1. */
export interface TerritoryDefinition {
  readonly id: TerritoryId
  /** 'Western Australia' */
  readonly name: string
  /** 'WA', drawn when there is no room for the full name. */
  readonly shortName: string
  readonly regionId: RegionId
  /**
   * The territories you may attack from here.
   *
   * This list is the truth. The drawn shape is only a picture. See spec S4.
   */
  readonly borders: readonly TerritoryId[]
  /** An SVG path, in the coordinate space of the map's viewBox. */
  readonly shape: string
  /** Where the army count is drawn. */
  readonly labelAt: Point
  /**
   * True if you can only reach this place by sea.
   *
   * Only the screen uses it, to send landing craft rather than
   * parachutists. It is written down here rather than worked out from the
   * shape, because the shapes cannot tell an island from a coastal city.
   * See spec S26.
   */
  readonly isIsland?: boolean
  /**
   * The place this one is drawn on top of, if any.
   *
   * A city sits inside the country around it, and the two shapes share
   * ground on purpose. That is the ONE overlap a map is allowed, so it has
   * to be declared. Everything else that overlaps is a fault, and the check
   * in `validate.ts` says so. See spec 3.2.
   */
  readonly drawnOver?: TerritoryId
  /**
   * The place's other islands, as SVG paths, drawn with it and tapped
   * with it. `shape` is its biggest piece, and every rule looks only at
   * that. Japan is Honshu plus these. See spec S52.
   */
  readonly islands?: readonly string[]
}

/** A group of territories worth a bonus if one player owns them all. */
export interface RegionDefinition {
  readonly id: RegionId
  readonly name: string
  /** Extra armies each turn for owning every territory in the region. */
  readonly bonus: number
  /** The colour of the outline drawn around this region's territories. */
  readonly outline: string
}

export interface GameMap {
  readonly id: string
  readonly name: string
  /** The SVG coordinate space every shape and label point is drawn in. */
  readonly viewBox: string
  readonly territories: readonly TerritoryDefinition[]
  readonly regions: readonly RegionDefinition[]
  /**
   * Land that belongs to nobody, as SVG paths. New Zealand is drawn so
   * the world looks like the world, and never tapped. See spec S52.
   */
  readonly scenery?: readonly string[]
}

// -------------------------------------------------------------- the cards

export type CardSymbol = 'infantry' | 'cavalry' | 'artillery' | 'wild'

export interface Card {
  readonly id: CardId
  readonly symbol: CardSymbol
  /** The territory pictured on the card. A wild card pictures none. */
  readonly territoryId: TerritoryId | null
}

export interface DeckState {
  /** Cards nobody has drawn yet, in the order they will be drawn. */
  readonly undrawn: readonly Card[]
  /** Cards already traded in. They return to the deck when it runs out. */
  readonly discarded: readonly Card[]
  /**
   * How many sets every player together has traded so far.
   *
   * The rising value counts across the whole game, not per player. See
   * spec 6.6. That is what makes late turns big and ends the game.
   */
  readonly setsTraded: number
}

// ------------------------------------------------------------ the players

/**
 * Who is playing. A person, or a computer player of a named skill.
 *
 * One field rather than two, so "a computer with no skill" and "a person
 * with a skill" cannot be written down at all.
 */
export type PlayerKind = 'human' | Skill

export interface Player {
  readonly id: PlayerId
  readonly name: string
  /** A CSS colour. This player's territories are filled with it. */
  readonly colour: string
  readonly kind: PlayerKind
  readonly cards: readonly Card[]
  readonly isEliminated: boolean
  /**
   * Armies this player still has to put on the board before play begins.
   *
   * Only ever above zero during the 'setup' phase, when players place their
   * first armies by hand. It is zero for the whole of the rest of the game.
   */
  readonly reserve: number
}

// -------------------------------------------------------------- the board

export interface TerritoryState {
  readonly ownerId: PlayerId | null
  readonly armies: number
}

/** The whole board: who owns what, and how many armies sit there. */
export type Board = Readonly<Record<TerritoryId, TerritoryState>>

// --------------------------------------------------------------- the turn

export type TurnPhase =
  /** Before play begins, players take turns placing their first armies. */
  | 'setup'
  | 'reinforce'
  | 'attack'
  | 'occupy'
  | 'fortify'
  | 'gameOver'

/** A capture waiting for the player to say how many armies move in. */
export interface Occupation {
  readonly fromId: TerritoryId
  readonly toId: TerritoryId
  /** At least this many. It is the number of dice the attacker just rolled. */
  readonly minimumArmies: number
  /** At most this many. One army must stay behind. */
  readonly maximumArmies: number
}

export interface TurnState {
  readonly playerId: PlayerId
  readonly phase: TurnPhase
  /** Armies still to place. The player cannot attack until this is zero. */
  readonly armiesToPlace: number
  /**
   * Every army this turn has handed out: the reinforcements, plus any set
   * traded in. `armiesGiven - armiesToPlace` is how many are already down,
   * which lets a computer player tell a big turn from a small one without
   * remembering anything between moves. Missing from a game saved before
   * it existed, which is why readers fall back to `armiesToPlace`.
   */
  readonly armiesGiven?: number
  /** True if the player took a territory this turn, so earns a card. */
  readonly hasConquered: boolean
  /** True once the one fortify move has been used. */
  readonly hasFortified: boolean
  readonly pendingOccupation: Occupation | null
  /** The last exchange of dice, for the screen to show. */
  readonly lastAttack: AttackOutcome | null
}

// ---------------------------------------------------------------- the log

/**
 * One thing that happened, in plain words. See spec S7.
 *
 * It drives the history on screen, it explains what a computer player did,
 * and it is the fastest way to see what went wrong in a failing test.
 */
export interface LogEntry {
  /** Which round of play. The first round is 1. */
  readonly round: number
  /** Who did it. Null for something the game itself did, such as setup. */
  readonly playerId: PlayerId | null
  readonly text: string
}

// ------------------------------------------------------------ the options

export interface GameOptions {
  readonly cardSetValue: 'fixed' | 'rising'
  readonly fortifyDistance: 'adjacent' | 'connected'
  /**
   * How the first armies reach the board.
   *
   * 'automatic' spreads them, which gets a game started fast.
   * 'byHand' makes players take turns placing one army each, which is how
   * the board game does it and is the first real decision of a game.
   */
  readonly armyPlacement: 'automatic' | 'byHand'
  /** The screen uses this. The engine ignores it. */
  readonly diceDisplay: 'oneByOne' | 'allAtOnce'
}

// -------------------------------------------------------------- the whole

/** One value holds the whole game. Nothing about it lives anywhere else. */
export interface GameState {
  readonly options: GameOptions
  readonly map: GameMap
  readonly players: readonly Player[]
  readonly territories: Readonly<Record<TerritoryId, TerritoryState>>
  readonly turn: TurnState
  readonly round: number
  readonly deck: DeckState
  readonly winnerId: PlayerId | null
  readonly log: readonly LogEntry[]
}
