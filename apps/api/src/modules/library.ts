import { randomUUID } from "node:crypto";
import { bulkMoveSchema, folderKindSchema, LIBRARY_LIMITS, updateImageSchema } from "@localpilot/contracts";
import { sha256 } from "@localpilot/crypto";
import type { Client, FolderKind } from "@localpilot/db";
import { ensureFolders } from "@localpilot/services";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { imageSize } from "image-size";
import { z } from "zod";
import { ApiError, type AppContext } from "../context";
import { scopedClient } from "../guards";

const clientParams = z.object({ id: z.string().uuid() });
const imageParams = z.object({ id: z.string().uuid(), imageId: z.string().uuid() });
const FORMATS: Record<string, { mime: string; ext: string }> = {
  jpg: { mime: "image/jpeg", ext: "jpg" },
  png: { mime: "image/png", ext: "png" },
};

interface Inspected {
  mime: string;
  ext: string;
  width: number;
  height: number;
}

/** Trusts the file's bytes, not its name or the browser's content type. */
export function inspectImage(buffer: Buffer): Inspected | string {
  if (buffer.length < LIBRARY_LIMITS.minBytes) return "Image is under 10 KB";
  if (buffer.length > LIBRARY_LIMITS.maxBytes) return "Image is over 5 MB";
  let size: ReturnType<typeof imageSize>;
  try {
    size = imageSize(buffer);
  } catch {
    return "Only JPG and PNG images are allowed";
  }
  const format = size.type ? FORMATS[size.type] : undefined;
  if (!format) return "Only JPG and PNG images are allowed";
  if (size.width < LIBRARY_LIMITS.minDimension || size.height < LIBRARY_LIMITS.minDimension) {
    return "Image must be at least 250x250 pixels";
  }
  return { ...format, width: size.width, height: size.height };
}

export function libraryRoutes(ctx: AppContext) {
  const { db, deps, storage } = ctx;

  async function folderFor(client: Client, kind: FolderKind) {
    await ensureFolders(deps, client);
    return db.libraryFolder.findUniqueOrThrow({ where: { clientId_kind: { clientId: client.id, kind } } });
  }

  /** Upcoming jobs pick another image when they run. */
  function releaseImages(ids: string[]) {
    return db.scheduledJob.updateMany({ where: { imageId: { in: ids }, status: "scheduled", post: null }, data: { imageId: null } });
  }

  return async (base: FastifyInstance) => {
    const app = base.withTypeProvider<ZodTypeProvider>();

    app.get(
      "/clients/:id/library/images",
      { schema: { params: clientParams, querystring: z.object({ folder: folderKindSchema.default("photos") }) } },
      async (request) => {
        const client = await scopedClient(ctx, request, request.params.id);
        const folder = await folderFor(client, request.query.folder);
        const [images, counts] = await Promise.all([
          db.libraryImage.findMany({
            where: { workspaceId: client.workspaceId, clientId: client.id, folderId: folder.id, deletedAt: null },
            orderBy: { createdAt: "desc" },
          }),
          db.libraryImage.groupBy({
            by: ["folderId"],
            where: { clientId: client.id, deletedAt: null },
            _count: true,
          }),
        ]);
        return { folder: folder.kind, images, currentFolderCount: counts.find((c) => c.folderId === folder.id)?._count ?? 0 };
      },
    );

    app.post(
      "/clients/:id/library/images",
      { schema: { params: clientParams, querystring: z.object({ folder: folderKindSchema.default("photos") }) } },
      async (request, reply) => {
        const client = await scopedClient(ctx, request, request.params.id);
        const folder = await folderFor(client, request.query.folder);
        const results: { name: string; ok: boolean; error?: string; image?: unknown }[] = [];

        for await (const part of request.files()) {
          const buffer = await part.toBuffer();
          const name = part.filename.slice(0, 200);
          const inspected = part.file.truncated ? "Image is over 5 MB" : inspectImage(buffer);
          if (typeof inspected === "string") {
            results.push({ name, ok: false, error: inspected });
            continue;
          }
          const hash = sha256(buffer);
          const duplicate = await db.libraryImage.findFirst({ where: { clientId: client.id, sha256: hash, deletedAt: null }, select: { id: true } });
          if (duplicate) {
            results.push({ name, ok: false, error: "This image is already in the library" });
            continue;
          }
          const key = storage.publicKey(`${client.id}/${randomUUID()}.${inspected.ext}`);
          await storage.put(key, buffer, inspected.mime);
          const image = await db.libraryImage.create({
            data: {
              workspaceId: client.workspaceId,
              clientId: client.id,
              folderId: folder.id,
              storageKey: key,
              publicUrl: storage.publicUrl(key),
              originalName: name,
              mime: inspected.mime,
              bytes: buffer.length,
              width: inspected.width,
              height: inspected.height,
              sha256: hash,
            },
          });
          results.push({ name, ok: true, image });
        }
        return reply.status(results.some((r) => r.ok) ? 201 : 400).send({ results });
      },
    );

    app.patch("/clients/:id/library/images/:imageId", { schema: { params: imageParams, body: updateImageSchema } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const { tags, folder } = request.body;
      const target = folder ? await folderFor(client, folder) : null;
      const { count } = await db.libraryImage.updateMany({
        where: { id: request.params.imageId, workspaceId: client.workspaceId, clientId: client.id, deletedAt: null },
        data: { ...(tags ? { tags } : {}), ...(target ? { folderId: target.id } : {}) },
      });
      if (count === 0) throw new ApiError(404, "image_not_found", "Image not found");
      if (folder) await releaseImages([request.params.imageId]);
      return { ok: true };
    });

    app.delete("/clients/:id/library/images/:imageId", { schema: { params: imageParams } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const image = await db.libraryImage.findFirst({
        where: { id: request.params.imageId, workspaceId: client.workspaceId, clientId: client.id, deletedAt: null },
      });
      if (!image) throw new ApiError(404, "image_not_found", "Image not found");
      await db.libraryImage.update({ where: { id: image.id }, data: { deletedAt: new Date() } });
      await releaseImages([image.id]);
      await storage.remove(image.storageKey);
      return { ok: true };
    });

    app.post("/clients/:id/library/images/bulk-move", { schema: { params: clientParams, body: bulkMoveSchema } }, async (request) => {
      const client = await scopedClient(ctx, request, request.params.id);
      const folder = await folderFor(client, request.body.folder);
      const { count } = await db.libraryImage.updateMany({
        where: { id: { in: request.body.ids }, workspaceId: client.workspaceId, clientId: client.id, deletedAt: null },
        data: { folderId: folder.id },
      });
      await releaseImages(request.body.ids);
      return { moved: count };
    });
  };
}
