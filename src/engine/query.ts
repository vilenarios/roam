import { logger } from "../utils/logger";
import { CONTENT_TYPES, type MediaType, type TxMeta } from "../constants";

// --------------------------------------------------------------------------
// Configuration & Constants
// --------------------------------------------------------------------------
export const GATEWAYS_GRAPHQL =
  import.meta.env.VITE_GATEWAYS_GRAPHQL?.split(",") ?? [];
const PAGE_SIZE = 1000;
export const DEFAULT_HEIGHT = 1666042;

if (GATEWAYS_GRAPHQL.length === 0) {
  logger.error(
    "No GraphQL gateways defined – set VITE_GATEWAYS_GRAPHQL in .env"
  );
  throw new Error("Missing GraphQL gateways");
}

// --------------------------------------------------------------------------
// Fetch current block height from /info; fallback to a default if it fails
// --------------------------------------------------------------------------
export async function getCurrentBlockHeight(gateway: string): Promise<number> {
  try {
    const res = await fetch(`${gateway}/info`);
    if (!res.ok) throw new Error(`Info fetch failed: ${res.status}`);
    const json = await res.json();
    const height = json.height;
    if (typeof height !== "number") throw new Error("Invalid /info response");
    return height;
  } catch (err) {
    logger.warn("Failed to fetch current block height", err);
    return DEFAULT_HEIGHT;
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
    const res = await fetch(`${gw}/graphql`, payload);
    const json = await res.json();
    if (json.errors?.length) {
      throw new Error(json.errors.map((e: any) => e.message).join("; "));
    }
    return json.data;
  } catch (err) {
    if (attempts > 1) {
      await new Promise((r) => setTimeout(r, delay));
      return fetchWithRetry(gw, payload, attempts - 1, delay * 2);
    }
    throw err;
  }
}

export async function fetchTxsRange(
  media: MediaType,
  minHeight: number,
  maxHeight: number,
  owner?: string,
  appName?: string,
): Promise<TxMeta[]> {
  const ct = CONTENT_TYPES[media];

  // These apps all use a specific wallet for their users.
  // TODO - set this to allow for multiple owners
  if (appName === 'Paragraph') {
    owner = "w5AtiFsNvORfcRtikbdrp2tzqixb05vdPw-ZhgVkD70"
  } else if (appName === 'Manifold') {
    owner = "NVkSolD-1AJcJ0BMfEASJjIuak3Y6CvDJZ4XOIUbU9g"
  }
  const ownersArg = owner ? `owners: ["${owner}"],` : "";
  const appNameArg = appName ? `{ name: "App-Name", values: "${appName}" }` : ""
  const entityTypeArg = media === 'arfs' ? `{ name: "Entity-Type", values: "file" }` : ""

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
        tags: [
          { name: "Content-Type", values: $ct }
          ${entityTypeArg}
          ${appNameArg}
        ]
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
  }`;

  for (const rawGw of GATEWAYS_GRAPHQL) {
    const gw = rawGw.trim();
    try {
      let allTxs: TxMeta[] = [];
      let after: string | null = null;
      let hasNext = true;

      while (hasNext) {
        const variables = {
          ct,
          min: minHeight,
          max: maxHeight,
          first: PAGE_SIZE,
          after,
        };
        const payload = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-roam-client": "roam-mvp",
          },
          body: JSON.stringify({ query, variables }),
        };
        const data = await fetchWithRetry(gw, payload);
        const edges = data.transactions.edges;
        for (const edge of edges) {
          const tx: TxMeta = edge.node;
          if (!allTxs.find((t) => t.id === tx.id)) allTxs.push(tx);
        }
        hasNext = data.transactions.pageInfo.hasNextPage;
        after = data.transactions.cursor;
      }

      // shuffle allTxs...
      return allTxs;
    } catch (err) {
      logger.warn(`Gateway ${gw} failed after retries:`, err);
    }
  }

  throw new Error("All gateways failed – unable to fetchTxsRange");
}

export async function fetchTxMetaById(txid: string): Promise<TxMeta> {
  const query = `
    query FetchTxById($id: [ID!]!) {
      transactions(ids: $id) {
        edges {
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
      }
    }
  `;

  const variables = { id: [txid] };

  for (const rawGw of GATEWAYS_GRAPHQL) {
    const gw = rawGw.trim();
    const payload = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-roam-client": "roam-mvp",
      },
      body: JSON.stringify({ query, variables }),
    };

    try {
      const data = await fetchWithRetry(gw, payload);
      const edges = data?.transactions?.edges;
      if (!edges || !edges.length) throw new Error("No transaction found");

      return edges[0].node as TxMeta;
    } catch (err) {
      logger.warn(`Gateway ${gw} failed for tx ${txid}:`, err);
    }
  }

  throw new Error("All gateways failed – unable to fetch tx by ID");
}
