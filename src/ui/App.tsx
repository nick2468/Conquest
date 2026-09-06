import { GAME_NAME } from '../engine'

/**
 * The placeholder page for phase 0.
 *
 * It exists to prove the tools work together. Phase 2 replaces all of it
 * with the map and the turn controls.
 */
export function App() {
  return (
    <main className="scaffold">
      <h1>{GAME_NAME}</h1>
      <p>A turn-based territory game set in Australia.</p>
      <p className="scaffold-note">
        Phase 0. The scaffold works. There is no game here yet.
      </p>
    </main>
  )
}
