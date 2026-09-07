import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Whether a new version is waiting, and how to take it.
 *
 * `waiting` is true once the service worker has downloaded a new version and
 * is holding it back. Calling `take` activates it and reloads the page.
 *
 * In development there is no service worker at all, by choice: a cached old
 * build while working on the thing wastes hours and teaches nothing. So
 * this stays quiet unless the page is asked to pretend, which is how the
 * bar was checked on screen.
 */
export function useUpdate() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  const [dismissed, setDismissed] = useState(false)

  const pretending =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).has('pretendUpdate')

  return {
    waiting: (needRefresh || pretending) && !dismissed,
    take: (): void => {
      if (pretending) {
        window.location.reload()
        return
      }

      void updateServiceWorker(true)
    },
    later: (): void => setDismissed(true),
  }
}
