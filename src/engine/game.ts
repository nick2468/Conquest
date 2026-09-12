/**
 * Playing the game. See spec section 9.
 *
 * One way in, `applyAction`. One way to ask what is allowed, `legalActions`.
 * The screen and the computer players both read the same list, so they can
 * never disagree about the rules. See spec S11.
 */
import { CARDS_AFTER_A_KNOCKOUT, CARDS_FORCING_A_TRADE } from './balance'
import {
  attackerDiceCount,
  defenderDiceCount,
  resolveAttack,
  ARMIES_LEFT_BEHIND,
  MAX_ATTACKER_DICE,
} from './attack'
import { mustTradeASet, setValue, setsInHand } from './cards'
import { rollDice } from './dice'
import { fortifyProblem, fortifyTargets } from './fortify'
import type { RandomSource } from './random'
import { shuffle } from './random'
import { reinforcementsFor } from './reinforce'
import type {
  Board,
  Card,
  DeckState,
  GameState,
  Player,
  PlayerId,
  TerritoryId,
  TerritoryState,
} from './types'

export type GameAction =
  | { readonly type: 'tradeCards'; readonly cardIds: readonly string[] }
  | {
      readonly type: 'placeArmies'
      readonly territoryId: TerritoryId
      readonly count: number
    }
  | {
      readonly type: 'attack'
      readonly fromId: TerritoryId
      readonly toId: TerritoryId
      /**
       * How many dice to roll, 1 to 3. Left out, it rolls as many as the
       * armies allow, which is what almost every attack wants. Plan task
       * 4.35.
       *
       * Rolling fewer is a real tactic, because a capture forces AS MANY
       * armies in as dice were rolled. Nick: "sometimes 2 against 1 might
       * be better in order to preserve the primary mass army." Against a
       * lone defender with a big stack it takes the territory just as
       * surely and leaves about one more army behind. Against two or more
       * defenders it is worse in every way. See spec 6.3.
       */
      readonly dice?: number
    }
  | { readonly type: 'occupy'; readonly count: number }
  | { readonly type: 'endAttackPhase' }
  | {
      readonly type: 'fortify'
      readonly fromId: TerritoryId
      readonly toId: TerritoryId
      readonly count: number
    }
  | { readonly type: 'skipFortify' }

/**
 * Thrown when an action breaks the rules.
 *
 * The screen should never cause one, because it only offers what
 * `legalActions` returned. So a throw means a real bug, and it should be
 * loud. See spec S12.
 */
export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IllegalActionError'
  }
}

function refuse(message: string): never {
  throw new IllegalActionError(message)
}

// ------------------------------------------------------------- small helpers

function currentPlayer(state: GameState): Player {
  const player = state.players.find(
    (each) => each.id === state.turn.playerId,
  )

  if (player === undefined) {
    refuse(`The game has no player "${state.turn.playerId}".`)
  }

  return player
}

function territory(state: GameState, id: TerritoryId): TerritoryState {
  const found = state.territories[id]

  if (found === undefined) {
    refuse(`There is no territory "${id}".`)
  }

  return found
}

function withBoard(
  state: GameState,
  changes: Readonly<Record<TerritoryId, TerritoryState>>,
): Board {
  return { ...state.territories, ...changes }
}

function noted(state: GameState, text: string): GameState {
  return {
    ...state,
    log: [
      ...state.log,
      { round: state.round, playerId: state.turn.playerId, text },
    ],
  }
}

function nameOf(state: GameState, id: TerritoryId): string {
  return (
    state.map.territories.find((each) => each.id === id)?.name ?? id
  )
}

function playerName(state: GameState, id: PlayerId): string {
  return state.players.find((each) => each.id === id)?.name ?? id
}

// ------------------------------------------------------------ the card deck

/**
 * Take the top card. When the deck runs out, the traded cards are shuffled
 * and become the new deck.
 */
function drawCard(
  deck: DeckState,
  random: RandomSource,
): { readonly card: Card | null; readonly deck: DeckState } {
  let undrawn = deck.undrawn
  let discarded = deck.discarded

  if (undrawn.length === 0) {
    if (discarded.length === 0) {
      return { card: null, deck }
    }

    undrawn = shuffle(random, discarded)
    discarded = []
  }

  const [card, ...rest] = undrawn

  return {
    card: card ?? null,
    deck: { ...deck, undrawn: rest, discarded },
  }
}

// ----------------------------------------------------- winning and losing

