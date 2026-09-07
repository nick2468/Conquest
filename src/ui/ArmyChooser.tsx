import { useEffect, useState } from 'react'

interface ArmyChooserProps {
  readonly title: string
  readonly detail: string
  readonly least: number
  readonly most: number
  readonly confirmLabel: string
  readonly onConfirm: (count: number) => void
  readonly onCancel?: (() => void) | undefined
}

/**
 * Asks how many armies to move.
 *
 * Used twice: after taking a territory, and when fortifying at the end of a
 * turn. Both ask the same question, so both ask it the same way.
 */
export function ArmyChooser({
  title,
  detail,
  least,
  most,
  confirmLabel,
  onConfirm,
  onCancel,
}: ArmyChooserProps) {
  const [count, setCount] = useState(least)

  // A new question starts at its own smallest answer, not at the last one.
  useEffect(() => {
    setCount(least)
  }, [least, most])

  const held = Math.min(most, Math.max(least, count))

  return (
    <section className="chooser" aria-label={title}>
      <h2>{title}</h2>
      <p>{detail}</p>

      <div className="chooser-count" aria-live="polite">
        {held}
      </div>

      {least === most ? null : (
        <input
          type="range"
          min={least}
          max={most}
          value={held}
          aria-label="How many armies"
          onChange={(event) => setCount(Number(event.target.value))}
        />
      )}

      <div className="chooser-buttons">
        {onCancel === undefined ? null : (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="primary"
          onClick={() => onConfirm(held)}
        >
          {confirmLabel}
        </button>
      </div>
    </section>
  )
}
