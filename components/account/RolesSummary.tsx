import { NetLink as Link } from '@/components/shell/NetLink';
import { Hash } from '@/components/ui/Hash';
import { StakeStatusPill } from '@/components/ui/StatusPill';
import type { AccountProfile } from '@/lib/data/accounts';
import { formatPokt, formatPoktCompact, formatNumber } from '@/lib/format';
import { etaFromBlocks } from '@/lib/time';
import { validatorMoniker, formatCommission } from '@/lib/validator';

/** Unbond ETA sub-line — only rendered while an actor is Unstaking. */
function UnbondLine({ endHeight, currentHeight, reason }: { endHeight: string | null; currentHeight: number | null; reason?: string | null }) {
  if (!endHeight) return null;
  const end = Number(endHeight);
  const remaining = currentHeight != null ? end - currentHeight : null;
  return (
    <div className="muted" style={{ marginTop: 4 }}>
      Unbonds at block <Link href={`/block/${end}`}>{formatNumber(end)}</Link>
      {remaining != null ? ` · ${etaFromBlocks(remaining)}` : ''}
      {reason ? ` · ${reason}` : ''}
    </div>
  );
}

/**
 * Adaptive "Network Roles" card. Roles are additive — every role the address holds gets a line
 * (operator, owner-of-operators, validator, application, gateway, service owner). A plain wallet
 * with no stake roles falls through to a single explanatory line.
 */
export function RolesSummary({ profile, address, currentHeight }: { profile: AccountProfile; address: string; currentHeight: number | null }) {
  const { supplier, owner, validator, application, gateway, ownedServices, revShareRecipientConfigs } = profile;
  const hasAnyRole = supplier || owner || validator || application || gateway || ownedServices.length > 0 || revShareRecipientConfigs > 0;

  return (
    <div className="card kv" style={{ paddingTop: 0 }}>
      <div className="ttl">Network Roles</div>

      {supplier ? (
        <div className="line">
          <div className="k">Supplier · Operator</div>
          <div className="v">
            <StakeStatusPill status={supplier.stakeStatus} sm />{' '}
            <span className="dim">· {formatPokt(supplier.stakeAmount)} POKT · {supplier.serviceConfigs.totalCount} services</span>
            <div className="dim" style={{ marginTop: 4 }}>
              {supplier.ownerId === address ? (
                'Self-owned'
              ) : (
                <>
                  Owned by <Hash value={supplier.ownerId} href={`/account/${supplier.ownerId}`} />
                </>
              )}
            </div>
            {supplier.stakeStatus === 'Unstaking' ? (
              <UnbondLine endHeight={supplier.unstakingEndHeight} currentHeight={currentHeight} reason={supplier.unstakingReason} />
            ) : null}
          </div>
        </div>
      ) : null}

      {owner ? (
        <div className="line">
          <div className="k">Supplier · Owner</div>
          <div className="v">
            <b>{formatNumber(owner.operatorCount)}</b> operator{owner.operatorCount === 1 ? '' : 's'}{' '}
            <span className="dim">· {formatPoktCompact(owner.totalStakeUpokt)} POKT staked</span>
            <div className="muted" style={{ marginTop: 4 }}>See the Operators tab for the full fleet.</div>
          </div>
        </div>
      ) : null}

      {validator ? (
        <div className="line">
          <div className="k">Validator</div>
          <div className="v">
            <StakeStatusPill status={validator.stakeStatus} sm />{' '}
            <span className="dim">
              · {validatorMoniker(validator.description) ?? 'unnamed'} · {formatCommission(validator.commission)} commission
            </span>
            <div className="dim" style={{ marginTop: 4 }}>
              <Link href={`/validator/${validator.id}`}>View validator →</Link>
            </div>
          </div>
        </div>
      ) : null}

      {application ? (
        <div className="line">
          <div className="k">Application</div>
          <div className="v">
            <StakeStatusPill status={application.stakeStatus} sm />{' '}
            <span className="dim">
              · {formatPokt(application.stakeAmount)} POKT · {application.serviceCount} service{application.serviceCount === 1 ? '' : 's'} ·{' '}
              {application.delegatedGatewayCount} gateway{application.delegatedGatewayCount === 1 ? '' : 's'}
            </span>
            {application.stakeStatus === 'Unstaking' ? (
              <UnbondLine endHeight={application.unstakingEndHeight} currentHeight={currentHeight} reason={application.unstakingReason} />
            ) : null}
          </div>
        </div>
      ) : null}

      {gateway ? (
        <div className="line">
          <div className="k">Gateway</div>
          <div className="v">
            <StakeStatusPill status={gateway.stakeStatus} sm />{' '}
            <span className="dim">
              · {formatPokt(gateway.stakeAmount)} POKT · {gateway.delegatingAppCount} delegating app{gateway.delegatingAppCount === 1 ? '' : 's'}
            </span>
            {gateway.stakeStatus === 'Unstaking' ? (
              <UnbondLine endHeight={gateway.unstakingEndHeight} currentHeight={currentHeight} />
            ) : null}
          </div>
        </div>
      ) : null}

      {ownedServices.length > 0 ? (
        <div className="line">
          <div className="k">Service Owner</div>
          <div className="v">
            <b>{ownedServices.length}</b> service{ownedServices.length === 1 ? '' : 's'}{' '}
            <span className="dim">· {ownedServices.map((s) => s.id).join(', ')}</span>
          </div>
        </div>
      ) : null}

      {revShareRecipientConfigs > 0 ? (
        <div className="line">
          <div className="k">Rev-share Recipient</div>
          <div className="v">
            Earns from <b>{formatNumber(revShareRecipientConfigs)}</b> service config{revShareRecipientConfigs === 1 ? '' : 's'}
            <div className="muted" style={{ marginTop: 4 }}>See the Rev-share tab for the breakdown.</div>
          </div>
        </div>
      ) : null}

      {!hasAnyRole ? (
        <div className="line">
          <div className="k">Roles</div>
          <div className="v">
            <span className="muted">Plain account — no active stake roles.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