function ownsEverything(state: GameState, playerId: PlayerId): boolean {
  return Object.values(state.territories).every(
    (each) => each.ownerId === playerId,
  )
}

/**
 * Mark anyone who owns no territories as out, hand their cards to whoever
 * knocked them out, and set a winner if one player owns the lot.
 *
 * The cards are the printed rule, and Nick asked for it: "annihilating an
 * opponent wins his cards." So knocking out a player with a hand full of
 * cards is worth far more than knocking out one with a single card.
 */
function checkWinnersAndLosers(state: GameState): GameState {
  const takerId = state.turn.playerId
  const knockedOut = state.players.filter(
    (player) =>
      !player.isEliminated &&
      !Object.values(state.territories).some((each) => each.ownerId === player.id),
  )
  const won = knockedOut.filter((player) => player.id !== takerId).flatMap((player) => player.cards)

  const players = state.players.map((player) => {
    if (knockedOut.includes(player)) {
      return { ...player, isEliminated: true, cards: player.id === takerId ? player.cards : [] }
    }

    return player.id === takerId ? { ...player, cards: [...player.cards, ...won] } : player
  })

  let next: GameState = {
    ...state,
    players,
    turn:
      knockedOut.length > 0
        ? { ...state.turn, knockedOutThisTurn: true }
        : state.turn,
  }
  const taker = players.find((player) => player.id === takerId)

  for (const player of knockedOut) {
    next = noted(next, `${player.name} is out of the game.`)

    if (player.id !== takerId && player.cards.length > 0 && taker !== undefined) {
      next = noted(
        next,
        `${taker.name} takes ${player.name}'s ${player.cards.length} ` +
          `card${player.cards.length === 1 ? '' : 's'}.`,
      )
    }
  }

  const winner = players.find((player) => ownsEverything(next, player.id))

  if (winner === undefined) {
    return next
  }

  return noted(
    {
      ...next,
      winnerId: winner.id,
      turn: { ...next.turn, phase: 'gameOver' },
    },
    `${winner.name} has won.`,
  )
}

/**
 * After a capture is settled: a knockout that left the player holding
 * CARDS_AFTER_A_KNOCKOUT or more cards must be cashed in now.
 *
 * The game steps back into placing, where holding five or more already
 * forces a trade, so the player trades down to four, places those armies,
 * and is back to attacking the moment the last one is down. The same step
 * the start of every turn uses, so there is nothing new to learn.
 */
function cashInIfForced(state: GameState): GameState {
  if (state.winnerId !== null || state.turn.phase !== 'attack') {
    return state
  }

  const player = currentPlayer(state)

  if (player.cards.length < CARDS_AFTER_A_KNOCKOUT) {
    return state
  }

  return noted(
    { ...state, turn: { ...state.turn, phase: 'reinforce' } },
    `${player.name} holds ${player.cards.length} cards, and must trade ` +
      `down to ${CARDS_FORCING_A_TRADE - 1} before attacking again.`,
  )
}

/**
 * Whether the player whose turn it is may trade a set right now.
 *
 * Always while placing. During an attack, only as the card rule for this
 * game allows. See GameOptions.cardTrading and plan task 4.21.
 */
export function tradingAllowedNow(state: GameState): boolean {
  if (state.turn.phase === 'reinforce') {
    return true
  }

  if (state.turn.phase !== 'attack') {
    return false
  }

  const rule = state.options.cardTrading ?? 'classic'

  return rule === 'anyTime' || (rule === 'afterKnockout' && state.turn.knockedOutThisTurn === true)
}

// --------------------------------------------------------- ending the turn

function endTurn(state: GameState, random: RandomSource): GameState {
  let next = state

  // A player who took at least one territory draws one card, however many
  // territories they took.
  if (state.turn.hasConquered) {
    const drawn = drawCard(state.deck, random)

    if (drawn.card !== null) {
      const card = drawn.card

      next = {
        ...next,
        deck: drawn.deck,
        players: next.players.map((player) =>
          player.id === state.turn.playerId
            ? { ...player, cards: [...player.cards, card] }
            : player,
        ),
      }
      next = noted(next, `${currentPlayer(state).name} draws a card.`)
    }
  }

  const order = next.players
  const startedAt = order.findIndex((each) => each.id === state.turn.playerId)

  let step = 1
  let nextIndex = (startedAt + step) % order.length

  while (order[nextIndex]?.isEliminated === true && step <= order.length) {
    step += 1
    nextIndex = (startedAt + step) % order.length
  }

  const nextPlayer = order[nextIndex] as Player
  // The round moves on whenever play wraps past the end of the player list.
  const round = nextIndex <= startedAt ? next.round + 1 : next.round
  const given = reinforcementsFor(next.map, next.territories, nextPlayer.id)

  return {
    ...next,
    round,
    // The next player's fights from their last turn are old news now.
    recentFights: (next.recentFights ?? []).filter(
      (fight) => fight.attackerId !== nextPlayer.id,
    ),
    turn: {
      playerId: nextPlayer.id,
      phase: 'reinforce',
      armiesToPlace: given,
      armiesGiven: given,
      hasConquered: false,
      hasFortified: false,
      pendingOccupation: null,
      lastAttack: null,
    },
  }
}

