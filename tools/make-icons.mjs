/**
 * Draw the app icon and write it out at the sizes iPadOS and the manifest
 * want.
 *
 * Run it with: npm run icons
 *
 * The Australia silhouette is taken from the REAL map file, so the icon can
 * never drift away from the board. Change the map and run this again.
 *
 * The output is committed, because an icon should not need a build step to
 * exist. This script only has to run when the design or the map changes.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const OUT = join(ROOT, 'public')

/** The mainland and the islands, in the order they are drawn. */
async function australiaPaths() {
  const source = await readFile(join(ROOT, 'src/maps/australia.ts'), 'utf8')

  // Each shape is one or more quoted strings joined by +. Matching the FIELD
  // and then its quoted parts avoids picking up 'QLD', which also holds an L.
  const shapes = [...source.matchAll(/shape:\s*((?:'[^']*'\s*\+?\s*)+),/g)].map(
    (match) => [...match[1].matchAll(/'([^']*)'/g)].map((part) => part[1]).join(''),
  )

  if (shapes.length !== 10) {
    throw new Error(`Expected 10 shapes in the map, found ${shapes.length}.`)
  }

  return shapes
}

const INK = '#f6f1e4'
const GROUND = '#1f3348'
const ACCENT = '#c8453b'

function icon(paths, { rounded }) {
  // The map's own coordinate space, from australia.ts.
  const view = { x: 136, y: 100, width: 690, height: 622 }
  const size = 512
  const pad = 62

  // Fit the map into the square, keeping its proportions.
  const scale = Math.min(
    (size - pad * 2) / view.width,
    (size - pad * 2) / view.height,
  )
  const drawnWidth = view.width * scale
  const drawnHeight = view.height * scale
  const left = (size - drawnWidth) / 2 - view.x * scale
  const top = (size - drawnHeight) / 2 - view.y * scale

  const background = rounded
    ? `<rect width="${size}" height="${size}" rx="112" fill="${GROUND}"/>`
    : `<rect width="${size}" height="${size}" fill="${GROUND}"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${background}
  <g transform="translate(${left} ${top}) scale(${scale})">
    ${paths
      .map(
        (shape) =>
          `<path d="${shape}" fill="${INK}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`,
      )
      .join('\n    ')}
  </g>
  <circle cx="${size - 132}" cy="${size - 132}" r="74" fill="${ACCENT}"/>
  <g fill="${INK}">
    <circle cx="${size - 162}" cy="${size - 162}" r="12"/>
    <circle cx="${size - 132}" cy="${size - 132}" r="12"/>
    <circle cx="${size - 102}" cy="${size - 102}" r="12"/>
  </g>
</svg>`
}

async function main() {
  const paths = await australiaPaths()

  await mkdir(OUT, { recursive: true })

  const rounded = Buffer.from(icon(paths, { rounded: true }))
  // iPadOS rounds the corners itself, so its icon is drawn square. A rounded
  // icon would come out with the corners clipped twice.
  const square = Buffer.from(icon(paths, { rounded: false }))

  await writeFile(join(OUT, 'icon.svg'), rounded)

  const wanted = [
    { file: 'icon-192.png', size: 192, art: rounded },
    { file: 'icon-512.png', size: 512, art: rounded },
    { file: 'apple-touch-icon.png', size: 180, art: square },
    { file: 'favicon-32.png', size: 32, art: rounded },
  ]

  for (const { file, size, art } of wanted) {
    await sharp(art).resize(size, size).png().toFile(join(OUT, file))
    console.log(`wrote public/${file} at ${size}x${size}`)
  }
}

await main()
