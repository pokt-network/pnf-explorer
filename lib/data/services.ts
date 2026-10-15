import { gqlFetch } from '@/lib/graphql';
import { lcdFetch } from '@/lib/lcd';
import { firstPerId } from '@/lib/data/range';
import { fleetPage } from '@/lib/data/suppliers';
import type { NetworkId } from '@/lib/networks';
import {
  SERVICES_LIST,
  SERVICE_ACTIVE_SUPPLIER_COUNTS,
  SERVICE_BY_ID,
  SERVICE_SUPPLIERS,
  SERVICE_APPLICATIONS,
  SERVICE_DIFFICULTY,
} from '@/lib/queries/services';

// Services are infrequently updated and stable for long stretches, so the list + its per-service
// active-supplier counts use a long (12h) ISR window — adequate for a top-level overview.
const SERVICES_TTL = 12 * 60 * 60;

// Services data layer (indexer, plus one LCD read for the on-chain metadata card —
// getServiceCard). "Active" counts/lists filter to currently-Staked suppliers/apps, from the
// service summary and fleet functions — see lib/queries/services.ts.

export interface ServiceDifficultyPoint {
  blockId: string;
  prevNumRelaysEma?: string | null;
  newNumRelaysEma: string | null;
  newTargetHashHexEncoded: string | null;
}

export interface ServiceDetail {
  id: string;
  name: string | null;
  computeUnitsPerRelay: string | null;
  ownerId: string | null;
  latestDiff: { nodes: ServiceDifficultyPoint[] };
}

export interface ServiceSummary {
  service: ServiceDetail;
  activeSuppliers: number | null;
  totalSuppliers: number | null;
  activeApps: number | null;
  /** Human description from the on-chain metadata card (`pocket-service-card/v1`), or null if the
   *  service has no card / no description. Derived from `card`. */
  description: string | null;
  /** The full on-chain metadata card (`pocket-service-card/v1`), parsed, or null if the service has
   *  no card / it can't be decoded. Rendered verbatim on the Metadata tab. See getServiceCard. */
  card: unknown | null;
}

export interface ServiceListRow {
  id: string;
  name: string | null;
  computeUnitsPerRelay: string | null;
  ownerId: string | null;
}

export interface ServiceListRowWithCount extends ServiceListRow {
  /** Null when the counts could not be read (failed, or the walk hit its cap): unknown, not 0. */
  activeSuppliers: number | null;
}

// The indexer caps connection page size at 1000 (verified 2026-10-06: `services(first: 1000)` returns all 263 mainnet services).
const PAGE_CAP = 1000;

/** One page of services (ordered by name). 12h ISR — services rarely change. */
export async function getServiceList(network: NetworkId, limit: number, offset: number) {
  const data = await gqlFetch<{ services: { totalCount: number; nodes: ServiceListRow[] } }>(
    network,
    SERVICES_LIST,
    { limit: Math.min(limit, PAGE_CAP), offset },
    { revalidate: SERVICES_TTL },
  );
  return data.services;
}

/** The query limit of both endpoints: a function list without `first` returns at most this many rows. */
const SUMMARY_LIMIT = 1000;

/**
 * Active (Staked) supplier count per service id, every service from the service summary function. 12h ISR —
 * these move slowly. Map keyed by id; missing ids → 0. Null when the read failed or filled the query limit.
 */
export async function getServiceActiveSupplierCounts(network: NetworkId): Promise<Map<string, number> | null> {
  try {
    const data = await gqlFetch<{ getServiceSummaryList: { serviceId: string; stakedSuppliers: string | null }[] | null }>(
      network,
      SERVICE_ACTIVE_SUPPLIER_COUNTS,
      undefined,
      { revalidate: SERVICES_TTL },
    );
    const rows = data.getServiceSummaryList ?? [];
    // A function list stops at the query limit (1000 rows on both endpoints, measured 2026-10-15) without saying so:
    // an answer that fills it may be partial, and partial counts are not shown.
    if (rows.length >= SUMMARY_LIMIT) return null;
    return new Map(rows.map((r) => [r.serviceId, Number(r.stakedSuppliers ?? 0)]));
  } catch {
    // Unknown, not 0: the list shows a dash.
    return null;
  }
}

/**
 * Every service (paged through the 1000-row cap) with its active-supplier count. 12h ISR. Used by
 * the services list so it can sort by CU/relay OR active suppliers across the FULL set, then
 * paginate in memory (the supplier count is computed, not an orderable indexer field).
 */
