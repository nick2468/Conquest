import { updateNotice } from './updates'

interface UpdateBannerProps {
  readonly gameInProgress: boolean
  readonly onUpdate: () => void
  readonly onLater: () => void
}

/** The bar that appears when a new version is waiting to be loaded. */
export function UpdateBanner({
  gameInProgress,
  onUpdate,
  onLater,
}: UpdateBannerProps) {
  const notice = updateNotice(gameInProgress)

  return (
    <aside className="update-bar" role="status">
      <div className="update-words">
        <strong>{notice.heading}</strong>
        <span>{notice.detail}</span>
      </div>

      <div className="update-buttons">
        <button type="button" onClick={onLater}>
          Not now
        </button>
        <button type="button" className="primary" onClick={onUpdate}>
          {notice.confirmLabel}
        </button>
      </div>
    </aside>
  )
}
