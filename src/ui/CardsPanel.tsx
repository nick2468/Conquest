import { useState } from 'react'

import type { Card, CardId, GameState, PlayerId } from '../engine'
import { TERRITORY_CARD_BONUS } from '../engine'
import { adviseOnHand, describeCard, setReadyToTrade } from './hand'

interface CardsPanelProps {
  readonly state: GameState
  /** Whose hand this is. Not always the player whose turn it is. */
  readonly playerId: PlayerId
  /** True only on that player's own turn, when cards can be picked and traded. */
  readonly yourTurn: boolean
  readonly onTrade: (cardIds: readonly CardId[]) => void
}

/**
 * A shape for each symbol, so the cards can be told apart without colour.
 *
 * Three symbols, three shapes. The wild card gets a star, because it is not
 * one of the three and should not look like one.
 */
const SHAPES: Readonly<Record<Card['symbol'], string>> = {
  infantry: 'M 12 3 L 21 20 L 3 20 Z',
  cavalry: 'M 12 3 A 9 9 0 1 1 11.9 3 Z',
  artillery: 'M 4 4 H 20 V 20 H 4 Z',
  wild: 'M 12 2 L 14.6 9.2 L 22 9.6 L 16.2 14.2 L 18.2 21.4 L 12 17.2 L 5.8 21.4 L 7.8 14.2 L 2 9.6 L 9.4 9.2 Z',
}

/**
 * True if trading this card would pay the territory card bonus. Plan 4.57.
 *
 * Nick asked for each card to show "the country it is a benefit for". A card
 * is a benefit only when its player holds that territory, so that is all a
 * card says: a small "+2" when it will pay, and nothing otherwise.
 *
 * It says nothing about who ELSE holds a place. Nick: "Owned by ... is
 * private I think in the classic game." The first version wrote "Held by
 * Turtle" on the card and coloured it in Turtle's colour, and he did not
 * want that on his hand.
 */
function paysHere(state: GameState, card: Card, playerId: PlayerId): boolean {
  return (
    card.territoryId !== null &&
    state.territories[card.territoryId]?.ownerId === playerId &&
    state.options.territoryCardBonus === true &&
    !(state.turn.playerId === playerId && state.turn.territoryBonusTaken === true)
  )
}

/**
 * One player's hand, as a strip of small cards above the map.
 *
 * Nick: "the cards are far too big and I only need to see my cards." The
 * cards are small, and the strip stays put for the whole game rather than
 * appearing only on the player's own turn, which made the map jump up and
 * down every turn and hid the hand for most of the game.
 */
export function CardsPanel({ state, playerId, yourTurn, onTrade }: CardsPanelProps) {
  const [chosen, setChosen] = useState<CardId[]>([])

  const player = state.players.find((each) => each.id === playerId)
  const cards = player?.cards ?? []

  // A card that is no longer held cannot stay chosen. This happens the
  // moment a set is traded, and whenever it stops being this player's turn.
  const held = yourTurn
    ? chosen.filter((id) => cards.some((card) => card.id === id))
    : []
  const advice = adviseOnHand(state, cards, held)

  /**
   * A set the player could trade right now, picked out or not. This is what
   * turns the button green. See spec S30.
   */
  const waiting = yourTurn ? setReadyToTrade(state) : null

  if (held.length !== chosen.length) {
    setChosen(held)
  }

  const toggle = (cardId: CardId): void => {
    setChosen((current) => {
      if (current.includes(cardId)) {
        return current.filter((id) => id !== cardId)
      }

      // Choosing a fourth card lets the oldest one go, so the player never
      // has to work out which one to unpick first.
      return [...current, cardId].slice(-3)
    })
  }

  const forced = yourTurn && advice.forced
  const canPress = yourTurn && (advice.canTrade || waiting !== null)

  // Only worth a line when there is something to act on this turn.
  const saying = !yourTurn
    ? null
    : forced || advice.canTrade || held.length > 0
      ? advice.message
      : waiting !== null
        ? `You hold a set. Trade it for ${waiting.value} armies.`
        : null

  return (
    <section
      className={forced ? 'hand hand-forced' : 'hand'}
      aria-label={`${player?.name ?? 'Your'} cards`}
    >
      <div className="hand-row">
        <span className="hand-title">
          Your cards <span className="hand-count">{cards.length}</span>
        </span>

        {cards.length === 0 ? (
          <span className="hand-none">
            None yet. Take a territory in a turn to earn one.
          </span>
        ) : (
          <ul className="hand-cards">
            {cards.map((card) => {
              const words = describeCard(state, card)
              const picked = held.includes(card.id)
              const pays = paysHere(state, card, playerId)

              return (
                <li key={card.id}>
                  <button
                    type="button"
                    className={[
                      'mini-card',
                      picked ? 'mini-picked' : '',
                      card.symbol === 'wild' ? 'mini-wild' : '',
                    ]
                      .join(' ')
                      .trim()}
                    aria-pressed={picked}
                    aria-label={
                      `${words.symbol}, ${words.place}` +
                      (pays ? `. Pays ${TERRITORY_CARD_BONUS} armies there when traded.` : '')
                    }
                    title={`${words.symbol}: ${words.place}`}
                    disabled={!yourTurn}
                    onClick={() => toggle(card.id)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d={SHAPES[card.symbol]} />
                    </svg>
                    <span className="mini-place">{words.place}</span>
                    {pays ? (
                      <span className="mini-pays">+{TERRITORY_CARD_BONUS}</span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {canPress ? (
          <button
            type="button"
            className="primary ready hand-trade"
            onClick={() => {
              // Respect what the player picked. Only when they have picked
              // nothing does the button reach for the set itself.
              onTrade(
                advice.canTrade
                  ? held
                  : (waiting?.cards ?? []).map((card) => card.id),
              )
              setChosen([])
            }}
          >
            {advice.canTrade
              ? `Trade for ${advice.value}`
              : `Trade a set for ${waiting?.value ?? 0}`}
          </button>
        ) : null}
      </div>

      {saying === null ? null : <p className="hand-advice">{saying}</p>}
    </section>
  )
}
