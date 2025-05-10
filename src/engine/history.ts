// src/engine/history.ts
import { set, get } from 'idb-keyval'
import { logger } from '../utils/logger'
import type { TxMeta } from './query'

const HISTORY_KEY = 'roam-history'

/**
 * Internal structure of saved history
 */
interface HistoryState {
  index: number
  items: TxMeta[]
}

/**
 * Default empty history
 */
const defaultState: HistoryState = { index: -1, items: [] }

/**
 * Load history state from IndexedDB, fallback to defaultState.
 */
async function loadHistory(): Promise<HistoryState> {
  const stored = await get<HistoryState>(HISTORY_KEY)
  if (
    !stored ||
    !Array.isArray(stored.items)
  ) {
    return { ...defaultState }
  }
  // Clamp index to valid range
  const idx = Math.min(Math.max(stored.index, -1), stored.items.length - 1)
  return { index: idx, items: [...stored.items] }
}

/**
 * Persist history state to IndexedDB
 */
async function saveHistory(state: HistoryState): Promise<void> {
  await set(HISTORY_KEY, state)
}

/**
 * Add a new transaction to history, trimming any forward states.
 */
export async function addHistory(tx: TxMeta): Promise<void> {
  const state = await loadHistory()
  // Remove any forward history beyond current index
  const items = state.items.slice(0, state.index + 1)
  items.push(tx)
  const newIndex = items.length - 1
  const newState: HistoryState = { index: newIndex, items }
  await saveHistory(newState)
  logger.debug('History added', { index: newIndex, id: tx.id })
}

/**
 * Move back one step in history, return the previous TxMeta or undefined.
 */
export async function goBack(): Promise<TxMeta | undefined> {
  const state = await loadHistory()
  if (state.index <= 0) {
    logger.debug('goBack: at beginning of history')
    return undefined
  }
  const newIndex = state.index - 1
  const tx = state.items[newIndex]
  await saveHistory({ ...state, index: newIndex })
  logger.debug('History goBack', { newIndex, id: tx.id })
  return tx
}

/**
 * Move forward one step in history, return the next TxMeta or undefined.
 */
export async function goForward(): Promise<TxMeta | undefined> {
  const state = await loadHistory()
  if (state.index >= state.items.length - 1) {
    logger.debug('goForward: at end of history')
    return undefined
  }
  const newIndex = state.index + 1
  const tx = state.items[newIndex]
  await saveHistory({ ...state, index: newIndex })
  logger.debug('History goForward', { newIndex, id: tx.id })
  return tx
}
