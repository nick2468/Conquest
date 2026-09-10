/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

/**
 * Settings baked in when the site is built.
 *
 * Declared by name on purpose. Vite only replaces `import.meta.env.NAME`
 * written with a dot, and quietly leaves `import.meta.env['NAME']` alone.
 * That cost an hour: the built site simply did not offer playing together,
 * with nothing to say why. See plan task 6.3.
 */
interface ImportMetaEnv {
  /** Where the server for a shared game is. Empty means there is not one. */
  readonly VITE_CONQUEST_SERVER?: string
}

/** Which build this is, stamped in by vite.config.ts. */
declare const __BUILD__: {
  /** The short commit ID, or "dev". */
  readonly commit: string
  /** When the build ran, as an ISO date. */
  readonly time: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv & {
    readonly DEV: boolean
    readonly PROD: boolean
    readonly MODE: string
    readonly BASE_URL: string
  }
}
