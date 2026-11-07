import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** Test double for the few S3 calls Storage makes. It does not enforce bucket policies. */
export async function startFakeS3(): Promise<{ url: string; server: Server }> {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  const server = createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0]!;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const isObject = path.split("/").filter(Boolean).length > 1;
      if (!isObject) {
        response.writeHead(200).end();
      } else if (request.method === "PUT" && request.headers["x-amz-copy-source"]) {
        const source = objects.get(`/${String(request.headers["x-amz-copy-source"]).replace(/^\//, "")}`);
        if (!source) return void response.writeHead(404).end();
        objects.set(path, source);
        response.writeHead(200, { "content-type": "application/xml" }).end('<CopyObjectResult><ETag>"fake"</ETag></CopyObjectResult>');
      } else if (request.method === "PUT") {
        objects.set(path, { body: Buffer.concat(chunks), contentType: request.headers["content-type"] ?? "application/octet-stream" });
        response.writeHead(200, { etag: '"fake"' }).end();
      } else if (request.method === "DELETE") {
        objects.delete(path);
        response.writeHead(204).end();
      } else {
        const object = objects.get(path);
        if (!object) response.writeHead(404).end();
        else response.writeHead(200, { "content-type": object.contentType }).end(object.body);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}
