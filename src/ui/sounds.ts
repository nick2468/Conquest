import type { EffectKind } from './effects'

/**
 * The noises the game makes. Plan task 7.8.
 *
 * Every sound is built here out of an oscillator and hiss. There are no
 * audio files. That keeps the app small, keeps it working with no internet,
 * and means there is nothing to host. See spec S25.
 *
 * Nothing here is allowed to matter. Every call is wrapped, so a browser
 * that refuses to make a sound changes nothing about the game.
 *
 * This is the one part of phase 7 with no test. It is browser machinery and
 * a test would only prove that the fake it was given was called. It was
 * checked by listening.
 */

/** How loud the game is at most. Quiet on purpose: it plays over and over. */
const LOUDEST = 0.18

interface Maker {
  new (): AudioContext
}

let shared: AudioContext | null = null
let hiss: AudioBuffer | null = null

/**
 * The browser's sound engine, or null if there is not one.
 *
 * A browser refuses to make a sound until the person has touched the page.
 * `resume` lifts that, and it only counts from inside a tap.
 */
function engine(): AudioContext | null {
  try {
    if (shared === null) {
      const window_ = window as unknown as {
        AudioContext?: Maker
        webkitAudioContext?: Maker
      }
      const make = window_.AudioContext ?? window_.webkitAudioContext

      if (make === undefined) {
        return null
      }

      shared = new make()
      watchForTaps(shared)
    }

    if (shared.state === 'suspended') {
      void shared.resume()
    }

    return shared
  } catch {
    return null
  }
}

/**
 * Try again on every tap, for as long as the browser is holding sound back.
 *
 * An iPad puts the sound engine to sleep when the app goes to the back, and
 * waking it only counts from inside a tap. Without this, coming back to a
 * game left open in another tab leaves the game silent for good.
 */
function watchForTaps(context: AudioContext): void {
  try {
    document.addEventListener(
      'pointerdown',
      () => {
        if (context.state !== 'running') {
          void context.resume()
        }
      },
      { capture: true },
    )
  } catch {
    // Nothing to do about it.
  }
}

/** What happened when the player asked for sound. */
export type SoundStart = 'running' | 'blocked' | 'none'

/**
 * Switch the sound on, from inside the tap that asked for it.
 *
 * The empty buffer below is the part that matters, and it is why sound
 * worked in a browser on the computer but not on the iPad. Safari on
 * iPadOS does not count `resume` on its own as permission. It wants a
 * sound actually STARTED while the finger is down. One frame of silence
 * is a sound, so this is it.
 *
 * It then plays two notes, so the player finds out at once whether they
 * can hear anything. If they cannot, the iPad is set to silent, and no
 * website can do anything about that.
 */
export async function startSound(): Promise<SoundStart> {
  const context = engine()

  if (context === null) {
    return 'none'
  }

  try {
    const permission = context.createBufferSource()
    permission.buffer = context.createBuffer(1, 1, context.sampleRate)
    permission.connect(context.destination)
    permission.start(0)

    await context.resume()
  } catch {
    // Fall through to whatever state the engine ended up in.
  }

  if (context.state !== 'running') {
    return 'blocked'
  }

  // Two rising notes: "sound is on".
  note(context, {
    shape: 'triangle',
    fromHz: 520,
    toHz: 516,
    level: LOUDEST * 0.5,
    lasting: 0.12,
  })
  note(context, {
    shape: 'triangle',
    fromHz: 780,
    toHz: 774,
    level: LOUDEST * 0.5,
    lasting: 0.18,
    startAt: 0.13,
  })

  return 'running'
}

/** Two seconds of hiss, made once and used by every sound that needs it. */
function noise(context: AudioContext): AudioBuffer {
  if (hiss !== null) {
    return hiss
  }

  const frames = context.sampleRate * 2
  const buffer = context.createBuffer(1, frames, context.sampleRate)
  const samples = buffer.getChannelData(0)

  for (let at = 0; at < frames; at += 1) {
    // Math.random is fine here. This is a noise, not a dice roll. The rule
    // against it guards the ENGINE, so that a game can be replayed from its
    // seed. See spec S10.
    samples[at] = Math.random() * 2 - 1
  }

  hiss = buffer
  return buffer
}

