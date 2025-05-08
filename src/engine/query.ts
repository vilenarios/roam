/* --------------------------------------------------------------------------
 * GraphQL query layer for Surf – fetches random tx-ids by channel
 * -------------------------------------------------------------------------- */
import { GraphQLClient, gql } from 'graphql-request'
import { logger } from '../utils/logger'

/* ---------------------------------------------------------------------- */
/* Types                                                                  */
/* ---------------------------------------------------------------------- */
export type MediaType = 'image' | 'video' | 'html' | 'website'
export type Recency   = 'recent' | 'historic'

export interface Channel {
  media: MediaType
  recency: Recency
}

/* ---------------------------------------------------------------------- */
/* Constants & helpers                                                    */
/* ---------------------------------------------------------------------- */
const GATEWAYS       = import.meta.env.VITE_GATEWAYS?.split(',') ?? []
const TIMEOUT        = Number(import.meta.env.VITE_GQL_TIMEOUT) || 8000

if (GATEWAYS.length === 0) {
  logger.error('No gateways defined – check VITE_GATEWAYS in .env')
  throw new Error('Surf cannot start without GraphQL gateways')
}

/** Map channel.media → valid Content-Type tag list */
const CONTENT_TYPES: Record<MediaType, string[]> = {
  image:   ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  video:   ['video/mp4', 'video/webm'],
  html:    ['text/html'],
  website: ['text/html'], // identical for now – kept separate for clarity
}

/** Recency buckets (seconds) */
const RECENT_WINDOW_SEC = 60 * 60 * 24 * 30 // last 30 days

/* ---------------------------------------------------------------------- */
/* Public API                                                             */
/* ---------------------------------------------------------------------- */

/**
 * Fetch up to `first` tx-ids matching the channel filters.
 * Returns **shuffled** array for easy random pops.
 */
export async function fetchTxIds(
  channel: Channel,
  first = 1000,
): Promise<string[]> {
  const { media, recency } = channel
  const ct     = CONTENT_TYPES[media]
  const nowSec = Math.floor(Date.now() / 1000)
  const from   = recency === 'recent' ? nowSec - RECENT_WINDOW_SEC : 1
  const to     = nowSec

  const query = gql`
    query SurfTx($ct: [String!]!, $from: Int!, $to: Int!, $first: Int!) {
      transactions(
        tags:  [{ name: "Content-Type", values: $ct }]
        block: { min: $from, max: $to }
        first: $first
      ) {
        edges { node { id } }
      }
    }`

  // try gateways in order until one succeeds
  for (const gw of GATEWAYS) {
    try {
      logger.debug(`Querying gateway ${gw}`)
      const client = new GraphQLClient(gw.trim(), {
        timeout: TIMEOUT,
        requestMiddleware: (o) => {
          o.headers = { ...o.headers, 'x-surf-client': 'surf-mvp' }
          return o
        },
      })
      const res: any = await client.request(query, { ct, from, to, first })
      const ids: string[] = res.transactions.edges.map((e: any) => e.node.id)
      logger.info(`Fetched ${ids.length} tx-ids from ${gw}`)
      return shuffle(ids)
    } catch (err) {
      logger.warn(`Gateway ${gw} failed`, err)
    }
  }

  logger.error('All gateways failed – network offline or CORS blocked')
  throw new Error('Unable to retrieve transactions from any gateway')
}

/* ---------------------------------------------------------------------- */
/* Internal util                                                          */
/* ---------------------------------------------------------------------- */
function shuffle<T>(arr: T[]): T[] {
  // Fisher–Yates in-place shuffle
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
