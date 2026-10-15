// Bech32 (BIP-173) re-encoding: the same key bytes under another human-readable prefix. A validator's operator
// address (poktvaloper1…) and its account address (pokt1…) carry the same bytes, so the account is derived here
// instead of read (checked on every validator, 39 on mainnet and 8 on beta, 2026-10-15).

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GENERATOR[i];
  }
  return chk >>> 0;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (const c of hrp) out.push(c.charCodeAt(0) >>> 5);
  out.push(0);
  for (const c of hrp) out.push(c.charCodeAt(0) & 31);
  return out;
}

/** `address` re-encoded under `hrp`; null when it is not a valid lowercase bech32 string. */
export function withPrefix(address: string, hrp: string): string | null {
  const sep = address.lastIndexOf('1');
  if (sep < 1 || address !== address.toLowerCase()) return null;
  const words: number[] = [];
  for (const c of address.slice(sep + 1)) {
    const v = CHARSET.indexOf(c);
    if (v < 0) return null;
    words.push(v);
  }
  if (words.length < 7 || polymod([...hrpExpand(address.slice(0, sep)), ...words]) !== 1) return null;
  const data = words.slice(0, -6);
  const mod = polymod([...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, i) => (mod >>> (5 * (5 - i))) & 31);
  return hrp + '1' + [...data, ...checksum].map((v) => CHARSET[v]).join('');
}
