import { notificationSettingsSchema, openaiSettingsSchema } from "@localpilot/contracts";
import { DEFAULT_VISION_MODEL, listModels, OpenAiError } from "@localpilot/ai";
import { decryptSecret, encryptSecret } from "@localpilot/crypto";
import { DEFAULT_PRICES, deliverAlert } from "@localpilot/services";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ApiError, type AppContext } from "../context";

const USAGE_DAYS = 30;

export function settingsRoutes(ctx: AppContext) {
  const { db, deps } = ctx;

  function requireOwner(request: FastifyRequest): void {
    if (request.auth.role !== "owner") throw new ApiError(403, "forbidden", "Only the owner can change this");
  }

  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();

    app.get("/settings/openai", async (request) => {
      const settings = await db.openaiSettings.findUnique({ where: { workspaceId: request.auth.workspaceId } });
      return {
        connected: Boolean(settings),
        maskedKey: settings ? `sk-...${settings.keyLast4}` : null,
        visionModel: settings?.visionModel ?? DEFAULT_VISION_MODEL,
        inputPricePerM: settings?.inputPricePerM ?? DEFAULT_PRICES.inputPricePerM,
        outputPricePerM: settings?.outputPricePerM ?? DEFAULT_PRICES.outputPricePerM,
      };
    });

    app.put("/settings/openai", { schema: { body: openaiSettingsSchema } }, async (request) => {
      requireOwner(request);
      const { workspaceId } = request.auth;
      const { apiKey, ...rest } = request.body;
      const existing = await db.openaiSettings.findUnique({ where: { workspaceId } });
      if (!apiKey && !existing) throw new ApiError(400, "missing_key", "Enter an API key");
      const secret = apiKey ? { apiKeyEnc: encryptSecret(apiKey, deps.encryptionKey), keyLast4: apiKey.slice(-4) } : {};
      await db.openaiSettings.upsert({
        where: { workspaceId },
        create: { workspaceId, ...DEFAULT_PRICES, apiKeyEnc: "", keyLast4: "", ...rest, ...secret },
        update: { ...rest, ...secret },
      });
      await db.auditLog.create({
        data: { workspaceId, actorId: request.auth.userId, action: "openai.updated", entity: "openai_settings" },
      });
      return { ok: true };
    });

    app.delete("/settings/openai", async (request) => {
      requireOwner(request);
      await db.openaiSettings.deleteMany({ where: { workspaceId: request.auth.workspaceId } });
      return { ok: true };
    });

    app.post("/settings/openai/test", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
      const settings = await db.openaiSettings.findUnique({ where: { workspaceId: request.auth.workspaceId } });
      if (!settings) throw new ApiError(400, "missing_key", "Save an API key first");
      if (deps.aiAdapter === "mock") return { ok: true, models: [settings.visionModel] };
      try {
        return { ok: true, models: await listModels(decryptSecret(settings.apiKeyEnc, deps.encryptionKey)) };
      } catch (error) {
        if (error instanceof OpenAiError) return { ok: false, models: [], error: error.message };
        throw error;
      }
    });

    app.get("/settings/notifications", async (request) => {
      const settings = await db.notificationSettings.findUnique({ where: { workspaceId: request.auth.workspaceId } });
      return settings ?? { emails: [], webhookUrl: null, webhookKind: "generic", webhookChatId: null };
    });

    app.put("/settings/notifications", { schema: { body: notificationSettingsSchema } }, async (request) => {
      requireOwner(request);
      const { workspaceId } = request.auth;
      const { body } = request;
      return db.notificationSettings.upsert({ where: { workspaceId }, create: { workspaceId, ...body }, update: body });
    });

    app.post("/settings/notifications/test", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request) => {
      await deliverAlert(deps, { workspaceId: request.auth.workspaceId, clientId: null, type: "settings.test", title: "LocalPilot test alert", body: "Alerts are working." });
      return { ok: true };
    });

    app.get("/settings/openai/usage", async (request) => {
      const { workspaceId } = request.auth;
      const since = new Date(Date.now() - USAGE_DAYS * 86_400_000);
      const rows = await db.aiUsage.groupBy({
        by: ["clientId"],
        where: { workspaceId, createdAt: { gte: since } },
        _sum: { estCost: true, inputTokens: true, outputTokens: true },
        _count: true,
      });
      const clients = await db.client.findMany({
        where: { workspaceId, id: { in: rows.map((row) => row.clientId) } },
        select: { id: true, name: true },
      });
      const names = new Map(clients.map((client) => [client.id, client.name]));
      return {
        days: USAGE_DAYS,
        clients: rows.map((row) => ({
          clientId: row.clientId,
          name: names.get(row.clientId) ?? "Removed client",
          calls: row._count,
          inputTokens: row._sum.inputTokens ?? 0,
          outputTokens: row._sum.outputTokens ?? 0,
          estCost: row._sum.estCost ?? 0,
        })),
      };
    });
  };
}
