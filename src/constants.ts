// --------------------------------------------------------------------------
// Constants, Types & Interfaces
// --------------------------------------------------------------------------
export type MediaType = 'image' | 'video' | 'music' | 'website' | 'text' | 'anything'
export type Recency   = 'new' | 'old'
export interface Channel {
  media: MediaType
  recency: Recency
  ownerAddress?: string    // optional Arweave address filter
}

/**
 * Internal structure of saved history
 */
export interface HistoryState {
  index: number
  items: TxMeta[]
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

export const HISTORY_KEY = 'roam-history'
export const ADVERTIZEMENT_TIMER = 3
export const MIN_AD_CLICKS = 25
export const MAX_AD_CLICKS = 50