// ---------------------------------------------------------- the seven acts

function doTradeCards(state: GameState, cardIds: readonly string[]): GameState {
  if (!tradingAllowedNow(state)) {
    refuse('Cards may not be traded now. See the card rule for this game.')
  }

  if (cardIds.length !== 3) {
    refuse(`A set is three cards, not ${cardIds.length}.`)
  }

  const player = currentPlayer(state)
  const cards = cardIds.map((id) => {
    const card = player.cards.find((each) => each.id === id)

    if (card === undefined) {
      refuse(`${player.name} does not hold the card "${id}".`)
    }

    return card
  })

  if (new Set(cardIds).size !== 3) {
    refuse('A set needs three different cards.')
  }

  const trio = [cards[0], cards[1], cards[2]] as [Card, Card, Card]
  const value = setValue(trio, state.options, state.deck.setsTraded)

  const traded: GameState = {
    ...state,
    players: state.players.map((each) =>
      each.id === player.id
        ? {
            ...each,
            cards: each.cards.filter((card) => !cardIds.includes(card.id)),
          }
        : each,
    ),
    deck: {
      ...state.deck,
      discarded: [...state.deck.discarded, ...trio],
      setsTraded: state.deck.setsTraded + 1,
    },
    turn: {
      ...state.turn,
      // A trade during an attack steps back into placing. Once the last
      // army is down, the attack carries on where it left off.
      phase: 'reinforce',
      armiesToPlace: state.turn.armiesToPlace + value,
      armiesGiven: (state.turn.armiesGiven ?? state.turn.armiesToPlace) + value,
    },
  }

  return noted(traded, `${player.name} trades a set for ${value} armies.`)
}

/**
 * Placing one of your first armies, before play begins.
 *
 * Players take turns placing ONE army each, going round, which is how the
 * board game does it. Alternating matters: it lets each player answer where
 * the others are building up, which is the first real decision of a game.
 */
function doSetupPlacement(
  state: GameState,
  territoryId: TerritoryId,
  count: number,
): GameState {
  const player = currentPlayer(state)

  if (count !== 1) {
    refuse(
      `Before play begins the armies go down one at a time, not ${count}.`,
    )
  }

  if (player.reserve < 1) {
    refuse(`${player.name} has no armies left to place.`)
  }

  const target = territory(state, territoryId)

  if (target.ownerId !== player.id) {
    refuse(`${player.name} does not own ${nameOf(state, territoryId)}.`)
  }

  const players = state.players.map((each) =>
    each.id === player.id ? { ...each, reserve: each.reserve - 1 } : each,
  )

  const placed: GameState = {
    ...state,
    players,
    territories: withBoard(state, {
      [territoryId]: { ...target, armies: target.armies + 1 },
    }),
  }

  const noted1 = noted(
    placed,
    `${player.name} places 1 on ${nameOf(state, territoryId)}.`,
  )

  // Pass to the next player who still has armies in hand.
  const startedAt = players.findIndex((each) => each.id === player.id)

  for (let step = 1; step <= players.length; step += 1) {
    const next = players[(startedAt + step) % players.length] as Player

    if (next.reserve > 0) {
      return {
        ...noted1,
        turn: { ...noted1.turn, playerId: next.id },
      }
    }
  }

  // Nobody has any left, so the game proper begins.
  const first = players[0] as Player
  const given = reinforcementsFor(noted1.map, noted1.territories, first.id)

  return noted(
    {
      ...noted1,
      turn: {
        ...noted1.turn,
        playerId: first.id,
        phase: 'reinforce',
        armiesToPlace: given,
        armiesGiven: given,
      },
    },
    'Every army is on the board. Play begins.',
  )
}