/** A burst of hiss, shaped by a filter. Everything rough is built from this. */
function hissBurst(
  context: AudioContext,
  options: {
    readonly filter: BiquadFilterType
    readonly fromHz: number
    readonly toHz: number
    readonly level: number
    readonly lasting: number
    readonly startAt?: number
  },
): void {
  const at = context.currentTime + (options.startAt ?? 0)

  const source = context.createBufferSource()
  source.buffer = noise(context)

  const filter = context.createBiquadFilter()
  filter.type = options.filter
  filter.frequency.setValueAtTime(options.fromHz, at)
  filter.frequency.exponentialRampToValueAtTime(options.toHz, at + options.lasting)

  const volume = context.createGain()
  volume.gain.setValueAtTime(0.0001, at)
  volume.gain.exponentialRampToValueAtTime(options.level, at + 0.02)
  volume.gain.exponentialRampToValueAtTime(0.0001, at + options.lasting)

  source.connect(filter)
  filter.connect(volume)
  volume.connect(context.destination)

  source.start(at)
  source.stop(at + options.lasting + 0.05)
}

/** One note. Everything with a pitch is built from this. */
function note(
  context: AudioContext,
  options: {
    readonly shape: OscillatorType
    readonly fromHz: number
    readonly toHz: number
    readonly level: number
    readonly lasting: number
    readonly startAt?: number
  },
): void {
  const at = context.currentTime + (options.startAt ?? 0)

  const tone = context.createOscillator()
  tone.type = options.shape
  tone.frequency.setValueAtTime(options.fromHz, at)
  tone.frequency.exponentialRampToValueAtTime(options.toHz, at + options.lasting)

  const volume = context.createGain()
  volume.gain.setValueAtTime(0.0001, at)
  volume.gain.exponentialRampToValueAtTime(options.level, at + 0.03)
  volume.gain.exponentialRampToValueAtTime(0.0001, at + options.lasting)

  tone.connect(volume)
  volume.connect(context.destination)

  tone.start(at)
  tone.stop(at + options.lasting + 0.05)
}

/**
 * Make the noise that goes with one effect.
 *
 * Does nothing at all if the browser has no sound engine, or if it has one
 * and refuses to use it. That is the point of the wrapping.
 */
export function playSound(kind: EffectKind): void {
  const context = engine()

  if (context === null) {
    return
  }

  try {
    if (kind === 'battle') {
      // A crack, then the low roll of it, then a second smaller one.
      hissBurst(context, {
        filter: 'lowpass',
        fromHz: 3400,
        toHz: 180,
        level: LOUDEST,
        lasting: 0.55,
      })
      note(context, {
        shape: 'sine',
        fromHz: 110,
        toHz: 34,
        level: LOUDEST * 0.9,
        lasting: 0.5,
      })
      hissBurst(context, {
        filter: 'lowpass',
        fromHz: 2200,
        toHz: 160,
        level: LOUDEST * 0.55,
        lasting: 0.4,
        startAt: 0.22,
      })
      return
    }

    if (kind === 'parachute') {
      // Air over a canopy: hiss with the middle taken out, twice.
      hissBurst(context, {
        filter: 'bandpass',
        fromHz: 900,
        toHz: 400,
        level: LOUDEST * 0.7,
        lasting: 0.45,
      })
      hissBurst(context, {
        filter: 'bandpass',
        fromHz: 700,
        toHz: 320,
        level: LOUDEST * 0.5,
        lasting: 0.4,
        startAt: 0.18,
      })
      return
    }

    if (kind === 'landing') {
      // A slow engine underneath, water against the hull on top.
      note(context, {
        shape: 'sawtooth',
        fromHz: 62,
        toHz: 48,
        level: LOUDEST * 0.6,
        lasting: 0.6,
      })
      hissBurst(context, {
        filter: 'lowpass',
        fromHz: 1400,
        toHz: 500,
        level: LOUDEST * 0.45,
        lasting: 0.55,
      })
      return
    }

    // A convoy: two short horn notes over an engine.
    note(context, {
      shape: 'square',
      fromHz: 300,
      toHz: 290,
      level: LOUDEST * 0.35,
      lasting: 0.12,
    })
    note(context, {
      shape: 'square',
      fromHz: 240,
      toHz: 232,
      level: LOUDEST * 0.35,
      lasting: 0.16,
      startAt: 0.16,
    })
    note(context, {
      shape: 'sawtooth',
      fromHz: 84,
      toHz: 70,
      level: LOUDEST * 0.4,
      lasting: 0.5,
    })
  } catch {
    // A sound is never worth breaking a turn over.
  }
}

/**
 * Whether the player wants sound, remembered between visits.
 *
 * Off unless they have said otherwise. See spec S25. A browser with storage
 * turned off simply forgets, which is why every call is wrapped.
 */
const REMEMBERED_AS = 'conquest.sound'

export function soundWasOn(): boolean {
  try {
    return window.localStorage.getItem(REMEMBERED_AS) === 'on'
  } catch {
    return false
  }
}

export function rememberSound(on: boolean): void {
  try {
    window.localStorage.setItem(REMEMBERED_AS, on ? 'on' : 'off')
  } catch {
    // Not worth telling anybody about.
  }
}
