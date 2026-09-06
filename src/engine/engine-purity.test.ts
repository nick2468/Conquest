import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The guard for spec S2 and S3.
 *
 * The engine must stay pure. No browser, no clock, no hidden randomness, no
 * screen. Writing that down is not enough. A rule nobody checks is a rule
 * that breaks. So this test reads the engine source and fails if the rule
 * is broken.
 *
 * Test files are skipped. A test may use anything it likes.
 */

const PURE_DIRS = [
  join(process.cwd(), 'src', 'engine'),
  join(process.cwd(), 'src', 'maps'),
]

interface BannedThing {
  readonly name: string
  readonly pattern: RegExp
  readonly instead: string
}

const BANNED: readonly BannedThing[] = [
  {
    name: 'Math.random',
    pattern: /\bMath\s*\.\s*random\b/,
    instead: 'take a RandomSource as an argument (spec S10)',
  },
  {
    name: 'the clock',
    pattern: /\bDate\s*\.\s*now\b|\bnew\s+Date\b/,
    instead: 'pass any time value in as an argument (spec S2)',
  },
  {
    name: 'the browser',
    pattern: /\bwindow\b|\bdocument\b|\blocalStorage\b|\bnavigator\b/,
    instead: 'keep browser work in src/ui (spec S2)',
  },
  {
    name: 'the screen',
    pattern: /from\s+['"][^'"]*\/ui\//,
    instead: 'the engine must not know the screen exists (spec S2)',
  },
  {
    name: 'React',
    pattern: /from\s+['"]react/,
    instead: 'the engine must run with no browser at all (spec S2)',
  },
]

/**
 * Remove comments before checking a file.
 *
 * Without this the guard fails on a comment that merely NAMES a banned thing,
 * such as "the engine never calls Math.random". The rule is about the code,
 * not about what the code says about itself.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function engineSourceFiles(directory: string): string[] {
  const found: string[] = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      found.push(...engineSourceFiles(path))
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      found.push(path)
    }
  }

  return found
}

describe('the engine and the maps stay pure', () => {
  const files = PURE_DIRS.flatMap(engineSourceFiles)

  it('finds engine files to check', () => {
    // If this fails, the guard is looking in the wrong place and every other
    // check below is passing for the wrong reason. See "ratchets fail open".
    expect(files.length).toBeGreaterThan(0)
  })

  for (const banned of BANNED) {
    it(`does not use ${banned.name}`, () => {
      const offenders = files
        .filter((file) =>
          banned.pattern.test(withoutComments(readFileSync(file, 'utf8'))),
        )
        .map((file) => relative(process.cwd(), file))

      expect(
        offenders,
        `${offenders.join(', ')} uses ${banned.name}. ` +
          `Instead, ${banned.instead}.`,
      ).toEqual([])
    })
  }
})

describe('the screen uses the one door into the engine', () => {
  // Spec S17. The screen imports from '../engine', never from
  // '../engine/attack'. So a file inside the engine can move without the
  // screen noticing.
  const UI_DIR = join(process.cwd(), 'src', 'ui')

  function uiSourceFiles(directory: string): string[] {
    const found: string[] = []

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)

      if (entry.isDirectory()) {
        found.push(...uiSourceFiles(path))
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        found.push(path)
      }
    }

    return found
  }

  it('never reaches inside the engine folder', () => {
    const reachesInside = /from\s+['"][^'"]*engine\/[^'"]+['"]/

    const offenders = uiSourceFiles(UI_DIR)
      .filter((file) =>
        reachesInside.test(withoutComments(readFileSync(file, 'utf8'))),
      )
      .map((file) => relative(process.cwd(), file))

    expect(
      offenders,
      `${offenders.join(', ')} imports a file inside the engine. ` +
        `Import from the engine folder itself instead (spec S17).`,
    ).toEqual([])
  })
})

describe('the purity guard actually blocks', () => {
  // A guard that cannot fail is not a guard. This proves each pattern
  // catches the thing it is meant to catch.
  const samples: ReadonlyArray<readonly [string, string]> = [
    ['Math.random', 'const roll = Math.random()'],
    ['the clock', 'const now = Date.now()'],
    ['the browser', 'window.alert("hello")'],
    ['the screen', "import { App } from '../ui/App'"],
    ['React', "import { useState } from 'react'"],
  ]

  for (const [name, sample] of samples) {
    it(`catches ${name}`, () => {
      const rule = BANNED.find((banned) => banned.name === name)

      expect(rule).toBeDefined()
      expect(rule?.pattern.test(sample)).toBe(true)
    })
  }
})
