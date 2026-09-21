import type { SavedGame } from '../engine'

/**
 * Hand a saved game to the player as a file. Plan task 4.58.
 *
 * On an iPad the useful thing is the share sheet: AirDrop it to the
 * computer, mail it, or save it to Files. Browsers that cannot share a file
 * get an ordinary download instead.
 */

/** What happened when the player was offered the file. */
export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed'

/** A file name that says what the game was and when, and sorts by date. */
export function fileNameFor(saved: SavedGame): string {
  const when = saved.savedAt.slice(0, 16).replace(/[:T]/g, '-')
  const who = saved.first.players.map((each) => each.kind).join('-')

  return `conquest-${when}-${who}.json`
}

export async function offerFile(saved: SavedGame): Promise<SaveOutcome> {
  const name = fileNameFor(saved)
  const text = JSON.stringify(saved)

  try {
    const file = new File([text], name, { type: 'application/json' })

    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'A Conquest game' })
        return 'shared'
      } catch (trouble) {
        // Closing the share sheet is not a fault.
        if (trouble instanceof DOMException && trouble.name === 'AbortError') {
          return 'cancelled'
        }
        // Anything else: fall through and download it instead.
      }
    }

    const address = URL.createObjectURL(file)
    const link = document.createElement('a')

    link.href = address
    link.download = name
    document.body.appendChild(link)
    link.click()
    link.remove()
    // Give the browser a moment to start the download before letting go.
    setTimeout(() => URL.revokeObjectURL(address), 10_000)

    return 'downloaded'
  } catch {
    return 'failed'
  }
}