function doPlaceArmies(
  state: GameState,
  territoryId: TerritoryId,
  count: number,
): GameState {
  if (state.turn.phase === 'setup') {
    return doSetupPlacement(state, territoryId, count)
  }

  if (state.turn.phase !== 'reinforce') {
    refuse('Armies may only be placed while reinforcing.')
  }

  const player = currentPlayer(state)

  if (mustTradeASet(player.cards)) {
    refuse(
      `${player.name} holds ${player.cards.length} cards and must trade a ` +
        `set first.`,
    )
  }

  if (!Number.isInteger(count) || count < 1) {
    refuse(`You must place at least one army, not ${count}.`)
  }

  if (count > state.turn.armiesToPlace) {
    refuse(
      `Only ${state.turn.armiesToPlace} armies are left to place, ` +
        `not ${count}.`,
    )
  }

  const target = territory(state, territoryId)

  if (target.ownerId !== player.id) {
    refuse(`${player.name} does not own ${nameOf(state, territoryId)}.`)
  }

  const left = state.turn.armiesToPlace - count

  const placed: GameState = {
    ...state,
    territories: withBoard(state, {
      [territoryId]: { ...target, armies: target.armies + count },
    }),
    turn: {
      ...state.turn,
      armiesToPlace: left,
      // Every army must be placed before anyone attacks. See spec S8.
      phase: left === 0 ? 'attack' : 'reinforce',
    },
  }

  return noted(
    placed,
    `${player.name} places ${count} on ${nameOf(state, territoryId)}.`,
  )
}

function doAttack(
  state: GameState,
  fromId: TerritoryId,
  toId: TerritoryId,
  dice: number | undefined,
  random: RandomSource,
): GameState {
  if (state.turn.phase !== 'attack') {
    refuse('You can only attack during the attack phase.')
  }

  const player = currentPlayer(state)
  const from = territory(state, fromId)
  const to = territory(state, toId)

  if (from.ownerId !== player.id) {
    refuse(`${player.name} does not own ${nameOf(state, fromId)}.`)
  }

  if (to.ownerId === player.id) {
    refuse(`${player.name} already owns ${nameOf(state, toId)}.`)
  }

  if (from.armies < 2) {
    refuse(
      `${nameOf(state, fromId)} has ${from.armies} armies. An attack needs ` +
        `at least 2, because one must stay behind.`,
    )
  }

  const borders =
    state.map.territories.find((each) => each.id === fromId)?.borders ?? []

  if (!borders.includes(toId)) {
    refuse(`${nameOf(state, fromId)} does not border ${nameOf(state, toId)}.`)
  }

  if (dice !== undefined && (!Number.isInteger(dice) || dice < 1 || dice > MAX_ATTACKER_DICE)) {
    refuse(`An attack rolls 1 to ${MAX_ATTACKER_DICE} dice, not ${dice}.`)
  }

  // As many as the armies allow, unless the player asked for fewer.
  const rolling = Math.min(attackerDiceCount(from.armies), dice ?? MAX_ATTACKER_DICE)
  const attackerDice = rollDice(random, rolling)
  const defenderDice = rollDice(random, defenderDiceCount(to.armies))
  const outcome = resolveAttack(attackerDice, defenderDice)

  const attackerLeft = from.armies - outcome.attackerLosses
  const defenderLeft = to.armies - outcome.defenderLosses
  const captured = defenderLeft === 0

  // On capture the smallest legal number of armies moves in AT ONCE, so a
  // territory is never left standing empty. The occupy phase then asks
  // whether to send more. See spec 6.4.
  //
  // The first version left the captured territory on zero until the player
  // chose. That looked tidy until a game was won by the last capture: the
  // winning territory then stayed empty forever, because the game ended
  // before anybody was asked. The whole-game test caught it.
  const mostThatCanMove = attackerLeft - ARMIES_LEFT_BEHIND
  const movedInAtOnce = captured
    ? Math.min(attackerDice.length, mostThatCanMove)
    : 0

  const board = withBoard(state, {
    [fromId]: { ...from, armies: attackerLeft - movedInAtOnce },
    [toId]: captured
      ? { ownerId: player.id, armies: movedInAtOnce }
      : { ...to, armies: defenderLeft },
  })

  // With nothing left to choose, there is nothing to ask.
  const anythingToChoose = captured && movedInAtOnce < mostThatCanMove

  let next: GameState = {
    ...state,
    territories: board,
    recentFights: [
      ...(state.recentFights ?? []),
      { attackerId: player.id, defenderId: to.ownerId, fromId, toId, taken: captured },
    ],
    turn: {
      ...state.turn,
      lastAttack: outcome,
      hasConquered: state.turn.hasConquered || captured,
      phase: anythingToChoose ? 'occupy' : 'attack',
      pendingOccupation: anythingToChoose
        ? {
            fromId,
            toId,
            minimumArmies: movedInAtOnce,
            maximumArmies: mostThatCanMove,
          }
        : null,
    },
  }

  next = noted(
    next,
    `${player.name} attacks ${nameOf(state, toId)} from ` +
      `${nameOf(state, fromId)}. Attacker rolls ` +
      `${outcome.attackerDice.join(', ')}, defender rolls ` +
      `${outcome.defenderDice.join(', ')}. ` +
      `Attacker loses ${outcome.attackerLosses}, defender loses ` +
      `${outcome.defenderLosses}.`,
  )

  if (captured) {
    next = noted(next, `${player.name} takes ${nameOf(state, toId)}.`)
    next = checkWinnersAndLosers(next)
  }

  return cashInIfForced(next)
}

