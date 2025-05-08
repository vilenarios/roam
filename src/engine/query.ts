// src/engine/query.ts
import { logger } from '../utils/logger'

// --------------------------------------------------------------------------
// Types & Interfaces
// --------------------------------------------------------------------------
export type MediaType = 'image' | 'video' | 'music' | 'website'
export type Recency   = 'new' | 'recent' | 'old'
export interface Channel { media: MediaType; recency: Recency }

export interface TxMeta {
  id: string
  bundledIn?: { id: string }
  owner: { address: string }
  fee: { ar: string }
  quantity: { ar: string }
  tags: { name: string; value: string }[]
  data: { size: number }
  block: { height: number }
}

// GraphQL response types
interface GqlEdge { node: { id: string } }
interface GqlData { transactions: { edges: GqlEdge[] } }
interface GqlResp { data?: GqlData }

// --------------------------------------------------------------------------
// Content-Type mapping per media
// --------------------------------------------------------------------------
const CONTENT_TYPES: Record<MediaType, string[]> = {
  image:   ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  video:   ['video/mp4', 'video/webm'],
  music:   ['audio/mpeg','audio/mp3','audio/wav'],
  website: ['application/x.arweave-manifest+json','text/html'],
}

// --------------------------------------------------------------------------
// Configuration & Constants
// --------------------------------------------------------------------------
export const GATEWAYS       = import.meta.env.VITE_GATEWAYS?.split(',') ?? []
const TIMEOUT_MS     = Number(import.meta.env.VITE_GQL_TIMEOUT) || 0
const PAGE_SIZE      = 1000
const MIN_RANGE      = 50
const MAX_RANGE      = 1000
export const DEFAULT_HEIGHT = 1666042

if (GATEWAYS.length === 0) {
  logger.error('No GraphQL gateways defined – set VITE_GATEWAYS in .env')
  throw new Error('Missing GraphQL gateways')
}

// --------------------------------------------------------------------------
// Fetch current block height from /info; fallback to a default if it fails
// --------------------------------------------------------------------------
export async function getCurrentBlockHeight(gateway: string): Promise<number> {
  try {
    const res = await fetch(`${gateway}/info`)
    if (!res.ok) throw new Error(`Info fetch failed: ${res.status}`)
    const json = await res.json()
    const height = json.network?.height
    if (typeof height !== 'number') throw new Error('Invalid /info response')
    return height
  } catch (err) {
    logger.warn('Failed to fetch current block height', err)
    return DEFAULT_HEIGHT
  }
}

// --------------------------------------------------------------------------
// Public API: fetchTxIds
// --------------------------------------------------------------------------
/**
 * Fetches a shuffled list of tx-ids matching the channel,
 * filtered by a random block range, with pagination via block filtering.
 */
