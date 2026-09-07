/**
 * Counting things in readable English.
 *
 * "place 1 armies" appeared on screen during a real game. A count of one
 * needs the singular, and there is no reason for each place that shows a
 * number to remember that separately.
 */
export function armies(count: number): string {
  return count === 1 ? '1 army' : `${count} armies`
}

export function territories(count: number): string {
  return count === 1 ? '1 territory' : `${count} territories`
}

export function cards(count: number): string {
  return count === 1 ? '1 card' : `${count} cards`
}
