// --------------------------------------------------------------------------
// Constants, Types & Interfaces
// --------------------------------------------------------------------------
export type MediaType =
  | "images"
  | "videos"
  | "music"
  | "websites"
  | "text"
  | "everything"
  | "arfs";
export type Recency = "new" | "old";
export interface Channel {
  media: MediaType;
  recency: Recency;
  ownerAddress?: string; // optional Arweave address filter
  appName?: string; // optional App-Name filter
}

export const MEDIA_TYPES: MediaType[] = [
  "images",
  "videos",
  "music",
  "websites",
  "text",
  "everything",
  "arfs",
];

/**
 * Internal structure of saved history
 */
export interface HistoryState {
  index: number;
  items: TxMeta[];
}

export interface TxMeta {
  id: string;
  bundledIn?: { id: string };
  owner: { address: string };
  fee: { ar: string };
  quantity: { ar: string };
  tags: { name: string; value: string }[];
  data: { size: number };
  block: { height: number; timestamp: number };
  arfsMeta?: {
    dataTxId: string;
    name: string;
    size: number;
    contentType: string;
    customTags: Record<string, string>;
  };
}

// --------------------------------------------------------------------------
// Content-Type mapping per media
// --------------------------------------------------------------------------
const BASE_CONTENT_TYPES: Record<Exclude<MediaType, "everything">, string[]> = {
  images: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  videos: ["video/mp4", "video/webm"],
  music: ["audio/mpeg", "audio/mp3", "audio/wav"],
  websites: ["application/x.arweave-manifest+json", "text/html"],
  text: ["text/markdown", "application/pdf"],
  arfs: ["application/json"] // this ensures only public arfs files
};

// Build full map including "everything" as the union of all other arrays
export const CONTENT_TYPES: Record<MediaType, string[]> = {
  ...BASE_CONTENT_TYPES,
  everything: Object.values(BASE_CONTENT_TYPES).reduce<string[]>((acc, arr) => {
    arr.forEach((ct) => {
      if (!acc.includes(ct) && ct !== 'application/json') acc.push(ct);
    });
    return acc;
  }, []),
};

export const HISTORY_KEY = "roam-history";
export const ADVERTIZEMENT_TIMER = 5;
export const MIN_AD_CLICKS = 50;
export const MAX_AD_CLICKS = 50;
/** Minimum block for "old" windows */
export const MIN_OLD_BLOCK = 100_000;
export const MAX_RETRY_ATTEMPTS = 8;
/** Base window size (blocks) */
export const WINDOW_SIZE = 10_000;