export async function fetchTxIds(channel: Channel): Promise<string[]> {
  // 1. Determine block window
  const currentHeight = await getCurrentBlockHeight(GATEWAYS[0])
  const range = Math.floor(Math.random() * (MAX_RANGE - MIN_RANGE + 1)) + MIN_RANGE
  let minHeight: number, maxHeight: number

  if (channel.recency === 'recent') {
    maxHeight = currentHeight
    minHeight = Math.max(1, currentHeight - range)
  } else {
    maxHeight = Math.max(1, currentHeight - range)
    minHeight = 1
  }

  // Randomize sort direction for extra variability
  const sortDir = Math.random() > 0.5 ? 'HEIGHT_DESC' : 'HEIGHT_ASC'

  // Prepare content-type filter
  const ct = CONTENT_TYPES[channel.media]

  // Try each gateway in turn
  for (const rawGw of GATEWAYS) {
    const gw = rawGw.trim()
    try {
      logger.debug(`Querying ${gw} blocks ${minHeight}-${maxHeight} sort=${sortDir}`)

      // Build GraphQL payload
      const payload = {
        query: `query FetchTx($ct: [String!]!, $min: Int!, $max: Int!, $first: Int!) {
          transactions(
            block: { min: $min, max: $max }
            tags: [{ name: "Content-Type", values: $ct }]
            sort: ${sortDir}
            first: $first
          ) {
            edges { 
              node { 
                id
                bundledIn {
                  id
                }
                owner {
                  address
                }
                fee {
                  ar
                }
                quantity {
                  ar
                }
                tags {
                  name
                  value
                }
                data {
                  size
                }
                block {
                  height
                }
              }
            }
          }
        }`,
        variables: { ct, min: minHeight, max: maxHeight, first: PAGE_SIZE },
      }

      // Timeout via AbortController
      const controller = new AbortController()
      const timeoutId = TIMEOUT_MS ? setTimeout(() => controller.abort(), TIMEOUT_MS) : undefined

      const response = await fetch(`${gw}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-surf-client': 'surf-mvp' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      if (timeoutId) clearTimeout(timeoutId)

      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
      const json: GqlResp = await response.json()

      const edges = json.data?.transactions.edges ?? []
      const ids = edges.map((e: GqlEdge) => e.node.id)
      const unique = Array.from(new Set(ids))
      logger.info(`Fetched ${unique.length} tx-ids from ${gw}`)

      return shuffle(unique)
    } catch (err) {
      logger.warn(`Gateway ${gw} failed`, err)
    }
  }

  logger.error('All gateways failed – unable to fetch tx-ids')
  throw new Error('Failed to fetch tx-ids')
}

// --------------------------------------------------------------------------
// Public API: fetchTxs
// --------------------------------------------------------------------------
/**
 * Fetches a shuffled list of transaction metadata matching the channel,
 * filtered by a random block range.
 * Ensures no duplicates within a session by full filtering.
 */
export async function fetchTxs(channel: Channel): Promise<TxMeta[]> {
  // 1. Determine block window
  const currentHeight = await getCurrentBlockHeight(GATEWAYS[0])
  const range = Math.floor(Math.random() * (MAX_RANGE - MIN_RANGE + 1)) + MIN_RANGE
  let minHeight: number, maxHeight: number

  if (channel.recency === 'recent') {
    maxHeight = currentHeight
    minHeight = Math.max(1, currentHeight - range)
  } else {
    maxHeight = Math.max(1, currentHeight - range)
    minHeight = 1
  }

  // Randomize sort direction for variability
  const sortDir = Math.random() > 0.5 ? 'HEIGHT_DESC' : 'HEIGHT_ASC'

  // Prepare content-type filter
  const ct = CONTENT_TYPES[channel.media]

  // Attempt each gateway
  for (const rawGw of GATEWAYS) {
    const gw = rawGw.trim()
    try {
      logger.debug(`Querying ${gw} blocks ${minHeight}-${maxHeight} sort=${sortDir}`)

      // Build GraphQL payload requesting full metadata
      const payload = {
        query: `query FetchTxs($ct:[String!]!,$min:Int!,$max:Int!,$first:Int!){
  transactions(
    block:{min:$min,max:$max}
    tags:[{name:\"Content-Type\",values:$ct}]
    sort:${sortDir}
    first:$first
  ){
    edges{node{
      id
      bundledIn{id}
      owner{address}
      fee{ar}
      quantity{ar}
      tags{name value}
      data{size}
      block{height}
    }}
  }
}`,
        variables: { ct, min: minHeight, max: maxHeight, first: PAGE_SIZE },
      }

      // Timeout via AbortController
      const controller = new AbortController()
      const timeoutId = TIMEOUT_MS ? setTimeout(() => controller.abort(), TIMEOUT_MS) : undefined

      const response = await fetch(`${gw}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-surf-client': 'surf-mvp' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      if (timeoutId) clearTimeout(timeoutId)

      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
      const json = await response.json()

      const edges = json.data?.transactions.edges ?? []
      let results: TxMeta[] = edges.map((e: any) => e.node as TxMeta)

      // Deduplicate by id
      const seen = new Set<string>()
      results = results.filter((tx) => {
        if (seen.has(tx.id)) return false
        seen.add(tx.id)
        return true
      })

      // Shuffle results
      const shuffled = shuffle(results)
      logger.info(`Fetched ${shuffled.length} txs from ${gw}`)
      return shuffled
    } catch (err) {
      logger.warn(`Gateway ${gw} failed`, err)
    }
  }

  logger.error('All gateways failed – unable to fetch txs')
  throw new Error('Failed to fetch transactions')
}

// --------------------------------------------------------------------------
// Public API: fetchTxsRange
// --------------------------------------------------------------------------
/**
 * Fetches a shuffled list of transaction metadata for a given media type
 * within a specific block height window [minHeight, maxHeight].
 * Returns full TxMeta objects without duplicates.
 */
export async function fetchTxsRange(
  media: MediaType,
  minHeight: number,
  maxHeight: number
): Promise<TxMeta[]> {
  const ct = CONTENT_TYPES[media]

  for (const rawGw of GATEWAYS) {
    const gw = rawGw.trim()
    try {
      logger.debug(`Fetching range ${minHeight}-${maxHeight} from ${gw}`)

      // Build GraphQL payload
      const payload = {
        query: `query FetchTxsRange($ct:[String!]!,$min:Int!,$max:Int!,$first:Int!){
  transactions(
    block:{min:$min,max:$max}
    tags:[{name:\"Content-Type\",values:$ct}]
    first:$first
  ){
    edges{node{
      id
      bundledIn{id}
      owner{address}
      fee{ar}
      quantity{ar}
      tags{name value}
      data{size}
      block{height}
    }}
  }
}`,
        variables: { ct, min: minHeight, max: maxHeight, first: PAGE_SIZE },
      }

      // AbortController for timeout
      const controller = new AbortController()
      const timeoutId = TIMEOUT_MS
        ? setTimeout(() => controller.abort(), TIMEOUT_MS)
        : undefined

      const response = await fetch(`${gw}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-surf-client': 'surf-mvp',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      if (timeoutId) clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }
      const json = await response.json()
      const edges: any[] = json?.data?.transactions?.edges || []

      // Map and dedupe
      const seen = new Set<string>()
      const results: TxMeta[] = []
      for (const edge of edges) {
        const tx: TxMeta = edge.node
        if (seen.has(tx.id)) continue
        seen.add(tx.id)
        results.push(tx)
      }

      // Shuffle before returning
      logger.info(`Fetched ${results.length} txs from ${gw}`)
      return shuffle(results)
    } catch (err) {
      logger.warn(`Gateway ${gw} failed`, err)
    }
  }

  logger.error('All gateways failed – unable to fetch range')
  throw new Error('Failed to fetch transactions in range')
}

// --------------------------------------------------------------------------
// Helper: in-place Fisher–Yates shuffle
// --------------------------------------------------------------------------
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
