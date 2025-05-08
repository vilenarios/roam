// src/engine/fetchQueue.ts
import { fetchTxsRange, GATEWAYS, getCurrentBlockHeight, type Channel, type TxMeta } from './query'
import { logger } from '../utils/logger'

/** How many items left in the queue before triggering a background refill */
const REFILL_THRESHOLD = 20

/** In-memory queue of upcoming transactions for the current channel */
let queue: TxMeta[] = []

/** Prevent concurrent background refills */
let isRefilling = false

/** Track seen IDs to avoid repeats in a session */
const seenIds = new Set<string>()

/** Sliding window state for 'recent' channel */
let recentMax = 0

/**
 * Initialize the fetch queue according to channel type and sliding logic
 */
export async function initFetchQueue(
  channel: Channel
): Promise<void> {
  try {
    logger.info('Initializing fetch queue', { channel })
    let txs: TxMeta[]

    if (channel.recency === 'recent') {
      // Slide window backwards on each refill
      const { min, max } = await slideRecentWindow()
      logger.debug(`Fetching recent window blocks ${min}-${max}`)
      txs = await fetchTxsRange(channel.media, min, max)
    } else if (channel.recency === 'new') {
      // New channel: first window small, then double
      const { min, max } = await nextNewWindow()
      logger.debug(`Fetching new channel window blocks ${min}-${max}`)
      txs = await fetchTxsRange(channel.media, min, max)
    } else {
      // Historic: random non-overlapping window in the past
      const { min, max } = await pickOldWindow()
      logger.debug(`Fetching historic window blocks ${min}-${max}`)
      txs = await fetchTxsRange(channel.media, min, max)
    }

    // Filter out already seen
    const newTxs = txs.filter((tx) => !seenIds.has(tx.id))
    newTxs.forEach((tx) => seenIds.add(tx.id))
    queue = newTxs
    logger.info(`Queue loaded with ${queue.length} new transactions`)
  } catch (err) {
    logger.error('Failed to initialize fetch queue', err)
    throw err
  }
}

/**
 * Get next transaction or wait until queue refills
 */
export async function getNextTx(
  channel: Channel
): Promise<TxMeta> {
  if (queue.length === 0) {
    logger.debug('Queue empty — blocking refill')
    await initFetchQueue(channel)
  }
  if (queue.length < REFILL_THRESHOLD && !isRefilling) {
    isRefilling = true
    logger.debug('Queue low — background refill')
    initFetchQueue(channel)
      .catch((e) => logger.warn('Background refill failed', e))
      .finally(() => { isRefilling = false })
  }
  const tx = queue.shift()
  if (!tx) {
    throw new Error('Unexpected empty queue after refill')
  }
  logger.debug('getNextTx →', tx.id)
  return tx
}

// -------------------------------------------------------------------------
// Sliding window implementations (Now / Recent / Old)
// -------------------------------------------------------------------------
const BLOCK_TIME_SEC = 120 // approx. 2 minutes
const BLOCKS_PER_DAY = Math.floor(24 * 3600 / BLOCK_TIME_SEC)

/**
 * "Now" channel: fixed small window of the last 5 blocks
 */
async function nextNewWindow(): Promise<{ min: number; max: number }> {
  const current = await getCurrentBlockHeight(GATEWAYS[0])
  const max = current
  const min = Math.max(1, current - 4)
  return { min, max }
}

/**
 * "Recent" channel: sliding 24h windows backwards
 */
async function slideRecentWindow(): Promise<{ min: number; max: number }> {
  if (!recentMax) {
    recentMax = await getCurrentBlockHeight(GATEWAYS[0])
  }
  const max = recentMax
  const min = Math.max(1, max - BLOCKS_PER_DAY + 1)
  // advance window backwards
  recentMax = min - 1
  return { min, max }
}

/**
 * "Old" channel: random day-long window before 7 Recent slices
 */
async function pickOldWindow(): Promise<{ min: number; max: number }> {
  const current = await getCurrentBlockHeight(GATEWAYS[0])
  // define cutoff just before the first recent window
  const cutoff = Math.max(1, current - 100)
  // if insufficient history, fall back to entire chain
  if (cutoff <= BLOCKS_PER_DAY) {
    return { min: 1, max: cutoff }
  }
  // choose a random start so that [min, min+BLOCKS_PER_DAY] fits before cutoff
  const min = Math.floor(Math.random() * (cutoff - BLOCKS_PER_DAY)) + 1
  const max = Math.min(cutoff, min + BLOCKS_PER_DAY - 1)
  return { min, max }
}
