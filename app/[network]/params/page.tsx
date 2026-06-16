import type { Metadata } from 'next';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { EmptyState } from '@/components/ui/states';
import { getParams, formatParamValue } from '@/lib/data/params';
import type { NetworkId } from '@/lib/networks';
import { formatNumber } from '@/lib/format';

export const metadata: Metadata = { title: 'On-Chain Parameters' };

export default async function ParamsPage({ params }: { params: Promise<{ network: NetworkId }> }) {
  const { network } = await params;
  const groups = await getParams(network);
  const total = groups.reduce((s, g) => s + g.params.length, 0);

  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Params' }]} />
      <div className="listhead">
        <Tic entity="params" iconSize={20} />
        <h1>On-Chain Parameters</h1>
        <span className="cnt">
          Live from governance · {groups.length} {groups.length === 1 ? 'module' : 'modules'} · {formatNumber(total)} params
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="card">
          <EmptyState>No parameters returned.</EmptyState>
        </div>
      ) : (
        groups.map((g) => (
          <div className="card ns" key={g.namespace}>
            <div className="nh">
              <span className="nm">{g.namespace}</span>
              <span className="nc">
                {g.params.length} {g.params.length === 1 ? 'param' : 'params'}
              </span>
            </div>
            <table className="ptbl">
              <tbody>
                {g.params.map((p) => (
                  <tr key={p.id}>
                    <td className="pk">{p.key}</td>
                    <td className="pv">{formatParamValue(p.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </>
  );
}
