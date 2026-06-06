import { gqlFetch } from '@/lib/graphql';
import { PARAMS } from '@/lib/queries/params';

export interface ParamNode {
  namespace: string;
  id: string;
  key: string;
  value: unknown;
  block: { height: string } | null;
}

export interface ParamGroup {
  namespace: string;
  params: ParamNode[];
}

/** Latest value of every on-chain param, grouped by namespace. Rarely changes → long TTL (§3). */
export async function getParams(): Promise<ParamGroup[]> {
  const data = await gqlFetch<{ params: { nodes: ParamNode[] } }>(PARAMS, undefined, { revalidate: 3600 });
  const byNs = new Map<string, ParamNode[]>();
  for (const node of data.params.nodes) {
    const ns = node.namespace ?? 'other';
    if (!byNs.has(ns)) byNs.set(ns, []);
    byNs.get(ns)!.push(node);
  }
  return [...byNs.entries()]
    .map(([namespace, params]) => ({
      namespace,
      params: params.sort((a, b) => a.key.localeCompare(b.key)),
    }))
    .sort((a, b) => a.namespace.localeCompare(b.namespace));
}

/** Render a param value: objects/arrays as compact JSON, scalars as-is. */
export function formatParamValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
