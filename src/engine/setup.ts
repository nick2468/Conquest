/**
 * Setting a game up. See spec section 10.
 *
 * Phase 1 sets the board up automatically. Nobody places their first armies
 * by hand. See spec S13. Manual placement is a whole interactive phase and it
 * stands between us and a game we can play, so it waits for phase 2.
 */
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLOURS,
  RISING_SET_CAP,
  STARTING_ARMIES,
} from './balance'
import { createDeck } from './cards'
import type { RandomSource } from './random'
import { shuffle } from './random'
import { numberedNames } from './names'
import { armiesAtTurnStart } from './reinforce'
import type {
  GameMap,
  GameOptions,
  GameState,
  Player,
  PlayerKind,
  TerritoryId,
  TerritoryState,
} from './types'

/** What the new game screen collects about one player. */
export interface NewPlayer {
  readonly name: string
  readonly kind: PlayerKind
  /** Leave this out to take the next colour from the standard list. */
  readonly colour?: string
}

export const DEFAULT_OPTIONS: GameOptions = {
  cardSetValue: 'rising',
  risingSetCap: RISING_SET_CAP,
  fortifyDistance: 'connected',
  fortifyMoves: 'one',
  armyPlacement: 'automatic',
  diceDisplay: 'allAtOnce',
  cardTrading: 'classic',
  territoryCardBonus: true,
}

export interface NewGame {
  readonly map: GameMap
  readonly players: readonly NewPlayer[]
  readonly random: RandomSource
  readonly options?: GameOptions
}

function checkPlayers(map: GameMap, players: readonly NewPlayer[]): void {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(
      `A game needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players, ` +
        `but ${players.length} were given.`,
    )
  }

  if (players.length > map.territories.length) {
    throw new Error(
      `The map "${map.id}" has ${map.territories.length} territories, ` +
        `which is not enough for ${players.length} players.`,
    )
  }
}

/**
 * Deal the territories out, one at a time, going round the players.
 *
 * Dealing one at a time is what keeps the counts even. With 10 territories
 * and 3 players, somebody gets 4 and the others get 3.
 */
function dealTerritories(
  map: GameMap,
  players: readonly Player[],
  random: RandomSource,
): Record<TerritoryId, TerritoryState> {
  const board: Record<TerritoryId, TerritoryState> = {}
  const dealOrder = shuffle(
    random,
    map.territories.map((territory) => territory.id),
  )

  dealOrder.forEach((territoryId, position) => {
    const owner = players[position % players.length] as Player

    board[territoryId] = { ownerId: owner.id, armies: 1 }
  })

  return board
}

/**
 * Spread each player's armies left over after the one on each territory.
 *
 * The armies go round the player's own territories in turn, so nobody ends up
 * with one huge stack and a row of empty-looking borders.
 */
function spreadRemainingArmies(
  board: Record<TerritoryId, TerritoryState>,
  players: readonly Player[],
  armiesEach: number,
  random: RandomSource,
): void {
  for (const player of players) {
    const owned = shuffle(
      random,
      Object.keys(board).filter(
        (territoryId) => board[territoryId]?.ownerId === player.id,
      ),
    )

    // One army already sits on each territory the player was dealt.
    const toPlace = armiesEach - owned.length

    for (let placed = 0; placed < toPlace; placed += 1) {
      const territoryId = owned[placed % owned.length] as TerritoryId
      const territory = board[territoryId] as TerritoryState

      board[territoryId] = { ...territory, armies: territory.armies + 1 }
    }
  }
}

/**
 * Build a game ready for its first turn.
 *
 * The same map, the same players and the same seed always give the same
 * board. That is what makes a game replayable and a bug reproducible.
 */
export function createGame(game: NewGame): GameState {
  const { map, players: newPlayers, random } = game
  const options = game.options ?? DEFAULT_OPTIONS

  checkPlayers(map, newPlayers)

  // Two players called "General" cannot be told apart in the scores, the
  // history, or a saved game. Numbering them here covers every way a game
  // is started: one iPad, several iPads, and the tools. Plan task 4.60.
  const names = numberedNames(newPlayers.map((each) => each.name))

  const players: Player[] = newPlayers.map((newPlayer, position) => ({
    id: `p${position + 1}`,
    name: names[position] as string,
    colour:
      newPlayer.colour ??
      (PLAYER_COLOURS[position % PLAYER_COLOURS.length] as string),
    kind: newPlayer.kind,
    cards: [],
    isEliminated: false,
    reserve: 0,
  }))

  const armiesEach = STARTING_ARMIES[players.length]

  if (armiesEach === undefined) {
    throw new Error(`No starting army count for ${players.length} players.`)
  }

  const board = dealTerritories(map, players, random)
  const byHand = options.armyPlacement === 'byHand'

  if (!byHand) {
    spreadRemainingArmies(board, players, armiesEach, random)
  }

  // Every player was dealt one army on each territory. Whatever is left is
  // what they still have to place by hand.
  const withReserves: Player[] = players.map((player) => ({
    ...player,
    reserve: byHand
      ? armiesEach -
        Object.values(board).filter((each) => each.ownerId === player.id)
          .length
      : 0,
  }))

  const firstPlayer = withReserves[0] as Player
  const first = byHand ? null : armiesAtTurnStart(map, board, firstPlayer.id)
  const firstArmies = first?.given ?? 0

  return {
    options,
    map,
    players: withReserves,
    territories: board,
    round: 1,
    turn: {
      playerId: firstPlayer.id,
      phase: byHand ? 'setup' : 'reinforce',
      armiesToPlace: firstArmies,
      armiesGiven: firstArmies,
      ...(first === null
        ? {}
        : {
            armiesForLand: first.forLand,
            territoriesHeld: first.territoriesHeld,
            regionsHeld: first.regionsHeld,
          }),
      hasConquered: false,
      hasFortified: false,
      pendingOccupation: null,
      lastAttack: null,
    },
    deck: createDeck(map, random),
    winnerId: null,
    log: [
      {
        round: 1,
        playerId: null,
        text:
          `A new game on ${map.name} with ${players.length} players, ` +
          `${armiesEach} armies each.` +
          (byHand ? ' Players place their first armies by hand.' : ''),
      },
    ],
  }
}
