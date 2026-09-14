import { describe, expect, it } from 'vitest'

// @ts-expect-error - a plain script, with no types of its own.
import { quoted, theOldPlaces, unquoted } from '../../tools/read-map-drawing.mjs'

import { WORLD } from './world'

/**
 * Names that contain a quote. Plan task 5.13.
 *
 * `tools/read-map-drawing.mjs` writes a map out as TypeScript and reads the
 * old one back with patterns. Both halves assumed a name never contains an
 * apostrophe. A place called "Cote d'Ivoire" wrote a file that would not
 * compile, and reading it back matched nothing, so the place was dropped
 * without a word.
 *
 * No place on any map of ours has one, which is why it went unseen. It is
 * tested here so that redrawing a map with one in it cannot quietly lose
 * it.
 *
 * Importing the tool is safe: it only does its work when it is the file
 * being run.
 */

/** The pattern the tool uses to read a name back out of a map file. */
const QUOTED = new RegExp(String.raw`name: '((?:\\.|[^'\\])*)'`)

describe('a name may contain a quote', () => {
  const awkward = [
    "Cote d'Ivoire",
    "King's Land",
    "O'Brien",
    'a back\\slash',
    "both ' and \\ at once",
    "'",
    '\\',
  ]

  it('writes and reads back the same name', () => {
    for (const name of awkward) {
      expect(unquoted(quoted(name))).toBe(name)
    }
  })

  it('writes something a pattern can find again', () => {
    for (const name of awkward) {
      const line = `name: '${quoted(name)}',`
      const found = QUOTED.exec(line)

      expect(found, `could not find ${name} in ${line}`).not.toBeNull()
      expect(unquoted((found as RegExpExecArray)[1] as string)).toBe(name)
    }
  })

  it('writes something JavaScript itself agrees with', () => {
    for (const name of awkward) {
      // What the map file will contain, read back by the language rather
      // than by a pattern. If this throws, the written file will not build.
      expect(JSON.parse(`"${quoted(name).replace(/\\'/g, "'")}"`)).toBe(name)
    }
  })

  it('leaves an ordinary name completely alone', () => {
    for (const name of ['Western Australia', 'Peru', 'East Africa']) {
      expect(quoted(name)).toBe(name)
      expect(unquoted(name)).toBe(name)
    }
  })

  it('still reads the real world map, every place of it', () => {
    // The change above rewrote the patterns that read a map back. This
    // checks they still do, against the map we actually ship.
    const old = theOldPlaces('src/maps/world.ts') as {
      places: Map<string, { name: string; shortName: string; regionId: string; borders: string[] }>
      regions: { id: string; name: string; bonus: number }[]
    }

    expect(old.places.size).toBe(WORLD.territories.length)
    expect(old.regions.length).toBe(WORLD.regions.length)

    for (const territory of WORLD.territories) {
      const found = old.places.get(territory.id)

      expect(found, `${territory.id} was not read back`).toBeDefined()
      expect(found?.name).toBe(territory.name)
      expect(found?.shortName).toBe(territory.shortName)
      expect(found?.regionId).toBe(territory.regionId)
      expect(found?.borders).toEqual([...territory.borders])
    }
  })

  it('would have failed on the old pattern, which is the point', () => {
    // The pattern the tool used before: it stops at the backslash.
    const old = /name: '([^']+)'/
    const line = `name: '${quoted("Cote d'Ivoire")}',`

    expect(old.exec(line)?.[1]).not.toBe("Cote d\\'Ivoire")
    expect(QUOTED.exec(line)?.[1]).toBe("Cote d\\'Ivoire")
  })
})