export async function getAllServicesWithCounts(network: NetworkId): Promise<ServiceListRowWithCount[]> {
  const all: ServiceListRow[] = [];
  const countsP = getServiceActiveSupplierCounts(network);
  for (let i = 0; i < 20; i++) {
    const { nodes, totalCount } = await getServiceList(network, PAGE_CAP, all.length);
    all.push(...nodes);
    if (nodes.length === 0 || all.length >= totalCount) break;
  }
  const counts = await countsP;
  // A service missing from a complete read has no Staked supplier (0); with no read at all the count is unknown.
  return all.map((n) => ({ ...n, activeSuppliers: counts ? (counts.get(n.id) ?? 0) : null }));
}

/**
 * The service's on-chain metadata card (`pocket-service-card/v1`), parsed. The indexer does not
 * expose the card, so this is the one LCD read in the otherwise indexer-only services layer. The
 * card is stored as raw bytes and returned base64 by the LCD under `service.metadata.card`; ~half
 * of mainnet services carry one. Cards change rarely → 12h ISR. Any missing/malformed layer
 * (null metadata, absent card, undecodable base64, non-object JSON) → null, so the caller simply
 * renders nothing.
 */
export async function getServiceCard(network: NetworkId, id: string): Promise<Record<string, unknown> | null> {
  try {
    const data = await lcdFetch<{ service?: { metadata?: { card?: string | null } | null } | null }>(
      network,
      `/pokt-network/poktroll/service/service/${encodeURIComponent(id)}`,
      { revalidate: SERVICES_TTL },
    );
    const b64 = data.service?.metadata?.card;
    if (!b64) return null;
    const card = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8')) as unknown;
    if (typeof card !== 'object' || card === null || Array.isArray(card)) return null;
    return card as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The card's human description (trimmed), or null when absent/blank. */
function cardDescription(card: Record<string, unknown> | null): string | null {
  const desc = card?.description;
  return typeof desc === 'string' && desc.trim() ? desc.trim() : null;
}

/** Service header + active supplier/app counts + latest relay-mining difficulty + metadata card.
 *  null → notFound. */
export async function getService(network: NetworkId, id: string): Promise<ServiceSummary | null> {
  const [data, card] = await Promise.all([
    gqlFetch<{
      service: Omit<ServiceDetail, 'latestDiff'> | null;
      summary:
        | {
            stakedSuppliers: string | null;
            suppliers: string | null;
            stakedApplications: string | null;
            numRelaysEma: string | null;
            targetHashHex: string | null;
            difficultyUpdatedHeight: string | null;
          }[]
        | null;
    }>(network, SERVICE_BY_ID, { id }, { revalidate: 60 }),
    getServiceCard(network, id),
  ]);
  if (!data.service) return null;
  // No summary row: no supplier config or application for the service at all (0, as the old counts said).
  const summary = data.summary?.[0];
  const count = (v: string | null | undefined) => (data.summary ? Number(v ?? 0) : null);
  return {
    // The current difficulty is the summary's newest update (none when the service never had one).
    service: {
      ...data.service,
      latestDiff: {
        nodes:
          summary?.difficultyUpdatedHeight != null
            ? [{ blockId: String(summary.difficultyUpdatedHeight), newNumRelaysEma: summary.numRelaysEma, newTargetHashHexEncoded: summary.targetHashHex }]
            : [],
      },
    },
    activeSuppliers: count(summary?.stakedSuppliers),
    totalSuppliers: count(summary?.suppliers),
    activeApps: count(summary?.stakedApplications),
    description: cardDescription(card),
    card,
  };
}

export interface ServiceSupplierRow {
  supplierId: string;
  domains: string[] | null;
  supplier: { stakeAmount: string | null; stakeStatus: string | null } | null;
}

/** Active (Staked) suppliers serving this service, largest stake first, with the root domains of their endpoints for it. */
export async function getServiceSuppliers(network: NetworkId, id: string, limit: number, offset: number) {
  type Row = { supplierId: string; stakeUpokt: string | null; stakeStatus: string | null; serviceDomains: string[] | null };
  const { rows, extra: totalCount } = await fleetPage<Row, number>(
    (rowLimit, first, skip) =>
      gqlFetch<{ getSupplierFleetList: Row[] | null; summary: { stakedSuppliers: string | null }[] | null }>(
        network,
        SERVICE_SUPPLIERS,
        { id, rowLimit, limit: first, offset: skip },
        { revalidate: 60 },
      ).then((d) => ({ rows: d.getSupplierFleetList ?? [], extra: Number(d.summary?.[0]?.stakedSuppliers ?? 0) })),
    limit,
    offset,
  );
  return {
    totalCount,
    nodes: firstPerId(rows, (s) => s.supplierId).map(
      (s): ServiceSupplierRow => ({
        supplierId: s.supplierId,
        domains: s.serviceDomains,
        supplier: { stakeAmount: s.stakeUpokt, stakeStatus: s.stakeStatus },
      }),
    ),
  };
}

export interface ServiceApplicationRow {
  applicationId: string;
  application: { stakeAmount: string | null; stakeStatus: string | null } | null;
}

/** Active (Staked) applications staked for this service, largest stake first. */
export async function getServiceApplications(network: NetworkId, id: string, limit: number, offset: number) {
  const data = await gqlFetch<{
    getApplicationFleetList: { applicationId: string; stakeUpokt: string | null; stakeStatus: string | null }[] | null;
    summary: { stakedApplications: string | null }[] | null;
  }>(network, SERVICE_APPLICATIONS, { id, limit, offset }, { revalidate: 60 });
  return {
    totalCount: Number(data.summary?.[0]?.stakedApplications ?? 0),
    nodes: firstPerId(data.getApplicationFleetList ?? [], (a) => a.applicationId).map(
      (a): ServiceApplicationRow => ({ applicationId: a.applicationId, application: { stakeAmount: a.stakeUpokt, stakeStatus: a.stakeStatus } }),
    ),
  };
}

interface DifficultyRow {
  height: string;
  serviceId?: string;
  prevNumRelaysEma?: string | null;
  newNumRelaysEma: string | null;
  newTargetHashHex: string | null;
}

function toDifficultyPoint(r: DifficultyRow): ServiceDifficultyPoint {
  return {
    blockId: String(r.height),
    prevNumRelaysEma: r.prevNumRelaysEma,
    newNumRelaysEma: r.newNumRelaysEma,
    newTargetHashHexEncoded: r.newTargetHashHex,
  };
}

/** Rows the difficulty function lists per call at most. */
const DIFFICULTY_CHUNK = 1000;

/**
 * Relay-mining difficulty / EMA update history for this service (newest first). The function pages by
 * cursor, 1000 rows at a time: a page past the first 1000 rows first walks to its chunk (the last row of
 * each earlier chunk), and a page across a chunk's end reads its rest from the next one. No total:
 * `hasNext` says whether an older page exists. The difficulty function has no offset mode to skip the walk.
 */
export async function getServiceDifficulty(network: NetworkId, id: string, limit: number, offset: number) {
  type Cursor = { beforeHeight: string | null; beforeServiceId: string | null };
  let cursor: Cursor = { beforeHeight: null, beforeServiceId: null };
  const read = (c: Cursor, first: number, skip: number) =>
    gqlFetch<{ getRelayMiningDifficultyList: DifficultyRow[] | null }>(
      network,
      SERVICE_DIFFICULTY,
      { id, rowLimit: DIFFICULTY_CHUNK, ...c, limit: first, offset: skip },
      { revalidate: 60 },
    ).then((d) => d.getRelayMiningDifficultyList ?? []);
  for (let chunk = 0; chunk < Math.floor(offset / DIFFICULTY_CHUNK); chunk++) {
    const last = (await read(cursor, 1, DIFFICULTY_CHUNK - 1))[0];
    if (!last) return { hasNext: false, nodes: [] as ServiceDifficultyPoint[] };
    cursor = { beforeHeight: String(last.height), beforeServiceId: last.serviceId ?? id };
  }
  // The page and one row past it (hasNext). Whatever of them lies past the chunk's end — a page that crosses it, or
  // the row after a page that ends it — is read from the next chunk, from the last row read.
  const want = limit + 1;
  const within = offset % DIFFICULTY_CHUNK;
  // a copy: the rows from the next chunk are appended to it, and a read shared in flight hands the same array to others
  const rows = [...(await read(cursor, Math.min(want, DIFFICULTY_CHUNK - within), within))];
  if (rows.length < want && within + rows.length === DIFFICULTY_CHUNK && rows.length > 0) {
    const last = rows[rows.length - 1];
    rows.push(...(await read({ beforeHeight: String(last.height), beforeServiceId: last.serviceId ?? id }, want - rows.length, 0)));
  }
  return { hasNext: rows.length > limit, nodes: rows.slice(0, limit).map(toDifficultyPoint) };
}
