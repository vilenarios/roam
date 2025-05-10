/* --------------------------------------------------------------------------
 * Minimal structured logger
 * -------------------------------------------------------------------------- */
type Level = 'debug' | 'info' | 'warn' | 'error'

/** Prefix logs so all Roam output is grep-able. */
function log(level: Level, msg: string, data?: unknown) {
  const prefix = `[Roam] [${level.toUpperCase()}]`
  if (data) {
    // eslint-disable-next-line no-console
    console[level](`${prefix} ${msg}`, data)
  } else {
    // eslint-disable-next-line no-console
    console[level](`${prefix} ${msg}`)
  }
}

export const logger = {
  debug: (m: string, d?: unknown) => log('debug', m, d),
  info:  (m: string, d?: unknown) => log('info',  m, d),
  warn:  (m: string, d?: unknown) => log('warn',  m, d),
  error: (m: string, d?: unknown) => log('error', m, d),
}
