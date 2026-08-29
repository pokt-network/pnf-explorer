import type { Entity } from '@/components/ui/Icons';
import type { AccountProfile } from '@/lib/data/accounts';

// Role registry (ROLE-VIEWS-DESIGN.md §2/§6). One address can be several independent actors at
// once; this file is the single place that knows which roles exist, how they're ranked, and how
// they're named/tinted, so adding a future actor type is one entry here plus its panels.

export const ROLE_IDS = ['supplier', 'owner', 'application', 'gateway', 'validator', 'delegation', 'service', 'revshare', 'account'] as const;
export type RoleId = (typeof ROLE_IDS)[number];

export interface RoleMeta {
  id: RoleId;
  /** Rail label. */
  label: string;
  /** Page title once the role is active ("Supplier", not "Account"). */
  title: string;
  /** Entity badge/tint reused from the icon registry. */
  entity: Entity;
}

export const ROLES: Record<RoleId, RoleMeta> = {
  supplier: { id: 'supplier', label: 'Supplier', title: 'Supplier', entity: 'supplier' },
  owner: { id: 'owner', label: 'Owner', title: 'Supplier Owner', entity: 'supplier' },
  application: { id: 'application', label: 'Application', title: 'Application', entity: 'application' },
  gateway: { id: 'gateway', label: 'Gateway', title: 'Gateway', entity: 'gateway' },
  validator: { id: 'validator', label: 'Validator', title: 'Validator', entity: 'validator' },
  delegation: { id: 'delegation', label: 'Delegation', title: 'Staking Delegator', entity: 'validator' },
  service: { id: 'service', label: 'Service Owner', title: 'Service Owner', entity: 'service' },
  revshare: { id: 'revshare', label: 'Rev-share Income', title: 'Rev-share Recipient', entity: 'service' },
  account: { id: 'account', label: 'Account', title: 'Account', entity: 'account' },
};

/**
 * Most-specific-first. An address that is both an operator and its own owner opens on the operator
 * view (the more specific identity); a plain wallet falls through to `account`, unchanged from
 * before this redesign.
 */
export const ROLE_RANK: RoleId[] = ['supplier', 'owner', 'application', 'gateway', 'validator', 'delegation', 'service', 'revshare', 'account'];

export function isRoleId(v: string | undefined | null): v is RoleId {
  return v != null && (ROLE_IDS as readonly string[]).includes(v);
}

/** One rail entry: the role plus the one-glance stat shown under its label. */
export interface HeldRole {
  meta: RoleMeta;
  /** Short stat, e.g. "3 services" / "65 operators". */
  hint: string;
  /** Set for roles that live on another page (validator → /validator/{valoper}). */
  externalHref?: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * Every role this address actually holds, in tab order. `account` is always present and always
 * FIRST — the wallet is the one identity every address has, so it anchors the left edge of the tab
 * strip and stays put as the actor tabs beside it change from address to address.
 *
 * Tab order is presentation only. Which role a paramless URL OPENS on is `resolveRole`, which ranks
 * by ROLE_RANK (most specific first) and is deliberately unaffected by this order — a supplier
 * address still opens on Supplier, not on its wallet.
 */
export function heldRoles(profile: AccountProfile): HeldRole[] {
  const out: HeldRole[] = [{ meta: ROLES.account, hint: 'wallet' }];
  if (profile.supplier) {
    out.push({ meta: ROLES.supplier, hint: plural(profile.supplier.serviceConfigs.totalCount, 'service') });
  }
  if (profile.owner) {
    out.push({ meta: ROLES.owner, hint: plural(profile.owner.operatorCount, 'operator') });
  }
  if (profile.application) {
    out.push({ meta: ROLES.application, hint: plural(profile.application.serviceCount, 'service') });
  }
  if (profile.gateway) {
    out.push({ meta: ROLES.gateway, hint: plural(profile.gateway.delegatingAppCount, 'app') });
  }
  if (profile.validator) {
    out.push({ meta: ROLES.validator, hint: 'consensus', externalHref: `/validator/${profile.validator.id}` });
  }
  if (profile.delegationCount > 0) {
    out.push({ meta: ROLES.delegation, hint: plural(profile.delegationCount, 'validator') });
  }
  if (profile.ownedServiceCount > 0) {
    out.push({ meta: ROLES.service, hint: plural(profile.ownedServiceCount, 'service') });
  }
  if (profile.revShareRecipientConfigs > 0) {
    out.push({ meta: ROLES.revshare, hint: plural(profile.revShareRecipientConfigs, 'config') });
  }
  return out;
}

/**
 * Resolve the active role: an explicit `?as=` the address actually holds, else the most specific
 * role it does hold. An unknown or unheld value falls back rather than 404ing — a stale bookmark
 * should still render something useful.
 */
export function resolveRole(held: HeldRole[], requested: string | undefined): RoleId {
  const heldIds = new Set(held.filter((h) => !h.externalHref).map((h) => h.meta.id));
  if (isRoleId(requested) && heldIds.has(requested)) return requested;
  return ROLE_RANK.find((r) => heldIds.has(r)) ?? 'account';
}
