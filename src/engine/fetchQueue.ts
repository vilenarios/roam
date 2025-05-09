import { fetchTxsRange, getCurrentBlockHeight, type Channel, type TxMeta } from './query'
import { logger } from '../utils/logger'


export const GATEWAYS_DATA       = import.meta.env.VITE_GATEWAYS_DATA?.split(',') ?? []

/** How many items left in the queue before triggering a background refill */
const REFILL_THRESHOLD = 5
const MIN_OLD_BLOCK = 500_000
const WINDOW_SIZE = 1000

/** In-memory queue of upcoming transactions for the current channel */
let queue: TxMeta[] = []

/** Prevent concurrent background refills */
let isRefilling = false

/** Track seen IDs to avoid repeats in a session */
const seenIds = new Set<string>()

/** Sliding-window "max" per Channel key (media+recency) */
const newMaxMap: Record<string, number> = {}

function channelKey(c: Channel): string {
  return `${c.media}::${c.recency}`
}

/**
 * Slide a 1000-block window backwards for "new" channel
 */
async function slideNewWindow(channel: Channel): Promise<{ min: number; max: number }> {
  const key = channelKey(channel)

  if (!(key in newMaxMap)) {
    newMaxMap[key] = (await getCurrentBlockHeight(GATEWAYS_DATA[0])) - 15 // We go back 15 blocks minimum
  }

  const max = newMaxMap[key]
  const min = Math.max(1, max - WINDOW_SIZE + 1)
  // advance window for next call
  newMaxMap[key] = min - 1

  return { min, max }
}

/**
 * Pick a random 1000-block window for "old" channel
 */
async function pickOldWindow(): Promise<{ min: number; max: number }> {
  const current = await getCurrentBlockHeight(GATEWAYS_DATA[0])
  // highest block that lets a full WINDOW_SIZE fit
  const rawCutoff = current - WINDOW_SIZE
  // if your chain is still “young,” just fallback to 1..current
  if (rawCutoff <= MIN_OLD_BLOCK) {
    return { min: 1, max: current }
  }
  // pick between your floor and the highest valid start
  const startFloor = MIN_OLD_BLOCK
  const startCeil = rawCutoff
  const min = Math.floor(Math.random() * (startCeil - startFloor + 1)) + startFloor
  const max = min + WINDOW_SIZE - 1
  return { min, max }
}

/**
 * Fetch all transactions in a given block window (stub for pagination)
 * TODO: update fetchTxsRange to support pagination and cursor handling
 */
async function fetchWindow(
  media: Channel['media'],
  min: number,
  max: number,
  owner?: string
): Promise<TxMeta[]> {
  return fetchTxsRange(media, min, max, owner)
}

/**
 * Retry loading until at least one tx is returned
 */
async function loadTxsForWindow(
  loader: () => Promise<TxMeta[]>
): Promise<TxMeta[]> {
  let txs: TxMeta[]
  do {
    txs = await loader()
    if (txs.length === 0) {
      logger.debug('Window returned no transactions, retrying')
    }
  } while (txs.length === 0)
  return txs
}

/**
 * Initialize the fetch queue according to channel type
 */
export async function initFetchQueue(
  channel: Channel
): Promise<void> {
  try {
    queue = []
    logger.info('Initializing fetch queue', { channel })
    let txs: TxMeta[]

    if (channel.recency === 'new') {
      txs = await loadTxsForWindow(async () => {
        const { min, max } = await slideNewWindow(channel)
        logger.debug(`New window blocks ${min}-${max}`)
        return fetchWindow(channel.media, min, max, channel.ownerAddress)
      })
    } else {
      txs = await loadTxsForWindow(async () => {
        const { min, max } = await pickOldWindow()
        logger.debug(`Old window blocks ${min}-${max}`)
        return fetchWindow(channel.media, min, max, channel.ownerAddress)
      })
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
 * Get next transaction or trigger background refill
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
      .finally(() => {
        isRefilling = false
      })
  }

  const tx = queue.shift()
  if (!tx) {
    throw new Error('Unexpected empty queue after refill')
  }
  logger.debug('getNextTx →', tx.id)
  return tx
}
