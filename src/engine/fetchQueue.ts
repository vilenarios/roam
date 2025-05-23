import { fetchTxsRange, getCurrentBlockHeight } from "./query";
import { logger } from "../utils/logger";
import {
  type TxMeta,
  type Channel,
  MIN_OLD_BLOCK,
  MAX_RETRY_ATTEMPTS,
  WINDOW_SIZE,
} from "../constants";

// Read and trim configured gateways
const rawGateways =
  import.meta.env.VITE_GATEWAYS_DATA_SOURCE?.split(",")
    .map((s: string) => s.trim())
    .filter(Boolean) ?? [];

// Determine primary and fallback gateways
const fallbackGateway =
  rawGateways[1] || rawGateways[0] || "https://arweave.net";

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
const REFILL_THRESHOLD = 3;

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
 * Initialize the fetch queue according to channel type and owner fallback
 */
/*export async function initFetchQueue(
  channel: Channel,
  options: {
    initialTx?: TxMeta;
    minBlock?: number;
    maxBlock?: number;
    ownerAddress?: string;
  } = {}
): Promise<{ min: number; max: number } | undefined> {
  try {
    queue = [];
    logger.info("Initializing fetch queue", { channel, options });

    let txs: TxMeta[] = [];
    let min: number = 0;
    let max: number = 0;

    // 1) Deep-link by txId
    if (options.initialTx) {
      seenIds.add(options.initialTx.id);

      const center = options.initialTx.block.height;
      min = options.minBlock ?? Math.max(1, center - WINDOW_SIZE);
      max = options.maxBlock ?? center + WINDOW_SIZE;
      const owner = options.ownerAddress ?? options.initialTx.owner.address;
      logger.info(`Deep link window blocks ${min}-${max} for owner: ${owner}`);
      txs = await fetchWindow(channel.media, min, max, owner);

      // 2) Deep-link by explicit block range breaking into a window subset
    } else if (options.minBlock != null && options.maxBlock != null) {
      const rangeMin = options.minBlock;
      const rangeMax = options.maxBlock;
      const windowSize = WINDOW_SIZE;

      if (rangeMax - rangeMin + 1 <= windowSize) {
        min = rangeMin;
        max = rangeMax;
      } else {
        const start =
          Math.floor(Math.random() * (rangeMax - rangeMin - windowSize + 2)) +
          rangeMin;
        min = start;
        max = start + windowSize - 1;
      }
      const owner = options.ownerAddress ?? channel.ownerAddress;
      logger.info(
        `Deep link explicit window subset blocks ${min}-${max} within ${rangeMin}-${rangeMax} for owner: ${owner}`
      );
      txs = await fetchWindow(channel.media, min, max, owner);

      // 3) Bucket mode with retries
    } else {
      const owner = channel.ownerAddress;
      let attempt = 0;

      while (attempt < MAX_RETRY_ATTEMPTS && txs.length === 0) {
        if (channel.recency === "new") {
          const w = await slideNewWindow(channel);
          min = w.min;
          max = w.max;
          logger.debug(
            `Attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS} — New window blocks ${min}-${max}`
          );
        } else {
          const w = await pickOldWindow();
          min = w.min;
          max = w.max;
          logger.debug(
            `Attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS} — Old window blocks ${min}-${max}`
          );
        }
        txs = await fetchWindow(channel.media, min, max, owner);
        attempt++;
      }

      if (txs.length === 0) {
        logger.warn(
          `No txs found after ${MAX_RETRY_ATTEMPTS} ${channel.recency} window attempts`
        );
      }
    }

    // 4) Owner-only fallback if still empty
    if (txs.length === 0 && channel.ownerAddress) {
      min = 1;
      max = await getCurrentBlockHeight(GATEWAY_DATA_SOURCE[0]);
      logger.warn(`Fallback: full history from ${min}-${max}`);
      txs = await fetchWindow(channel.media, min, max, channel.ownerAddress);
    }

    // 5) Dedupe & enqueue
    const newTxs = txs.filter((tx) => !seenIds.has(tx.id));
    newTxs.forEach((tx) => seenIds.add(tx.id));
    queue = newTxs;
    logger.info(`Queue loaded with ${queue.length} new transactions`);

    // 6) Return the actual block-range used
    return { min, max };
  } catch (err) {
    logger.error("Failed to initialize fetch queue", err);
    throw err;
  }
} */

/**
 * Get next transaction or trigger background refill
 */
export async function getNextTx(channel: Channel): Promise<TxMeta | null> {
  // synchronous refill if empty
  if (queue.length === 0) {
    logger.debug("Queue empty — blocking refill");
    await initFetchQueue(channel);
  }

  // background refill if below threshold
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
    logger.warn("No transactions available after refill");
    return null;
  }
  return tx;
}

