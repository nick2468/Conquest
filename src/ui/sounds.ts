import type { EffectKind } from './effects'

/**
 * Everything the game can make a noise about.
 *
 * The four effects, plus one that is not a thing on the map at all: a set
 * of cards waiting to be traded. See spec S30.
 */
export type SoundKind = EffectKind | 'alert'

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

/**
 * The parts each context keeps, so a sound can be built into ANY context.
 *
 * That is what makes these testable. The game builds into the live one, and
 * a check can build the same sound into an offline one and measure what
 * comes out. See plan task 7.12.
 */
const hisses = new WeakMap<BaseAudioContext, AudioBuffer>()
const mixers = new WeakMap<BaseAudioContext, AudioNode>()
const echoes = new WeakMap<BaseAudioContext, ConvolverNode>()

/**
 * Where every sound goes.
 *
 * A squeezer sits between the game and the speaker. Two explosions close
 * together add up, and without this they would crackle and clip. It leans
 * on whatever is loudest rather than letting it through.
 */
function output(context: BaseAudioContext): AudioNode {
  const already = mixers.get(context)

  if (already !== undefined) {
    return already
  }

  const squeeze = context.createDynamicsCompressor()
  squeeze.threshold.value = -18
  squeeze.knee.value = 12
  squeeze.ratio.value = 8
  squeeze.attack.value = 0.004
  squeeze.release.value = 0.2
  squeeze.connect(context.destination)

  mixers.set(context, squeeze)
  return squeeze
}

/**
 * The sound of the land around the blast, so it has somewhere to roll away
 * into. This is the difference between a bang and a hit.
 *
 * It is hiss that fades over a second and a half. Sent through a convolver,
 * that is what makes a sound arrive from a place rather than from a
 * speaker. Nothing is loaded: the shape of the space is worked out here.
 */
function distance(context: BaseAudioContext): ConvolverNode {
  const already = echoes.get(context)

  if (already !== undefined) {
    return already
  }

  const seconds = 1.6
  const frames = Math.floor(context.sampleRate * seconds)
  const shape = context.createBuffer(2, frames, context.sampleRate)

  for (let channel = 0; channel < 2; channel += 1) {
    const samples = shape.getChannelData(channel)

    for (let at = 0; at < frames; at += 1) {
      const left = 1 - at / frames

      samples[at] = (Math.random() * 2 - 1) * left ** 2.5
    }
  }

  const room = context.createConvolver()
  room.buffer = shape

  const level = context.createGain()
  level.gain.value = 0.8
  room.connect(level)
  level.connect(output(context))

  echoes.set(context, room)
  return room
}

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

/**
 * One frame of silence, started now. From inside a tap, this is what
 * Safari on iPadOS counts as permission to make sound. See spec S25a.
 */
function permit(context: AudioContext): void {
  const permission = context.createBufferSource()

  permission.buffer = context.createBuffer(1, 1, context.sampleRate)
  permission.connect(context.destination)
  permission.start(0)
}

/**
 * Start the sound on the first tap anywhere. Plan task 4.26.
 *
 * Sound is on from the first game, but a browser lets it through only from
 * inside a tap. Without this, a player who never touched the sound switch
 * would hear nothing, because nothing ever asked from inside a tap.
 */
