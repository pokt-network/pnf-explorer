import { NetLink as Link } from '@/components/shell/NetLink';
import { Tic } from '@/components/ui/Icons';
import type { HeldRole, RoleId } from '@/lib/roles';

/**
 * Role rail (ROLE-VIEWS-DESIGN.md §2). The primary axis of an address page: one card per actor the
 * address actually is. Deliberately NOT styled as tabs — the tab bar below it belongs to whichever
 * role is active, and the two must not read as one control.
 *
 * Switching is a real navigation (`?as=`), so the server fetches only the selected role's data and
 * drops the previous role's `?tab=`/paging params.
 */
export function RoleSwitcher({ address, held, active }: { address: string; held: HeldRole[]; active: RoleId }) {
  if (held.length <= 1) return null;

  return (
    <nav className="rolerail" aria-label="On-chain roles">
      {held.map(({ meta, hint, externalHref }) => {
        const isActive = !externalHref && meta.id === active;
        const href = externalHref ?? `/account/${address}?as=${meta.id}`;
        return (
          <Link
            key={meta.id}
            href={href}
            className={`rolecard${isActive ? ' active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            <Tic entity={meta.entity} iconSize={16} />
            <span className="rl">
              <b>{meta.label}</b>
              <em>
                {hint}
                {externalHref ? ' →' : ''}
              </em>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