function doOccupy(state: GameState, count: number): GameState {
  const move = state.turn.pendingOccupation

  if (state.turn.phase !== 'occupy' || move === null) {
    refuse('Nothing has just been captured.')
  }

  if (!Number.isInteger(count)) {
    refuse(`${count} is not a whole number of armies.`)
  }

  if (count < move.minimumArmies || count > move.maximumArmies) {
    refuse(
      `You must move between ${move.minimumArmies} and ` +
        `${move.maximumArmies} armies into ${nameOf(state, move.toId)}, ` +
        `not ${count}.`,
    )
  }

  const from = territory(state, move.fromId)
  const to = territory(state, move.toId)

  // `count` is the TOTAL moving in. The minimum already went in when the
  // territory was captured, so only the difference moves now.
  const extra = count - move.minimumArmies

  const occupied: GameState = {
    ...state,
    territories: withBoard(state, {
      [move.fromId]: { ...from, armies: from.armies - extra },
      [move.toId]: { ...to, armies: to.armies + extra },
    }),
    turn: {
      ...state.turn,
      phase: 'attack',
      pendingOccupation: null,
    },
  }

  return cashInIfForced(
    noted(
      occupied,
      `${currentPlayer(state).name} moves ${count} into ` +
        `${nameOf(state, move.toId)}.`,
    ),
  )
}

function doEndAttackPhase(state: GameState): GameState {
  if (state.turn.phase !== 'attack') {
    refuse('The attack phase is not running.')
  }

  return {
    ...state,
    turn: { ...state.turn, phase: 'fortify', lastAttack: null },
  }
}

function doFortify(
  state: GameState,
  fromId: TerritoryId,
  toId: TerritoryId,
  count: number,
  random: RandomSource,
): GameState {
  if (state.turn.phase !== 'fortify') {
    refuse('You can only fortify at the end of your turn.')
  }

  const player = currentPlayer(state)

  if ((state.turn.movedInto ?? []).includes(fromId)) {
    refuse('Armies that arrived this turn stay where they are.')
  }

  const problem = fortifyProblem(
    state.map,
    state.territories,
    player.id,
    fromId,
    toId,
    count,
    state.options.fortifyDistance,
  )

  if (problem !== null) {
    refuse(problem)
  }

  const from = territory(state, fromId)
  const to = territory(state, toId)

  const moved: GameState = {
    ...state,
    territories: withBoard(state, {
      [fromId]: { ...from, armies: from.armies - count },
      [toId]: { ...to, armies: to.armies + count },
    }),
    turn: {
      ...state.turn,
      hasFortified: true,
      movedInto: [...(state.turn.movedInto ?? []), toId],
    },
  }
  const said = noted(
    moved,
    `${player.name} moves ${count} from ${nameOf(state, fromId)} to ` +
      `${nameOf(state, toId)}.`,
  )

  // With many moves allowed, the player ends the turn when they are done.
  return state.options.fortifyMoves === 'many' ? said : endTurn(said, random)
}

function doSkipFortify(state: GameState, random: RandomSource): GameState {
  if (state.turn.phase !== 'fortify') {
    refuse('There is nothing to skip.')
  }

  return endTurn(
    noted(state, `${currentPlayer(state).name} ends their turn.`),
    random,
  )
}