export function unlockOnFirstTap(): void {
  try {
    document.addEventListener(
      'pointerdown',
      () => {
        const context = engine()

        if (context === null) {
          return
        }

        try {
          permit(context)
          void context.resume()
        } catch {
          // The switch can still start it later.
        }
      },
      { capture: true, once: true },
    )
  } catch {
    // No page to listen to, as in a test.
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
    permit(context)

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
function noise(context: BaseAudioContext): AudioBuffer {
  const already = hisses.get(context)

  if (already !== undefined) {
    return already
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

  hisses.set(context, buffer)
  return buffer
}

/** A burst of hiss, shaped by a filter. Everything rough is built from this. */
function hissBurst(
  context: BaseAudioContext,
  options: {
    readonly filter: BiquadFilterType
    readonly fromHz: number
    readonly toHz: number
    readonly level: number
    readonly lasting: number
    readonly startAt?: number
    /**
     * How long it takes to reach full loudness, in seconds.
     *
     * This is the setting that decides whether a sound is a hit or a blast.
     * Anything under about five thousandths of a second is heard as
     * something striking something else.
     */
    readonly attack?: number
    /**
     * How long the fade to silence would take if it ran to the end, in
     * seconds. Left out, it matches `lasting`.
     *
     * These fades are exponential, so most of the fall happens early. A
     * fade set to the length of the sound is two thirds gone in a third of
     * the time, which is heard as a knock. Setting it LONGER than the
     * sound, and cutting the sound off while it is still fading, is what
     * gives a blast its roll.
     */
    readonly fade?: number
    /** Where it goes. Left out, it goes straight out of the speaker. */
    readonly into?: readonly AudioNode[]
  },
): void {
  const at = context.currentTime + (options.startAt ?? 0)
  const attack = options.attack ?? 0.02
  const fade = options.fade ?? options.lasting

  const source = context.createBufferSource()
  source.buffer = noise(context)
  // Start somewhere different every time, so two bangs are never the same
  // hiss twice.
  const offset = Math.random() * 1.5

  const filter = context.createBiquadFilter()
  filter.type = options.filter
  filter.frequency.setValueAtTime(options.fromHz, at)
  filter.frequency.exponentialRampToValueAtTime(options.toHz, at + options.lasting)

  const volume = context.createGain()
  volume.gain.setValueAtTime(0.0001, at)
  volume.gain.exponentialRampToValueAtTime(options.level, at + attack)
  volume.gain.exponentialRampToValueAtTime(0.0001, at + fade)

  source.connect(filter)
  filter.connect(volume)

  for (const target of options.into ?? [output(context)]) {
    volume.connect(target)
  }

  source.start(at, offset)
  source.stop(at + options.lasting + 0.05)
}

/** One note. Everything with a pitch is built from this. */
function note(
  context: BaseAudioContext,
  options: {
    readonly shape: OscillatorType
    readonly fromHz: number
    readonly toHz: number
    readonly level: number
    readonly lasting: number
    readonly startAt?: number
    readonly attack?: number
    readonly fade?: number
    readonly into?: readonly AudioNode[]
  },
): void {
  const at = context.currentTime + (options.startAt ?? 0)

  const tone = context.createOscillator()
  tone.type = options.shape
  tone.frequency.setValueAtTime(options.fromHz, at)
  tone.frequency.exponentialRampToValueAtTime(options.toHz, at + options.lasting)

  const volume = context.createGain()
  volume.gain.setValueAtTime(0.0001, at)
  volume.gain.exponentialRampToValueAtTime(
    options.level,
    at + (options.attack ?? 0.03),
  )
  volume.gain.exponentialRampToValueAtTime(
    0.0001,
    at + (options.fade ?? options.lasting),
  )

  tone.connect(volume)

  for (const target of options.into ?? [output(context)]) {
    volume.connect(target)
  }

  tone.start(at)
  tone.stop(at + options.lasting + 0.05)
}

/**
 * A blast, not a bang on an anvil.
 *
 * Nick heard the first attempt as "someone using a hammer", and he was
 * right. Four things say HIT to an ear, and it had all four: it started in
 * an instant, it was bright, it stopped quickly, and it had a tuned thump
 * under it. Change those four and the same parts become an explosion.
 *
 * What it is made of, loudest part first:
 *
 * 1. The body. Wide hiss, opened at 1100 Hz and closing to 90 Hz over a
 *    second and a half. It takes 25 thousandths of a second to reach full,
 *    which is slow enough that no part of it is heard as a strike.
 * 2. The push of air underneath, falling from 74 Hz to 26 Hz. Well below a
 *    hammer's thump, and it slides too far to be heard as a note.
 * 3. Debris. Six short rattles of hiss, at times and loudnesses that differ
 *    every time, so no two explosions are the same.
 * 4. The land it happens on. The body is also sent through the echo, which
 *    is what makes the sound roll away rather than stop dead.
 */
function explosion(context: BaseAudioContext): void {
  const far = distance(context)
  const near = output(context)

  hissBurst(context, {
    filter: 'lowpass',
    fromHz: 1100,
    toHz: 90,
    level: LOUDEST,
    lasting: 1.6,
    fade: 2.8,
    attack: 0.025,
    into: [near, far],
  })

  note(context, {
    shape: 'sine',
    fromHz: 74,
    toHz: 26,
    level: LOUDEST * 1.1,
    lasting: 1.4,
    fade: 2.2,
    attack: 0.03,
    into: [near, far],
  })

  // A little edge, so it starts somewhere. Quiet, and gone in a moment, so
  // the body swallows it rather than the ear hearing a click.
  hissBurst(context, {
    filter: 'bandpass',
    fromHz: 1700,
    toHz: 700,
    level: LOUDEST * 0.32,
    lasting: 0.09,
    attack: 0.006,
    into: [near],
  })

  for (let piece = 0; piece < 6; piece += 1) {
    hissBurst(context, {
      filter: 'highpass',
      fromHz: 500 + Math.random() * 900,
      toHz: 260,
      level: LOUDEST * (0.16 - piece * 0.02) * (0.6 + Math.random() * 0.6),
      lasting: 0.1 + Math.random() * 0.2,
      startAt: 0.06 + piece * 0.11 + Math.random() * 0.09,
      attack: 0.012,
      into: [near, far],
    })
  }
}

/**
 * Make the noise that goes with one effect.
 *
 * Does nothing at all if the browser has no sound engine, or if it has one
 * and refuses to use it. That is the point of the wrapping.
 */
export function playSound(kind: SoundKind): void {
  const context = engine()

  if (context === null) {
    return
  }

  try {
    soundInto(context, kind)
  } catch {
    // A sound is never worth breaking a turn over.
  }
}

/**
 * Build one sound into a context, without needing a speaker.
 *
 * The game calls this with the live context. A check calls it with an
 * offline one, renders it, and measures what came out. That is how the
 * explosion was fixed: not by listening, but by measuring the attack, the
 * fall and where the energy sits. See plan task 7.12.
 */
export function soundInto(context: BaseAudioContext, kind: SoundKind): void {
  if (kind === 'alert') {
    // Three rising notes, like a bell. Deliberately unlike anything else
    // the game does, because it is the only sound that is not something
    // happening on the map. It is the game tapping you on the shoulder.
    const rising = [660, 880, 1170]

    rising.forEach((pitch, step) => {
      note(context, {
        shape: 'triangle',
        fromHz: pitch,
        toHz: pitch * 0.995,
        level: LOUDEST * 0.42,
        lasting: 0.5,
        fade: 0.9,
        attack: 0.012,
        startAt: step * 0.11,
      })
    })

    return
  }

  if (kind === 'battle') {
    explosion(context)
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
}

/**
 * Whether the player wants sound, remembered between visits.
 *
 * On unless they have turned it off. Nick: "First game default is to have
 * sounds on." See spec S25. A browser with storage turned off simply
 * forgets, which is why every call is wrapped.
 */
const REMEMBERED_AS = 'conquest.sound'

export function soundWasOn(): boolean {
  try {
    return window.localStorage.getItem(REMEMBERED_AS) !== 'off'
  } catch {
    return true
  }
}

export function rememberSound(on: boolean): void {
  try {
    window.localStorage.setItem(REMEMBERED_AS, on ? 'on' : 'off')
  } catch {
    // Not worth telling anybody about.
  }
}
