import {
  fetchTxsRange,
  getCurrentBlockHeight,
} from "./query";
import { logger } from "../utils/logger";
import type { TxMeta, Channel } from "../constants";

// Read and trim configured gateways
const rawGateways = import.meta.env.VITE_GATEWAYS_DATA_SOURCE
  ?.split(",")
  .map((s: string) => s.trim())
  .filter(Boolean) ?? [];

// Determine primary and fallback gateways
const fallbackGateway = rawGateways[1] || rawGateways[0] || "https://arweave.net";

// Build GATEWAY_DATA_SOURCE array with 'self' mapping logic
export const GATEWAY_DATA_SOURCE: string[] = rawGateways
  .map((gw: string) => {
    if (gw !== "self") {
      return gw;
    }

    // “self” → derive from window.location
    const { protocol, hostname, port } = window.location;
    // e.g. hostname = "roam_vilenarios.ardrive.net"
    // split into [ "roam_vilenarios", "ardrive", "net" ]
    const parts = hostname.toLowerCase().split(".");

    // if localhost or pure .ar.io, fall back
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".ar.io")
    ) {
      return fallbackGateway;
    }

    // drop exactly the first segment if there are >2 parts
    let gatewayHost: string;
    if (parts.length > 2) {
      // ["ardrive","net"]  or ["ar","permagate","io"]
      gatewayHost = parts.slice(1).join(".");
    } else {
      // e.g. ["ardrive","net"]
      gatewayHost = hostname;
    }

    // re-build the origin, preserving port if present
    const portSuffix = port ? `:${port}` : "";
    return `${protocol}//${gatewayHost}${portSuffix}`;
  })
  .filter(Boolean);

// Ensure we have at least one gateway
if (GATEWAY_DATA_SOURCE.length === 0) {
  GATEWAY_DATA_SOURCE.push("https://arweave.net");
}

/** How many items left in the queue before triggering a background refill */
const REFILL_THRESHOLD = 5;
/** Maximum attempts to find a non-empty window */
const MAX_WINDOW_ATTEMPTS = 3;
/** Minimum block for "old" windows */
const MIN_OLD_BLOCK = 500_000;
/** Base window size (blocks) */
const WINDOW_SIZE = 1000;

/** In-memory queue of upcoming transactions for the current channel */
let queue: TxMeta[] = [];

/** Prevent concurrent background refills */
let isRefilling = false;

/** Track seen IDs to avoid repeats in a session */
const seenIds = new Set<string>();

/** Sliding-window "max" per Channel key (media+recency) */
const newMaxMap: Record<string, number> = {};

function channelKey(c: Channel): string {
  return `${c.media}::${c.recency}`;
}

/**
 * Slide a WINDOW_SIZE-block window backwards for "new" channel
 */
async function slideNewWindow(
  channel: Channel
): Promise<{ min: number; max: number }> {
  const key = channelKey(channel);
  if (!(key in newMaxMap)) {
    // Seed a bit behind the tip
    const height = await getCurrentBlockHeight(GATEWAY_DATA_SOURCE[0]);
    newMaxMap[key] = Math.max(1, height - 15);
  }
  const max = newMaxMap[key];
  const min = Math.max(1, max - WINDOW_SIZE + 1);
  newMaxMap[key] = min - 1;
  return { min, max };
}

/**
 * Pick a random WINDOW_SIZE-block window for "old" channel
 */
async function pickOldWindow(): Promise<{ min: number; max: number }> {
  const current = await getCurrentBlockHeight(GATEWAY_DATA_SOURCE[0]);
  const rawCutoff = current - WINDOW_SIZE;
  if (rawCutoff <= MIN_OLD_BLOCK) {
    return { min: 1, max: current };
  }
  const startFloor = MIN_OLD_BLOCK;
  const startCeil = rawCutoff;
  const min =
    Math.floor(Math.random() * (startCeil - startFloor + 1)) + startFloor;
  const max = min + WINDOW_SIZE - 1;
  return { min, max };
}

/**
 * Fetch all transactions in a given block window (handles pagination internally)
 */
async function fetchWindow(
  media: Channel["media"],
  min: number,
  max: number,
  owner?: string
): Promise<TxMeta[]> {
  return fetchTxsRange(media, min, max, owner);
}

/**
 * Attempt to load transactions via loader, up to a maximum number of attempts
 */
async function loadTxsForWindow(
  loader: () => Promise<TxMeta[]>,
  attempts = MAX_WINDOW_ATTEMPTS
): Promise<TxMeta[]> {
  let txs: TxMeta[] = [];
  for (let i = 1; i <= attempts; i++) {
    txs = await loader();
    if (txs.length > 0) return txs;
    logger.debug(`Window attempt ${i} returned no transactions`);
  }
  logger.warn(`All ${attempts} window attempts returned empty`);
  return [];
}

/**
 * Initialize the fetch queue according to channel type and owner fallback
 */
export async function initFetchQueue(channel: Channel): Promise<void> {
  try {
    queue = [];
    logger.info("Initializing fetch queue", { channel });
    let txs: TxMeta[] = [];

    if (channel.recency === "new") {
      txs = await loadTxsForWindow(async () => {
        const { min, max } = await slideNewWindow(channel);
        logger.debug(`New window blocks ${min}-${max}`);
        return fetchWindow(channel.media, min, max, channel.ownerAddress);
      });
    } else {
      txs = await loadTxsForWindow(async () => {
        const { min, max } = await pickOldWindow();
        logger.debug(`Old window blocks ${min}-${max}`);
        return fetchWindow(channel.media, min, max, channel.ownerAddress);
      });
    }

    // If still empty and owner filter active, expand to full history
    if (txs.length === 0 && channel.ownerAddress) {
      logger.warn(
        "No results for owner-filtered window; expanding to full history"
      );
      const current = await getCurrentBlockHeight(GATEWAY_DATA_SOURCE[0]);
      txs = await fetchWindow(channel.media, 1, current, channel.ownerAddress);
    }

    // Filter out already seen
    const newTxs = txs.filter((tx) => !seenIds.has(tx.id));
    newTxs.forEach((tx) => seenIds.add(tx.id));
    queue = newTxs;
    logger.info(`Queue loaded with ${queue.length} new transactions`);
  } catch (err) {
    logger.error("Failed to initialize fetch queue", err);
    throw err;
  }
}

/**
 * Get next transaction or trigger background refill
 */
export async function getNextTx(channel: Channel): Promise<TxMeta> {
  if (queue.length === 0) {
    logger.debug("Queue empty — blocking refill");
    await initFetchQueue(channel);
  }

  if (queue.length < REFILL_THRESHOLD && !isRefilling) {
    isRefilling = true;
    logger.debug("Queue low — background refill");
    initFetchQueue(channel)
      .catch((e) => logger.warn("Background refill failed", e))
      .finally(() => {
        isRefilling = false;
      });
  }

  const tx = queue.shift();
  if (!tx) {
    throw new Error("Unexpected empty queue after refill");
  }
  logger.debug("getNextTx →", tx.id);
  return tx;
}
