// Input clean-up shared by the explorer's search boxes (GlobalSearch, the Morse ArchiveSearch).
//
// A hash or address is rarely typed: it is pasted, and a paste brings company. Chat apps and some sites put
// zero-width characters into long strings so they can wrap, a copy across a line break brings a space, and a
// wallet may show an address in capitals. None of that can be part of a hash, address or height, so it is dropped
// before the value is recognized. Free text (a service name) keeps its spaces.

/** Whitespace and the invisible characters a copy can carry: soft hyphen, zero-width space/joiners, word joiner, BOM. */
const INVISIBLE = /[\s­​-‍⁠﻿]/g;

/** The query with every space and invisible character removed: the form a hash, address or height is matched in. */
export function compactQuery(raw: string): string {
  return raw.replace(INVISIBLE, '');
}

/** True when the query is a shortened display value ("68FCE8…AA56"), which no lookup can resolve. */
export function isShortened(raw: string): boolean {
  return raw.includes('…') || raw.includes('...');
}

/** A block height as shown on the site ("991,683") or typed ("991683"): its digits, or null. */
export function heightDigits(compact: string): string | null {
  return /^\d{1,3}(,\d{3})+$/.test(compact) || /^\d+$/.test(compact) ? compact.replace(/,/g, '') : null;
}

// ---- lookahead suggestions (resolved by /api/search, rendered by GlobalSearch) ----

/** Icon tint of a suggestion row: an entity of the icon registry, or the Morse archive. */
export type SuggestionIcon = 'block' | 'tx' | 'account' | 'validator' | 'service' | 'supplier' | 'application' | 'gateway' | 'morse';

/** One clickable view a query resolves to. */
export interface Suggestion {
  label: string;
  /** One-glance detail ("3 services", "MsgSend · success"). */
  hint?: string;
  /** In-app path. Network-relative unless `absolute` (the Morse archive is not under a network prefix). */
  href: string;
  absolute?: boolean;
  icon: SuggestionIcon;
}

/** Suggestions under one heading, e.g. the views of one address. */
export interface SuggestionGroup {
  heading: string;
  items: Suggestion[];
}

export interface SearchSuggestions {
  groups: SuggestionGroup[];
  /** Shown when the query resolved to nothing. */
  note?: string;
}