// -------------------------------------------------------------- the way in

export function applyAction(
  state: GameState,
  action: GameAction,
  random: RandomSource,
): GameState {
  if (state.winnerId !== null) {
    refuse(
      `${playerName(state, state.winnerId)} has already won. The game is over.`,
    )
  }

  switch (action.type) {
    case 'tradeCards':
      return doTradeCards(state, action.cardIds)
    case 'placeArmies':
      return doPlaceArmies(state, action.territoryId, action.count)
    case 'attack':
      return doAttack(state, action.fromId, action.toId, action.dice, random)
    case 'occupy':
      return doOccupy(state, action.count)
    case 'endAttackPhase':
      return doEndAttackPhase(state)
    case 'fortify':
      return doFortify(state, action.fromId, action.toId, action.count, random)
    case 'skipFortify':
      return doSkipFortify(state, random)
  }
}

// ------------------------------------------------------ what is allowed now

/**
 * Every move the player whose turn it is may make.
 *
 * Where a move carries a number of armies, the listed action carries the
 * smallest legal number. `applyAction` accepts any number up to the largest
 * legal one, which `armyLimitFor` reports. Listing every possible count
 * would give hundreds of near-identical entries and help nobody.
 */
export function legalActions(state: GameState): GameAction[] {
  if (state.winnerId !== null || state.turn.phase === 'gameOver') {
    return []
  }

  const player = currentPlayer(state)
  const mine = Object.keys(state.territories).filter(
    (id) => state.territories[id]?.ownerId === player.id,
  )

  switch (state.turn.phase) {
    case 'setup':
      // One army at a time, on any territory you already hold.
      return player.reserve < 1
        ? []
        : mine.map<GameAction>((territoryId) => ({
            type: 'placeArmies',
            territoryId,
            count: 1,
          }))

    case 'reinforce': {
      const trades: GameAction[] = setsInHand(player.cards).map((trio) => ({
        type: 'tradeCards',
        cardIds: trio.map((card) => card.id),
      }))

      // Five cards forces a trade before anything else.
      if (mustTradeASet(player.cards)) {
        return trades
      }

      return [
        ...trades,
        ...mine.map<GameAction>((territoryId) => ({
          type: 'placeArmies',
          territoryId,
          count: 1,
        })),
      ]
    }

    case 'attack': {
      const attacks: GameAction[] = []

      for (const fromId of mine) {
        if ((state.territories[fromId]?.armies ?? 0) < 2) {
          continue
        }

        const borders =
          state.map.territories.find((each) => each.id === fromId)?.borders ??
          []

        for (const toId of borders) {
          if (state.territories[toId]?.ownerId !== player.id) {
            attacks.push({ type: 'attack', fromId, toId })
          }
        }
      }

      const trades: GameAction[] = tradingAllowedNow(state)
        ? setsInHand(player.cards).map((trio) => ({
            type: 'tradeCards',
            cardIds: trio.map((card) => card.id),
          }))
        : []

      return [...trades, ...attacks, { type: 'endAttackPhase' }]
    }

    case 'occupy': {
      const move = state.turn.pendingOccupation

      return move === null ? [] : [{ type: 'occupy', count: move.minimumArmies }]
    }

    case 'fortify': {
      const moves: GameAction[] = []
      const arrived = new Set(state.turn.movedInto ?? [])

      for (const fromId of mine) {
        if ((state.territories[fromId]?.armies ?? 0) < 2 || arrived.has(fromId)) {
          continue
        }

        for (const toId of fortifyTargets(
          state.map,
          state.territories,
          player.id,
          fromId,
          state.options.fortifyDistance,
        )) {
          moves.push({ type: 'fortify', fromId, toId, count: 1 })
        }
      }

      return [...moves, { type: 'skipFortify' }]
    }
  }
}

/**
 * The largest number of armies this action may carry.
 *
 * Returns 0 for an action that carries no number.
 */
export function armyLimitFor(state: GameState, action: GameAction): number {
  switch (action.type) {
    case 'placeArmies':
      return state.turn.phase === 'setup' ? 1 : state.turn.armiesToPlace
    case 'occupy':
      return state.turn.pendingOccupation?.maximumArmies ?? 0
    case 'fortify':
      return Math.max(
        0,
        (state.territories[action.fromId]?.armies ?? 0) - ARMIES_LEFT_BEHIND,
      )
    default:
      return 0
  }
}