export async function initFetchQueue(
  channel: Channel,
  options: {
    initialTx?: TxMeta;
    minBlock?: number;
    maxBlock?: number;
    ownerAddress?: string;
  } = {}
): Promise<{ min: number; max: number }> {
  queue = [];
  logger.info("Initializing fetch queue", { channel, options });

  let txs: TxMeta[] = [];
  let min = 0;
  let max = 0;

  // —— 1a) Deep-link by txId + explicit range ——
  if (
    options.initialTx &&
    options.minBlock != null &&
    options.maxBlock != null
  ) {
    seenIds.add(options.initialTx.id);
    const { minBlock: rangeMin, maxBlock: rangeMax, ownerAddress } = options;
    const owner = ownerAddress ?? channel.ownerAddress;

    logger.info(`Deep-link by ID+range; subset within ${rangeMin}-${rangeMax}`);
    for (let i = 0; i < MAX_RETRY_ATTEMPTS && txs.length === 0; i++) {
      if (rangeMax - rangeMin + 1 <= WINDOW_SIZE) {
        min = rangeMin;
        max = rangeMax;
      } else {
        const start =
          Math.floor(Math.random() * (rangeMax - rangeMin - WINDOW_SIZE + 2)) +
          rangeMin;
        min = start;
        max = start + WINDOW_SIZE - 1;
      }
      logger.debug(`Attempt ${i + 1}/${MAX_RETRY_ATTEMPTS} → ${min}-${max}`);
      txs = await fetchWindow(channel.media, min, max, owner);
    }

    // —— 1b) Deep-link by txId only ——
  } else if (options.initialTx) {
    seenIds.add(options.initialTx.id);
    const owner = options.ownerAddress ?? options.initialTx.owner.address;

    logger.info(`Deep-link by ID only; bucket-mode fallback`);
    for (let i = 0; i < MAX_RETRY_ATTEMPTS && txs.length === 0; i++) {
      if (channel.recency === "new") {
        const w = await slideNewWindow(channel);
        min = w.min;
        max = w.max;
      } else {
        const w = await pickOldWindow();
        min = w.min;
        max = w.max;
      }
      logger.debug(`Attempt ${i + 1}/${MAX_RETRY_ATTEMPTS} → ${min}-${max}`);
      txs = await fetchWindow(channel.media, min, max, owner);
    }

    // —— 2) Deep-link by explicit range only ——
  } else if (options.minBlock != null && options.maxBlock != null) {
    const { minBlock: rangeMin, maxBlock: rangeMax, ownerAddress } = options;
    const owner = ownerAddress ?? channel.ownerAddress;

    logger.info(`Deep-link by range only ${rangeMin}-${rangeMax}`);
    for (let i = 0; i < MAX_RETRY_ATTEMPTS && txs.length === 0; i++) {
      if (rangeMax - rangeMin + 1 <= WINDOW_SIZE) {
        min = rangeMin;
        max = rangeMax;
      } else {
        const start =
          Math.floor(Math.random() * (rangeMax - rangeMin - WINDOW_SIZE + 2)) +
          rangeMin;
        min = start;
        max = start + (WINDOW_SIZE * i) - 1; // increase window size for each attempt
      }
      logger.info(`Attempt ${i + 1}/${MAX_RETRY_ATTEMPTS} → ${min}-${max}`);
      txs = await fetchWindow(channel.media, min, max, owner);
    }

    // —— 3) Deep-link by owner only (no TX, no range) ——
  } else if (options.ownerAddress) {
    const owner = options.ownerAddress;
    min = 1;
    max = await getCurrentBlockHeight(GATEWAY_DATA_SOURCE[0]);
    logger.info(`Deep-link by owner only; full range ${min}-${max}`);
    txs = await fetchWindow(channel.media, min, max, owner);

    // —— 4) No deep-link params: normal bucket mode ——
  } else {
    const owner = channel.ownerAddress;
    logger.info(
      `Bucket-mode (“${channel.recency}”) with up to ${MAX_RETRY_ATTEMPTS} attempts`
    );
    for (let i = 0; i < MAX_RETRY_ATTEMPTS && txs.length === 0; i++) {
      if (channel.recency === "new") {
        const w = await slideNewWindow(channel);
        min = w.min;
        max = w.max;
      } else {
        const w = await pickOldWindow();
        min = w.min;
        max = w.max;
      }
      logger.debug(`Attempt ${i + 1}/${MAX_RETRY_ATTEMPTS} → ${min}-${max}`);
      txs = await fetchWindow(channel.media, min, max, owner);
    }
  }

  // —— 5) Manual owner-fallback (if bucket mode found nothing) ——
  if (txs.length === 0 && channel.ownerAddress && !options.ownerAddress) {
    // only apply this when user manually toggles owner, not on deep-link owner
    min = 1;
    max = await getCurrentBlockHeight(GATEWAY_DATA_SOURCE[0]);
    logger.warn(
      `Fallback full history for owner ${channel.ownerAddress}: ${min}-${max}`
    );
    txs = await fetchWindow(channel.media, min, max, channel.ownerAddress);
  }

  // —— 6) Dedupe & enqueue ——
  const newTxs = txs.filter((tx) => !seenIds.has(tx.id));
  newTxs.forEach((tx) => seenIds.add(tx.id));
  queue = newTxs;
  logger.info(`Queue loaded with ${queue.length} txs`);

  // —— 7) Return the actual window ——
  return { min, max };
}
