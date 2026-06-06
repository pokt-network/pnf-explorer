import type { CSSProperties } from 'react';

type IconProps = { size?: number; stroke?: string; className?: string };

function svg(children: React.ReactNode, { size = 22, stroke = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

export const BlockIcon = (p: IconProps) =>
  svg(<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>, p);

export const TxIcon = (p: IconProps) =>
  svg(<><path d="M21 12a9 9 0 1 1-9-9" /><path d="M7 17l9-9M16 8H8M16 8v8" /></>, p);

export const AccountIcon = (p: IconProps) =>
  svg(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>, p);

export const ValidatorIcon = (p: IconProps) =>
  svg(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></>, p);

export const ParamsIcon = (p: IconProps) =>
  svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>, p);

export const InfoIcon = (p: IconProps) =>
  svg(<><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="16" x2="12.01" y2="16" /></>, p);

export const SearchIcon = (p: IconProps) =>
  svg(<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>, p);

// ---- entity accent + tic badge ----
export type Entity = 'block' | 'tx' | 'account' | 'validator' | 'params';

export const ENTITY: Record<Entity, { color: string; tint: string; Icon: (p: IconProps) => React.ReactElement }> = {
  block: { color: 'var(--blue-soft)', tint: 'rgba(2,90,242,.12)', Icon: BlockIcon },
  tx: { color: 'var(--gold)', tint: 'rgba(255,197,71,.14)', Icon: TxIcon },
  account: { color: 'var(--blue-soft)', tint: 'rgba(2,90,242,.12)', Icon: AccountIcon },
  validator: { color: 'var(--lavender)', tint: 'rgba(184,184,255,.14)', Icon: ValidatorIcon },
  params: { color: 'var(--mint)', tint: 'rgba(72,229,194,.12)', Icon: ParamsIcon },
};

/**
 * Colored rounded-square entity badge (`.tic`). Outer dimensions come from the parent
 * context (`.listhead .tic` = 40px, `.pagetitle .tic` = 46px); `iconSize` tunes the glyph.
 */
export function Tic({ entity, iconSize = 22, style }: { entity: Entity; iconSize?: number; style?: CSSProperties }) {
  const { color, tint, Icon } = ENTITY[entity];
  return (
    <div className="tic" style={{ background: tint, ...style }}>
      <Icon size={iconSize} stroke={color} />
    </div>
  );
}
