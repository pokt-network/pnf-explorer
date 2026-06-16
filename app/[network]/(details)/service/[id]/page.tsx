import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Hash } from '@/components/ui/Hash';
import { Tabs } from '@/components/ui/Tabs';
import { RawJson } from '@/components/ui/RawJson';
import { getService } from '@/lib/data/services';
import { ServiceSuppliersPanel, ServiceApplicationsPanel, ServiceDifficultyPanel } from '@/components/service/ServicePanels';
import type { NetworkId } from '@/lib/networks';
import { formatNumber } from '@/lib/format';

export async function generateMetadata({ params }: { params: Promise<{ network: NetworkId; id: string }> }): Promise<Metadata> {
  const { network, id } = await params;
  const summary = await getService(network, id).catch(() => null);
  const name = summary?.service.name ?? id;
  return { title: `Service ${name}` };
}

export default async function ServiceDetailPage({ params }: { params: Promise<{ network: NetworkId; id: string }> }) {
  const { network, id } = await params;
  const summary = await getService(network, id);
  if (!summary) notFound();

  const svc = summary.service;
  const name = svc.name ?? svc.id;
  const diff = svc.latestDiff?.nodes?.[0] ?? null;

  const tabs = [
    {
      key: 'suppliers',
      label: 'Suppliers',
      badge: summary.activeSuppliers ?? undefined,
      panel: <ServiceSuppliersPanel network={network} id={svc.id} />,
    },
    {
      key: 'apps',
      label: 'Applications',
      badge: summary.activeApps ?? undefined,
      panel: <ServiceApplicationsPanel network={network} id={svc.id} />,
    },
    { key: 'difficulty', label: 'Relay Mining', panel: <ServiceDifficultyPanel network={network} id={svc.id} /> },
    {
      key: 'raw',
      label: 'Raw',
      panel: <RawJson title="Raw Service" source={<>source: <b>GraphQL indexer</b></>} data={svc} />,
    },
  ];

  return (
    <>
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Services' },
          { label: name },
        ]}
      />

      <div className="pagetitle">
        <Tic entity="service" />
        <div>
          <h1>
            {name}
            <span className="typetag tt-svc" style={{ marginLeft: 10 }}>
              Service
            </span>
          </h1>
          <div className="hash">
            <Hash value={svc.id} full copy />
          </div>
        </div>
      </div>

      <div className="toprow">
        <div className="card balance">
          <div className="lbl">Active Suppliers</div>
          <div className="big">{formatNumber(summary.activeSuppliers ?? 0)}</div>
          <div className="upd">of {formatNumber(summary.totalSuppliers ?? 0)} ever configured</div>
        </div>

        <div className="card kv" style={{ paddingTop: 0 }}>
          <div className="ttl">Service Info</div>
          <div className="line">
            <div className="k">Service ID</div>
            <div className="v mono">{svc.id}</div>
          </div>
          <div className="line">
            <div className="k">Compute Units / Relay</div>
            <div className="v">{svc.computeUnitsPerRelay != null ? formatNumber(svc.computeUnitsPerRelay) : '—'}</div>
          </div>
          <div className="line">
            <div className="k">Owner</div>
            <div className="v">
              {svc.owner ? <Hash value={svc.owner.id} href={`/account/${svc.owner.id}`} /> : <span className="muted">—</span>}
            </div>
          </div>
          <div className="line">
            <div className="k">Active Applications</div>
            <div className="v">{formatNumber(summary.activeApps ?? 0)}</div>
          </div>
          <div className="line">
            <div className="k">Relay Mining EMA</div>
            <div className="v">{diff?.newNumRelaysEma != null ? `${formatNumber(diff.newNumRelaysEma)} relays` : <span className="muted">—</span>}</div>
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} />
    </>
  );
}
