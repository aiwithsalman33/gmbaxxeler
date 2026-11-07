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
  clientId: string;
  score: number;
  method: MatchMethodName;
  reason: string;
}

function resolve(scored: Scored[]): MatchResult {
  if (scored.length === 0) return { kind: "none", reason: "No pending client matches" };
  if (scored.length > 1) {
    return {
      kind: "ambiguous",
      clientIds: scored.map((s) => s.clientId),
      reason: `${scored.length} pending clients match equally well`,
    };
  }
  const [only] = scored as [Scored];
  return { kind: "match", ...only };
}

function scoreNameAndAddress(
  client: PendingClient,
  name: string | null | undefined,
  address: string | null | undefined,
): Scored | null {
  const nameScore = name ? similarity(normalizeName(name), normalizeName(client.name)) : 0;
  const hasBothAddresses = Boolean(address && client.address);
  const addressScore = hasBothAddresses ? similarity(normalizeText(address!), normalizeText(client.address!)) : 0;

  // Same chain name at a different address is another branch, not this client.
  if (hasBothAddresses && addressScore < ADDRESS_CONFLICT) return null;
  if (nameScore >= NAME_THRESHOLD) {
    return { clientId: client.id, score: nameScore, method: "auto_name", reason: `Business name matches "${client.name}"` };
  }
  if (addressScore >= ADDRESS_THRESHOLD) {
    return { clientId: client.id, score: addressScore, method: "auto_address", reason: `Address matches "${client.name}"` };
  }
  return null;
}

/**
 * Runs before accepting. Google's Invitation carries no phone number, so only
 * name and address can be compared at this stage.
 */
export function matchInvitation(invitation: InvitationCandidate, clients: PendingClient[]): MatchResult {
  const scored = clients.flatMap((c) => scoreNameAndAddress(c, invitation.locationName, invitation.address) ?? []);
  return resolve(scored);
}

/** Runs once a location is accessible. A phone match outranks name and address. */
export function matchLocation(location: LocationCandidate, clients: PendingClient[]): MatchResult {
  const phone = location.phone ? normalizePhone(location.phone) : "";
  const byPhone = phone
    ? clients.filter((c) => c.contactPhone && normalizePhone(c.contactPhone) === phone)
    : [];
  if (byPhone.length > 0) {
    return resolve(
      byPhone.map((c) => ({ clientId: c.id, score: 1, method: "auto_phone", reason: `Phone matches "${c.name}"` })),
    );
  }
  return resolve(clients.flatMap((c) => scoreNameAndAddress(c, location.title, location.address) ?? []));
}
