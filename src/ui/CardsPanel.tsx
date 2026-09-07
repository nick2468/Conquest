import { useState } from 'react'

import type { Card, CardId, GameState } from '../engine'
import { adviseOnHand, describeCard, setReadyToTrade } from './hand'

interface CardsPanelProps {
  readonly state: GameState
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

/** The cards in the current player's hand, and the button to trade three. */
export function CardsPanel({ state, onTrade }: CardsPanelProps) {
  const [chosen, setChosen] = useState<CardId[]>([])

  const player = state.players.find(
    (each) => each.id === state.turn.playerId,
  )

  const cards = player?.cards ?? []

  // A card that is no longer held cannot stay chosen. This happens the
  // moment a set is traded, and again when play passes to the next player.
  const held = chosen.filter((id) => cards.some((card) => card.id === id))
  const advice = adviseOnHand(state, cards, held)

  /**
   * A set the player is holding right now, whether or not they have picked
   * it out. This is what turns the button green. See spec S30.
   */
  const waiting = setReadyToTrade(state)

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

  if (cards.length === 0) {
    return (
      <section className="cards" aria-label="Your cards">
        <h2>Cards</h2>
        <p className="cards-none">
          No cards yet. Take at least one territory in a turn to earn one.
        </p>
      </section>
    )
  }

  return (
    <section
      className={advice.forced ? 'cards cards-forced' : 'cards'}
      aria-label="Your cards"
    >
      <h2>
        Cards <span className="cards-count">{cards.length}</span>
      </h2>

      <ul className="card-list">
        {cards.map((card) => {
          const words = describeCard(state, card)
          const picked = held.includes(card.id)

          return (
            <li key={card.id}>
              <button
                type="button"
                className={picked ? 'card card-picked' : 'card'}
                aria-pressed={picked}
                onClick={() => toggle(card.id)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d={SHAPES[card.symbol]} />
                </svg>
                <span className="card-symbol">{words.symbol}</span>
                <span className="card-place">{words.place}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <p className="cards-advice">
        {waiting !== null && !advice.canTrade && !advice.forced
          ? `You are holding a set. Trade it for ${waiting.value} armies.`
          : advice.message}
      </p>

      <div className="cards-buttons">
        <button
          type="button"
          className={
            advice.canTrade || waiting !== null ? 'primary ready' : 'primary'
          }
          disabled={!advice.canTrade && waiting === null}
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
            : waiting !== null
              ? `Trade a set for ${waiting.value}`
              : 'Trade'}
        </button>
      </div>
    </section>
  )
}
