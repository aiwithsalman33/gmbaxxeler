import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { LIBRARY_LIMITS } from "@localpilot/contracts";
import { ConnectError } from "@localpilot/services";
import { GbpError } from "@localpilot/gbp";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { ApiError, type AppContext } from "./context";
import { requireAuth } from "./guards";
import { adminRoutes } from "./modules/admin";
import { authRoutes } from "./modules/auth";
import { clientRoutes } from "./modules/clients";
import { dashboardRoutes } from "./modules/dashboard";
import { devRoutes } from "./modules/dev";
import { googleRoutes } from "./modules/google";
import { googleCredentialRoutes } from "./modules/google-credentials";
import { googleLoginRoutes } from "./modules/google-login";
import { healthRoutes } from "./modules/health";
import { inviteRoutes } from "./modules/invites";
import { libraryRoutes } from "./modules/library";
import { mailRoutes } from "./modules/mail";
import { knowledgeRoutes } from "./modules/knowledge";
import { notificationRoutes } from "./modules/notifications";
import { photoRoutes } from "./modules/photos";
import { postRoutes } from "./modules/posts";
import { reviewRoutes } from "./modules/reviews";
import { settingsRoutes } from "./modules/settings";
import { teamInviteRoutes } from "./modules/team-invites";
import { workspaceRoutes } from "./modules/workspaces";

const CONNECT_STATUS: Record<ConnectError["code"], number> = {
  no_connection: 409,
  location_not_found: 404,
  not_pending: 409,
};

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      ctx.env.APP_ENV === "test"
        ? false
        : {
            redact: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'],
            serializers: {
              // Query strings can hold OAuth codes and invite tokens, so they stay out of logs.
              req: (request) => ({ method: request.method, url: request.url.split("?")[0] }),
            },
          },
    // A count, not true: true would let a client fake its IP and dodge rate limits.
    trustProxy: (_address: string, hop: number) => hop < ctx.env.TRUST_PROXY_HOPS,
    bodyLimit: 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof ConnectError) {
      return reply.status(CONNECT_STATUS[error.code]).send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof GbpError) {
      request.log.warn({ kind: error.kind }, "google call failed");
      const status = error.kind === "rate_limited" ? 429 : error.kind === "quota_zero" || error.kind === "not_configured" ? 503 : 502;
      return reply.status(status).send({ error: { code: `google_${error.kind}`, message: error.message } });
    }
    if (error.validation) {
      return reply.status(400).send({ error: { code: "invalid_input", message: error.message } });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({ error: { code: error.code ?? "bad_request", message: error.message } });
    }
    request.log.error({ err: { message: error.message, stack: error.stack } }, "unhandled error");
    return reply.status(500).send({ error: { code: "internal_error", message: "Something went wrong" } });
  });

  await app.register(helmet, { crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: false });
  await app.register(cors, { origin: new URL(ctx.env.APP_URL).origin, credentials: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: ctx.env.RATE_LIMIT_MAX, timeWindow: "1 minute" });
  await app.register(multipart, {
    throwFileSizeLimit: false,
    limits: { fileSize: LIBRARY_LIMITS.maxBytes + 1, files: 50 },
  });
  await app.register(swagger, {
    openapi: { info: { title: "LocalPilot API", version: "0.1.0" } },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/api/docs" });

  await app.register(healthRoutes(ctx));
  await app.register(healthRoutes(ctx), { prefix: "/api" });
  await app.register(
    async (api) => {
      await api.register(authRoutes(ctx), { prefix: "/auth" });
      await api.register(googleLoginRoutes(ctx), { prefix: "/auth" });
      await api.register(googleRoutes(ctx), { prefix: "/google" });
      if (ctx.env.ENABLE_CLIENT_OAUTH_LINKS) await api.register(inviteRoutes(ctx));
      await api.register(teamInviteRoutes(ctx));
      await api.register(async (secured) => {
        secured.addHook("preHandler", requireAuth(ctx));
        await secured.register(workspaceRoutes(ctx));
        await secured.register(clientRoutes(ctx));
        await secured.register(dashboardRoutes(ctx));
        await secured.register(libraryRoutes(ctx));
        await secured.register(notificationRoutes(ctx));
        await secured.register(photoRoutes(ctx));
        await secured.register(knowledgeRoutes(ctx));
        await secured.register(postRoutes(ctx));
        await secured.register(reviewRoutes(ctx));
        await secured.register(settingsRoutes(ctx));
        await secured.register(mailRoutes(ctx));
        await secured.register(googleCredentialRoutes(ctx));
        await secured.register(adminRoutes(ctx));
        await secured.register(devRoutes(ctx));
      });
    },
    { prefix: "/api/v1" },
  );
  return app;
}
