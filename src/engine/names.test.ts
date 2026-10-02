import { describe, expect, it } from 'vitest'

import { numberedNames } from './names'

/**
 * Telling players apart. Plan task 4.60.
 */
describe('a name two players share gets a number', () => {
  it('numbers them in turn order', () => {
    expect(numberedNames(['General', 'General', 'Turtle'])).toEqual([
      'General 1',
      'General 2',
      'Turtle',
    ])
  })

  it('numbers three or four of them', () => {
    expect(numberedNames(['Optimus', 'Optimus', 'Optimus', 'Optimus'])).toEqual([
      'Optimus 1',
      'Optimus 2',
      'Optimus 3',
      'Optimus 4',
    ])
  })

  it('numbers two separate pairs on their own counts', () => {
    expect(
      numberedNames(['General', 'Turtle', 'General', 'Turtle']),
    ).toEqual(['General 1', 'Turtle 1', 'General 2', 'Turtle 2'])
  })
})

describe('a name nobody shares is left alone', () => {
  it('leaves every name as it is when all differ', () => {
    const names = ['Nick', 'James', 'Optimus', 'Turtle']

    expect(numberedNames(names)).toEqual(names)
  })

  it('leaves the single General alone beside two Turtles', () => {
    expect(numberedNames(['General', 'Turtle', 'Turtle'])).toEqual([
      'General',
      'Turtle 1',
      'Turtle 2',
    ])
  })
})

describe('a number is never stolen from somebody who already has it', () => {
  it('skips a number a player holds as their own name', () => {
    // "General 1" is already taken, so the two Generals become 2 and 3.
    expect(numberedNames(['General', 'General', 'General 1'])).toEqual([
      'General 2',
      'General 3',
      'General 1',
    ])
  })

  it('never gives two players the same name, whatever it is handed', () => {
    for (const names of [
      ['A', 'A', 'A 1', 'A 2'],
      ['A 1', 'A', 'A', 'A 1 '],
      ['', '', 'x'],
      ['A', 'A'],
    ]) {
      const out = numberedNames(names)

      expect(new Set(out).size, `${names.join(', ')} became ${out.join(', ')}`).toBe(
        out.length,
      )
    }
  })

  it('answers nothing for nobody', () => {
    expect(numberedNames([])).toEqual([])
  })
})
