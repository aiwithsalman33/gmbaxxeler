# Storage decision

Current choice: the `pgsty/minio` community fork, pinned by digest in `docker-compose.yml`. To upgrade it, update the digest deliberately after reading the release notes.

The spec names MinIO. As of November 2026:

- `dl.min.io` returns `410 Gone` and says the open-source server is archived, with no security updates.
- `minio/minio` on Docker Hub and `quay.io/minio/minio` could not be pulled anonymously.

The app uses only the standard S3 API through `packages/storage`, so a replacement needs config changes and a migration of any stored images, not a rewrite.

## Options

| Option | For | Against |
|---|---|---|
| `pgsty/minio` community fork | Smallest change; intended as a drop-in replacement; project reports shipping security fixes | Small maintainer team; not affiliated with MinIO, Inc.; claims are mostly the project's own |
| Hosted S3, such as Cloudflare R2 | No storage server to patch; suits public image URLs | Leaves the "everything in Docker" setup; needs an account |
| Another self-hosted S3 server | Could suit long-term self-hosting | Not evaluated yet |

## Verified

Tested on a clean `docker compose up` with the pinned image:

- The bucket is created at startup and the storage healthcheck passes.
- The full test suite passes with `TEST_S3_URL=http://localhost:9000`.
- Anonymous visitors can read uploaded images. Listing, uploading and reading outside `public/` all return 403.
