/* -------------------------------------------------------------------------
 * History Store for Surf
 * -------------------------------------------------------------------------
 * Persists visited tx-id list and pointer in IndexedDB via idb-keyval.
 * Supports add / back / forward navigation.
 */
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { logger } from '../utils/logger'

const HISTORY_KEY = 'surf-history'

interface HistoryData {
  past:   string[]
  pointer: number
}

let loaded = false
let data: HistoryData = { past: [], pointer: -1 }

/** Load persisted history (only once) */
async function loadHistory(): Promise<void> {
  if (loaded) return
  loaded = true
  try {
    const stored = await idbGet<HistoryData>(HISTORY_KEY)
    if (
      stored &&
      Array.isArray(stored.past) &&
      typeof stored.pointer === 'number'
    ) {
      data = stored
      logger.info('History loaded', data)
    }
  } catch (err) {
    logger.warn('Failed to load history', err)
  }
}

/** Persist current history data */
async function saveHistory(): Promise<void> {
  try {
    await idbSet(HISTORY_KEY, data)
    logger.debug('History saved', data)
  } catch (err) {
    logger.warn('Failed to save history', err)
  }
}

/**
 * Add a new tx-id to history, discarding any "future" entries.
 */
export async function addHistory(id: string): Promise<void> {
  await loadHistory()
  // drop any forward history
  data.past = data.past.slice(0, data.pointer + 1)
  data.past.push(id)
  data.pointer = data.past.length - 1
  logger.info('Added to history', { id, pointer: data.pointer })
  await saveHistory()
}

/** Move back in history; returns new current id or null if at start */
export async function goBack(): Promise<string | null> {
  await loadHistory()
  if (data.pointer > 0) {
    data.pointer--
    logger.info('Moved back in history', { pointer: data.pointer })
    await saveHistory()
    return data.past[data.pointer]
  }
  logger.debug('goBack: at beginning of history')
  return null
}

/** Move forward in history; returns new current id or null if at end */
export async function goForward(): Promise<string | null> {
  await loadHistory()
  if (data.pointer < data.past.length - 1) {
    data.pointer++
    logger.info('Moved forward in history', { pointer: data.pointer })
    await saveHistory()
    return data.past[data.pointer]
  }
  logger.debug('goForward: at end of history')
  return null
}

/** Get the current tx-id without modifying pointer */
export async function getCurrent(): Promise<string | null> {
  await loadHistory()
  if (data.pointer >= 0 && data.pointer < data.past.length) {
    return data.past[data.pointer]
  }
  return null
}
