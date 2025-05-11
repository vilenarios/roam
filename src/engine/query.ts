import { logger } from '../utils/logger'

// --------------------------------------------------------------------------
// Types & Interfaces
// --------------------------------------------------------------------------
export type MediaType = 'image' | 'video' | 'music' | 'website' | 'text' | 'anything'
export type Recency   = 'new' | 'old'
export interface Channel {
  media: MediaType
  recency: Recency
  ownerAddress?: string    // optional Arweave address filter
}

export interface TxMeta {
  id: string
  bundledIn?: { id: string }
  owner: { address: string }
  fee: { ar: string }
  quantity: { ar: string }
  tags: { name: string; value: string }[]
  data: { size: number }
  block: { height: number, timestamp: number }
}

// --------------------------------------------------------------------------
// Content-Type mapping per media
// --------------------------------------------------------------------------
const BASE_CONTENT_TYPES: Record<Exclude<MediaType, 'anything'>, string[]> = {
  image:   ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  video:   ['video/mp4', 'video/webm'],
  music:   ['audio/mpeg','audio/mp3','audio/wav'],
  website: ['application/x.arweave-manifest+json','text/html'],
  text:    ['text/markdown','application/pdf'],
}
  
// Build full map including "anything" as the union of all other arrays
export const CONTENT_TYPES: Record<MediaType, string[]> = {
  ...BASE_CONTENT_TYPES,
  anything: Object
    .values(BASE_CONTENT_TYPES)
    .reduce<string[]>((acc, arr) => {
      arr.forEach((ct) => {
        if (!acc.includes(ct)) acc.push(ct)
      })
      return acc
    }, []),
}

// --------------------------------------------------------------------------
// Configuration & Constants
// --------------------------------------------------------------------------
export const GATEWAYS_GRAPHQL       = import.meta.env.VITE_GATEWAYS_GRAPHQL?.split(',') ?? []
const PAGE_SIZE      = 1000
export const DEFAULT_HEIGHT = 1666042

if (GATEWAYS_GRAPHQL.length === 0) {
  logger.error('No GraphQL gateways defined – set VITE_GATEWAYS_GRAPHQL in .env')
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
    const height = json.height
    if (typeof height !== 'number') throw new Error('Invalid /info response')
    return height
  } catch (err) {
    logger.warn('Failed to fetch current block height', err)
    return DEFAULT_HEIGHT
  }
}

// --------------------------------------------------------------------------
// Public API: fetchTxsRange with pagination
// --------------------------------------------------------------------------
/**
 * Fetches all TxMeta for `media` between [minHeight, maxHeight], optionally filtering by owner.
 * Paginates through all pages using cursors until completion.
 */

async function fetchWithRetry(
  gw: string,
  payload: any,
  attempts = 4,
  delay = 500
): Promise<any> {
  try {
    const res = await fetch(`${gw}/graphql`, payload)
    const json = await res.json()
    if (json.errors?.length) {
      throw new Error(json.errors.map((e: any) => e.message).join('; '))
    }
    return json.data
  } catch (err) {
    if (attempts > 1) {
      await new Promise((r) => setTimeout(r, delay))
      return fetchWithRetry(gw, payload, attempts - 1, delay * 2)
    }
    throw err
  }
}

export async function fetchTxsRange(
  media: MediaType,
  minHeight: number,
  maxHeight: number,
  owner?: string
): Promise<TxMeta[]> {
  const ct = CONTENT_TYPES[media]
  const ownersArg = owner ? `owners: ["${owner}"],` : ''

  const query = `
    query FetchTxsRange(
      $ct: [String!]!,
      $min: Int!,
      $max: Int!,
      $first: Int!,
      $after: String
    ) {
      transactions(
        ${ownersArg}
        block: { min: $min, max: $max }
        tags: [{ name: "Content-Type", values: $ct }]
        sort: HEIGHT_DESC
        first: $first
        after: $after
      ) {
        edges {
          cursor
          node {
            id
            bundledIn { id }
            owner { address }
            fee { ar }
            quantity { ar }
            tags { name value }
            data { size }
            block { height timestamp }
          }
        }
        pageInfo {
          hasNextPage
        }
      }
  }`

  for (const rawGw of GATEWAYS_GRAPHQL) {
    const gw = rawGw.trim()
    try {
      let allTxs: TxMeta[] = []
      let after: string | null = null
      let hasNext = true

      while (hasNext) {
        const variables = { ct, min: minHeight, max: maxHeight, first: PAGE_SIZE, after }
        const payload = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-roam-client': 'roam-mvp' },
          body: JSON.stringify({ query, variables })
        }
        const data = await fetchWithRetry(gw, payload)
        const edges = data.transactions.edges
        for (const edge of edges) {
          const tx: TxMeta = edge.node
          if (!allTxs.find((t) => t.id === tx.id)) allTxs.push(tx)
        }
        hasNext = data.transactions.pageInfo.hasNextPage
        after   = data.transactions.cursor
      }

      // shuffle allTxs...
      return allTxs
    } catch (err) {
      logger.warn(`Gateway ${gw} failed after retries:`, err)
    }
  }

  throw new Error('All gateways failed – unable to fetchTxsRange')
}