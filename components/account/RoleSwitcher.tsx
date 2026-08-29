import type { CSSProperties } from 'react';
import { NetLink as Link } from '@/components/shell/NetLink';
import { Tic, ENTITY } from '@/components/ui/Icons';
import type { HeldRole, RoleId } from '@/lib/roles';

/**
 * Role tabs (ROLE-VIEWS-DESIGN.md §2). The primary axis of an address page: one tab per actor the
 * address actually is, opening onto that actor's merged summary box below. The active tab is filled
 * with its own entity tint — the same colour as its icon badge — so the strip reads as a control
 * even on touch, where hover can't do that work.
 *
 * Switching is a real navigation (`?as=`), so the server fetches only the selected role's data and
 * drops the previous role's `?tab=`/paging params. The tab bar *inside* a role view is a separate,
 * lower-level control and stays underline-styled.
 */
export function RoleSwitcher({ address, held, active }: { address: string; held: HeldRole[]; active: RoleId }) {
  if (held.length <= 1) return null;

  return (
    <nav className="rolerail" aria-label="On-chain roles">
      {held.map(({ meta, hint, externalHref }) => {
        const isActive = !externalHref && meta.id === active;
        const href = externalHref ?? `/account/${address}?as=${meta.id}`;
        const { color, tint } = ENTITY[meta.entity];
        return (
          <Link
            key={meta.id}
            href={href}
            className={`rolecard${isActive ? ' active' : ''}`}
            style={{ '--role-tint': tint, '--role-color': color } as CSSProperties}
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
