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
/** How long to wait for the new version to take over before reloading anyway. */
const RELOAD_ANYWAY_AFTER = 4000

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

      // Nick: "pressing 'load it' doesn't reload the browser, I still have
      // to do that in the browser control." The new version was taking
      // over, but the page never reloaded to show it. So the page reloads
      // itself the moment the new version takes control, and after a few
      // seconds regardless, in case that moment is never announced.
      navigator.serviceWorker?.addEventListener(
        'controllerchange',
        () => window.location.reload(),
        { once: true },
      )
      window.setTimeout(() => window.location.reload(), RELOAD_ANYWAY_AFTER)
      void updateServiceWorker(true)
    },
    later: (): void => setDismissed(true),
  }
}
