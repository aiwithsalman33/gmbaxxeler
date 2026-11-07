const NAME_THRESHOLD = 0.88;
const ADDRESS_THRESHOLD = 0.8;
const ADDRESS_CONFLICT = 0.35;

const NAME_NOISE = new Set(["the", "and", "pvt", "ltd", "llc", "inc", "private", "limited", "co", "company"]);

export interface PendingClient {
  id: string;
  name: string;
  contactPhone?: string | null;
  address?: string | null;
}

export interface InvitationCandidate {
  locationName?: string | null;
  address?: string | null;
}

export interface LocationCandidate {
  title: string;
  phone?: string | null;
  address?: string | null;
}

export type MatchMethodName = "auto_name" | "auto_address" | "auto_phone";

export type MatchResult =
  | { kind: "match"; clientId: string; score: number; method: MatchMethodName; reason: string }
  | { kind: "suggest"; clientId: string; reason: string }
  | { kind: "ambiguous"; clientIds: string[]; reason: string }
  | { kind: "none"; reason: string };

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeName(value: string): string {
  return normalizeText(value)
    .split(" ")
    .filter((token) => !NAME_NOISE.has(token))
    .join(" ");
}

/** Compares the national part only, so +91 98765 43210 equals 098765 43210. */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").slice(-10);
}

function bigrams(value: string): Map<string, number> {
  const grams = new Map<string, number>();
  const compact = value.replace(/\s+/g, "");
  for (let i = 0; i < compact.length - 1; i++) {
    const gram = compact.slice(i, i + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

/** Sorensen-Dice coefficient over character bigrams, from 0 to 1. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const left = bigrams(a);
  const right = bigrams(b);
  let overlap = 0;
  for (const [gram, count] of left) overlap += Math.min(count, right.get(gram) ?? 0);
  const total = [...left.values(), ...right.values()].reduce((sum, n) => sum + n, 0);
  return total === 0 ? 0 : (2 * overlap) / total;
}

interface Scored {
  client: PendingClient;
  nameMatches: boolean;
  addressMatches: boolean;
  score: number;
}

/** A matching name at a clearly different address is another branch, so it's dropped. */
function score(client: PendingClient, name: string | null | undefined, address: string | null | undefined): Scored | null {
  const nameScore = name ? similarity(normalizeName(name), normalizeName(client.name)) : 0;
  const hasBothAddresses = Boolean(address && client.address);
  const addressScore = hasBothAddresses ? similarity(normalizeText(address!), normalizeText(client.address!)) : 0;
  if (hasBothAddresses && addressScore < ADDRESS_CONFLICT) return null;
  const nameMatches = nameScore >= NAME_THRESHOLD;
  const addressMatches = addressScore >= ADDRESS_THRESHOLD;
  return nameMatches || addressMatches ? { client, nameMatches, addressMatches, score: Math.min(nameScore, addressScore || nameScore) } : null;
}

function confident(scored: Scored[]): MatchResult | null {
  const both = scored.filter((item) => item.nameMatches && item.addressMatches);
  if (both.length > 1) return { kind: "ambiguous", clientIds: both.map((item) => item.client.id), reason: `${both.length} pending clients match equally well` };
  const [only] = both;
  if (!only) return null;
  return { kind: "match", clientId: only.client.id, score: only.score, method: "auto_name", reason: `Name and address match "${only.client.name}"` };
}

/**
 * Runs before accepting. Google's Invitation carries no phone number, so only
 * name and address can be compared. Auto-accept needs both. A wrong business
 * must never connect by itself, so a partial match is only ever a suggestion.
 */
export function matchInvitation(invitation: InvitationCandidate, clients: PendingClient[]): MatchResult {
  const scored = clients.flatMap((client) => score(client, invitation.locationName, invitation.address) ?? []);
  const sure = confident(scored);
  if (sure) return sure;
  if (scored.length === 0) return { kind: "none", reason: "No pending client matches" };
  if (scored.length > 1) return { kind: "ambiguous", clientIds: scored.map((item) => item.client.id), reason: `${scored.length} pending clients could match` };
  const [only] = scored as [Scored];
  const part = only.nameMatches ? "Name matches" : "Address matches";
  return { kind: "suggest", clientId: only.client.id, reason: `${part} "${only.client.name}", but it needs both to connect by itself` };
}

/** Runs once a location is accessible. An exact phone match counts, as does name and address. */
export function matchLocation(location: LocationCandidate, clients: PendingClient[]): MatchResult {
  const phone = location.phone ? normalizePhone(location.phone) : "";
  const byPhone = phone ? clients.filter((client) => client.contactPhone && normalizePhone(client.contactPhone) === phone) : [];
  if (byPhone.length > 1) return { kind: "ambiguous", clientIds: byPhone.map((client) => client.id), reason: "Several clients share this phone number" };
  const [phoneMatch] = byPhone;
  if (phoneMatch) return { kind: "match", clientId: phoneMatch.id, score: 1, method: "auto_phone", reason: `Phone matches "${phoneMatch.name}"` };
  return confident(clients.flatMap((client) => score(client, location.title, location.address) ?? [])) ?? { kind: "none", reason: "No pending client matches" };
}
