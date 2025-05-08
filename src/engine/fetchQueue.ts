/* -------------------------------------------------------------------------
 * Fetch Queue Manager for Surf
 * -------------------------------------------------------------------------
 * Maintains a shuffled in-memory queue of tx-ids for the current channel.
 * Automatically refills when low, with gateway fail-over and logging.
 */
import { fetchTxIds, type Channel } from './query'
import { logger } from '../utils/logger'

/** How many IDs left in queue before triggering a background refill */
const REFILL_THRESHOLD = 20

let queue: string[] = []
let isRefilling = false

/**
 * Initialize the queue by fetching up to `first` tx-ids.
 */
export async function initFetchQueue(
  channel: Channel,
  first = 1000
): Promise<void> {
  try {
    logger.info('Initializing fetch queue', { channel, first })
    queue = await fetchTxIds(channel, first)
    logger.info(`Queue loaded with ${queue.length} tx-ids`)
  } catch (err) {
    logger.error('Failed to initialize fetch queue', err)
    throw err
  }
}

/**
 * Get the next tx-id from the queue.  If the queue is empty, blocks to refill.
 * If below threshold, triggers a background refill.
 */
export async function getNextTxId(
  channel: Channel,
): Promise<string> {
  // refill if empty
  if (queue.length === 0) {
    logger.debug('Queue empty — fetching new batch')
    await initFetchQueue(channel)
  }

  // background refill when low
  if (queue.length < REFILL_THRESHOLD && !isRefilling) {
    isRefilling = true
    logger.debug('Queue low — triggering background refill')
    initFetchQueue(channel)
      .catch(err => logger.warn('Background refill failed', err))
      .finally(() => { isRefilling = false })
  }

  const id = queue.shift()
  if (!id) {
    const msg = 'Unexpected empty queue after refill'
    logger.error(msg)
    throw new Error(msg)
  }

  logger.debug('getNextTxId →', id)
  return id
}