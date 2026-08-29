import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Hash } from '@/components/ui/Hash';
import { EmptyState } from '@/components/ui/states';
import { IndexerBanner } from '@/components/ui/IndexerBanner';
import { RoleSwitcher } from '@/components/account/RoleSwitcher';
import { AccountRoleView } from '@/components/account/roles/AccountRoleView';
import { SupplierRoleView } from '@/components/account/roles/SupplierRoleView';
import { OwnerRoleView } from '@/components/account/roles/OwnerRoleView';
import { ApplicationRoleView } from '@/components/account/roles/ApplicationRoleView';
import { GatewayRoleView } from '@/components/account/roles/GatewayRoleView';
import { ServiceOwnerRoleView } from '@/components/account/roles/ServiceOwnerRoleView';
import { RevShareRoleView } from '@/components/account/roles/RevShareRoleView';
import { DelegationRoleView } from '@/components/account/roles/DelegationRoleView';
import { getUseRpcData } from '@/lib/metadata';
import { getAccountProfile } from '@/lib/data/accounts';
import { getSupplierRole, getApplicationRole, getGatewayRole } from '@/lib/data/roles';
import { getDelegations, getDelegationEarnings } from '@/lib/data/delegations';
import { heldRoles, resolveRole, ROLES } from '@/lib/roles';
import type { NetworkId } from '@/lib/networks';
import { truncate } from '@/lib/format';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const short = id.length > 7 ? `${id.slice(0, 7)}…` : id;
  return { title: `Account ${short}` };
}

interface AddressSearchParams {
  /** Active role (ROLE-VIEWS-DESIGN.md §2). Absent → the most specific role the address holds. */
  as?: string;
  ops?: string;
  gateways?: string;
  apps?: string;
  revshare?: string;
  svcs?: string;
  settlements?: string;
  earn?: string;
  txs?: string;
  transfers?: string;
}

/** An actor the address holds but whose data the indexer couldn't return on this request. */
function RoleUnavailable({ what }: { what: string }) {
  return (
    <div className="card rolebox">
      <EmptyState>Couldn’t load the {what} view right now.</EmptyState>
    </div>
  );
}

/**
 * Address page, organised by ACTOR rather than by wallet (ROLE-VIEWS-DESIGN.md).
 *
 * A single `pokt1…` can simultaneously be a supplier operator, the owner of a supplier fleet, an
 * application, a gateway, a validator's operator account, a service owner and a rev-share recipient.
 * Each is an independent state machine that merely shares an address, so each gets its own page
 * identity, its own summary, its own tabs and its own raw chain record. The role rail is the primary
 * control; `?tab=` is scoped inside the active role.
 *
 * Only the active role's data is fetched — a 98-operator owner wallet never pays for supplier
 * service-config queries.
 */
export default async function AccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ network: NetworkId; id: string }>;
  searchParams: Promise<AddressSearchParams>;
}) {
  const { network, id } = await params;
  const sp = await searchParams;
  const fallback = await getUseRpcData(network);

  const profile = await getAccountProfile(network, id);

  const balance = profile.account?.balances?.nodes?.find((b) => b.denom === 'upokt') ?? profile.account?.balances?.nodes?.[0] ?? null;
  const hasBalance = balance != null && Number(balance.amount) > 0;
  const held = heldRoles(profile);
  // `account` is always in `held`, so anything beyond it means the address holds a real actor role.
  const anyRole = held.length > 1;

  // Missing entity: no account record AND no roles AND no balance.
  if (profile.account == null && !anyRole && !hasBalance) notFound();

  const active = resolveRole(held, sp.as);
  const meta = ROLES[active];
  const currentHeight = fallback.metadata?.targetHeight ?? null;

  // Fetch only what the active role needs.
  let body: React.ReactNode;
  switch (active) {
    case 'supplier': {
      const view = await getSupplierRole(network, id).catch(() => null);
      body =
        view && profile.supplier ? (
          <SupplierRoleView network={network} view={view} legacy={profile.supplier} currentHeight={currentHeight} earnPage={sp.earn} />
        ) : (
          <RoleUnavailable what="supplier" />
        );
      break;
    }
    case 'owner': {
      body = profile.owner ? (
        <OwnerRoleView network={network} address={id} owner={profile.owner} currentHeight={currentHeight} opsPage={sp.ops} />
      ) : (
        <RoleUnavailable what="owner" />
      );
      break;
    }
    case 'application': {
      const view = await getApplicationRole(network, id).catch(() => null);
      body = view ? (
        <ApplicationRoleView network={network} view={view} currentHeight={currentHeight} gatewaysPage={sp.gateways} />
      ) : (
        <RoleUnavailable what="application" />
      );
      break;
    }
    case 'gateway': {
      const view = await getGatewayRole(network, id).catch(() => null);
      body = view ? (
        <GatewayRoleView network={network} view={view} currentHeight={currentHeight} appsPage={sp.apps} />
      ) : (
        <RoleUnavailable what="gateway" />
      );
      break;
    }
    case 'service': {
      body = <ServiceOwnerRoleView network={network} address={id} serviceCount={profile.ownedServiceCount} svcsPage={sp.svcs} />;
      break;
    }
    case 'delegation': {
      // `getDelegations` is cache()-deduped with the profile probe above, so this is free.
      const set = await getDelegations(network, id).catch(() => null);
      if (set) {
        const earnings = await getDelegationEarnings(network, set).catch(() => null);
        body = <DelegationRoleView network={network} address={id} set={set} earnings={earnings} settlementsPage={sp.settlements} />;
      } else {
        body = <RoleUnavailable what="delegation" />;
      }
      break;
    }
    case 'revshare': {
      body = <RevShareRoleView network={network} address={id} configCount={profile.revShareRecipientConfigs} revsharePage={sp.revshare} />;
      break;
    }
    default: {
      body = (
        <AccountRoleView
          network={network}
          address={id}
          profile={profile}
          currentHeight={currentHeight}
          txsPage={sp.txs}
          transfersPage={sp.transfers}
        />
      );
    }
  }

  return (
    <>
      <Breadcrumb
        items={[{ label: 'Home', href: '/' }, { label: 'Accounts', href: '/accounts' }, { label: truncate(id, 7, 5) }]}
      />

      {fallback.useRpc ? <IndexerBanner lag={fallback.lag} /> : null}

      <div className="pagetitle">
        <Tic entity={meta.entity} />
        <div>
          <h1>{meta.title}</h1>
          <div className="hash">
            <Hash value={id} full copy />
          </div>
        </div>
      </div>

      <RoleSwitcher address={id} held={held} active={active} />

      {/* `railed` = the role tabs rendered, so the role's summary box squares off its top corners
          and joins them. A single-role address has no tabs, so the box stays a plain card. */}
      <div className={held.length > 1 ? 'roleview railed' : 'roleview'}>{body}</div>
    </>
  );
}
