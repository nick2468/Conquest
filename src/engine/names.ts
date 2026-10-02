/**
 * Telling players apart when they share a name. Plan task 4.60.
 *
 * Nick: "when there are multiple computer players with the same personality
 * their names are all the same, they need to be numbered to distinguish
 * each one." Two Generals at one table both read "General", in the scores
 * panel, in the history, and in a saved game. There was no way to tell
 * which one took Peru.
 *
 * So a name shared by two or more players gets a number, in turn order. A
 * name nobody else has is left exactly as it is: one General stays
 * "General", and a player called "Nick" is never "Nick 1".
 */

/**
 * The same names, with any shared one numbered in order.
 *
 * ["General", "General", "Turtle"] becomes
 * ["General 1", "General 2", "Turtle"].
 *
 * A number is never given to a name somebody else already holds, so
 * ["General", "General", "General 1"] does not end with two "General 1"s.
 */
export function numberedNames(names: readonly string[]): string[] {
  const howMany = new Map<string, number>()

  for (const name of names) {
    howMany.set(name, (howMany.get(name) ?? 0) + 1)
  }

  // Names held by one player only are theirs, and nothing may take them.
  const taken = new Set(names.filter((name) => howMany.get(name) === 1))
  const nextNumber = new Map<string, number>()

  return names.map((name) => {
    if (howMany.get(name) === 1) {
      return name
    }

    let number = (nextNumber.get(name) ?? 0) + 1

    while (taken.has(`${name} ${number}`)) {
      number += 1
    }

    nextNumber.set(name, number)
    taken.add(`${name} ${number}`)

    return `${name} ${number}`
  })
}
