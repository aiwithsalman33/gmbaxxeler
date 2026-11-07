import { MockAiClient, OpenAiClient, type AiClient, type AiUsageInfo } from "@localpilot/ai";
import { decryptSecret } from "@localpilot/crypto";
import type { Deps } from "./context";

export const DEFAULT_PRICES = { inputPricePerM: 0.15, outputPricePerM: 0.6 };

interface AiHandle {
  client: AiClient;
  inputPricePerM: number;
  outputPricePerM: number;
}

export async function aiClientFor(deps: Deps, workspaceId: string): Promise<AiHandle | null> {
  const settings = await deps.db.openaiSettings.findUnique({ where: { workspaceId } });
  if (settings) {
    const key = decryptSecret(settings.apiKeyEnc, deps.encryptionKey);
    return {
      client: deps.aiAdapter === "mock" ? new MockAiClient() : new OpenAiClient(key, settings.visionModel),
      inputPricePerM: settings.inputPricePerM,
      outputPricePerM: settings.outputPricePerM,
    };
  }
  if (deps.aiAdapter === "mock") return { client: new MockAiClient(), ...DEFAULT_PRICES };
  return null;
}

export async function recordUsage(
  deps: Deps,
  handle: AiHandle,
  input: { workspaceId: string; clientId: string; feature: string; result: AiUsageInfo },
): Promise<void> {
  const { result } = input;
  await deps.db.aiUsage.create({
    data: {
      workspaceId: input.workspaceId,
      clientId: input.clientId,
      feature: input.feature,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estCost: (result.inputTokens * handle.inputPricePerM + result.outputTokens * handle.outputPricePerM) / 1_000_000,
    },
  });
}
