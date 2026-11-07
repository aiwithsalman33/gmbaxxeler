import type { Knowledge } from "@localpilot/ai";
import type { Client } from "@localpilot/db";
import type { Deps } from "./context";

export async function loadKnowledge(deps: Deps, client: Client): Promise<Knowledge> {
  const profile = await deps.db.clientProfile.findUnique({ where: { clientId: client.id } });
  const snapshot = (profile?.gbpSnapshot ?? {}) as {
    title?: string;
    categories?: string[];
    address?: string | null;
    description?: string | null;
    services?: string[];
    serviceAreas?: string[];
  };
  const choose = (mine: string[] | undefined, google: string[] | undefined) => (mine?.length ? mine : (google ?? []));
  return {
    businessName: snapshot.title ?? client.name,
    categories: snapshot.categories ?? [],
    address: snapshot.address ?? client.address,
    description: profile?.description || snapshot.description || null,
    services: choose(profile?.services, snapshot.services),
    targetAreas: choose(profile?.targetAreas, snapshot.serviceAreas),
    usps: profile?.usps ?? [],
    tone: profile?.tone ?? null,
    strategy: profile?.strategy ?? null,
    competitors: profile?.competitors ?? [],
    keywords: profile?.keywords ?? [],
    dos: profile?.dos ?? [],
    donts: profile?.donts ?? [],
  };
}
