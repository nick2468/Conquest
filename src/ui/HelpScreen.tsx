import type { GameMap, GameOptions, Skill } from '../engine'
import {
  ALL_SKILLS,
  CARDS_FORCING_A_TRADE,
  FIXED_SET_VALUE,
  MINIMUM_REINFORCEMENTS,
  RISING_SET_CAP,
  RISING_SET_VALUES,
  TERRITORIES_PER_ARMY,
  WILD_CARDS,
  playerFor,
} from '../engine'

/**
 * How to play. Plan task 4.19.
 *
 * Nick: "A help page would be good so a new player could read the rules,
 * how to play and also get an idea what the different computer player
 * strategies are."
 *
 * Every number on this page comes from `balance.ts` or from the map, never
 * typed in here, so the page cannot drift away from the rules it explains.
 * Change a number there and this page changes with it.
 */

interface HelpScreenProps {
  /** The map chosen on the new game screen, for its continents. */
  readonly map: GameMap
  /** The rules chosen on the new game screen. */
  readonly options: GameOptions
  readonly onBack: () => void
}

/**
 * More than a computer player's one line, for a new player choosing whom
 * to play against. Easiest first, which is the order they are listed in.
 */
const HOW_THEY_PLAY: Readonly<Record<Skill, string>> = {
  reckless:
    'Moves at random. It attacks anything and defends nothing. The one to learn on.',
  cautious:
    'Only attacks when it has more armies than the defender, and keeps its armies on its borders. Hard to break into, slow to win.',
  greedy:
    'Makes sure it takes at least one territory every turn to earn a card, and finishes off a continent when it can. Presses hard.',
  planner:
    'Picks one continent to own, the one that pays well and is easy to hold, takes it, then guards the ways in.',
  general:
    'The strongest. Holds a front line with a second line behind it, takes its card first each turn, and breaks up your continents when nobody else will. When only one opponent is left, it changes to an attacking game.',
}

export function HelpScreen({ map, options, onBack }: HelpScreenProps) {
  const risingList = [...RISING_SET_VALUES.filter((value) => value < RISING_SET_CAP), RISING_SET_CAP]

  return (
    <main className="setup-page">
      <div className="setup-card help-card">
        <div className="help-top">
          <h1>How to play</h1>
          <button type="button" className="primary" onClick={onBack}>
            Back
          </button>
        </div>

        <section>
          <h2>The aim</h2>
          <p>
            Own every territory on the map. A player who loses their last
            territory is out.
          </p>
        </section>

        <section>
          <h2>A turn, in order</h2>
          <ol className="help-steps">
            <li>
              <strong>Reinforce.</strong> You get one army for every{' '}
              {TERRITORIES_PER_ARMY} territories you own, and never fewer than{' '}
              {MINIMUM_REINFORCEMENTS}. You also get the bonus of every
              continent you own completely. Put every army on your own
              territories before you attack.
            </li>
            <li>
              <strong>Attack,</strong> as often as you like, or not at all.
              Attack from one of your territories that holds at least two
              armies, into a neighbour that somebody else owns.
            </li>
            <li>
              <strong>Move in.</strong> When you take a territory, some of
              your armies move in at once. You may send more. One army must
              always stay behind.
            </li>
            <li>
              <strong>Fortify.</strong> At the end of your turn you may make
              one move, from one of your territories to another.{' '}
              {options.fortifyDistance === 'connected'
                ? 'This game allows any distance, as long as every territory on the way is yours.'
                : 'This game allows one step only, to a territory next door.'}
            </li>
          </ol>
        </section>

        <section>
          <h2>How a fight works</h2>
          <p>
            The attacker rolls up to three dice, one fewer than the armies
            attacking. The defender rolls up to two. The highest dice are
            compared, then the second highest. For each pair, the lower die
            loses one army. <strong>A tie goes to the defender.</strong>
          </p>
          <p>
            So attacking with only a few more armies than the defender is
            roughly an even chance, not a sure thing.
          </p>
        </section>

        <section>
          <h2>Cards</h2>
          <p>
            Take at least one territory in a turn and you get a card at the
            end of it. Only one a turn, however many you took. A card shows
            infantry, cavalry or artillery, and there are {WILD_CARDS} wild
            cards that count as any of them.
          </p>
          <p>
            Three of the same, or one of each, is a set. Trade a set in when
            you reinforce, for extra armies. With {CARDS_FORCING_A_TRADE}{' '}
            cards in your hand you must trade.
          </p>
          <p>
            {options.cardSetValue === 'rising'
              ? `In this game each set is worth more than the last: ${risingList.join(', ')}, and then ${RISING_SET_CAP} for every set after that.`
              : `In this game a set is always worth the same: infantry ${FIXED_SET_VALUE.infantry}, cavalry ${FIXED_SET_VALUE.cavalry}, artillery ${FIXED_SET_VALUE.artillery}, one of each ${FIXED_SET_VALUE.mixed}.`}
          </p>
        </section>

        <section>
          <h2>The continents of {map.name}</h2>
          <p>
            Own every territory of a continent at the start of your turn and
            you get its bonus. A continent with few ways in is easier to
            hold.
          </p>
          <table className="help-table">
            <thead>
              <tr>
                <th>Continent</th>
                <th>Territories</th>
                <th>Bonus</th>
              </tr>
            </thead>
            <tbody>
              {map.regions.map((region) => (
                <tr key={region.id}>
                  <td>{region.name}</td>
                  <td>
                    {map.territories.filter((each) => each.regionId === region.id).length}
                  </td>
                  <td>{region.bonus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Playing on the iPad</h2>
          <ul className="help-steps">
            <li>
              The panel beside the board always says what to do next, and
              the places you can tap are highlighted.
            </li>
            <li>
              To attack, tap one of your territories, then tap the enemy
              territory next to it.
            </li>
            <li>
              A dashed line across the sea is a crossing. The two places it
              joins are neighbours, just as if they shared a border, for
              attacking and for moving armies.
            </li>
            <li>
              Tap a territory to look at it closely. Tap the sea, or the
              whole map button, to see the whole map again.
            </li>
          </ul>
        </section>

        <section>
          <h2>The computer players, easiest first</h2>
          <ul className="help-steps">
            {ALL_SKILLS.map((skill) => (
              <li key={skill}>
                <strong>{playerFor(skill).name}.</strong> {HOW_THEY_PLAY[skill]}
              </li>
            ))}
          </ul>
        </section>

        <div className="setup-buttons">
          <button type="button" className="primary" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </main>
  )
}
