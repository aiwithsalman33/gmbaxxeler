# Deploying LocalPilot with Dokploy and Caddy

Written for whoever runs the server. Dokploy handles the domain and HTTPS. Caddy, inside the stack, routes `gmb.axxeler.in` to the app.

```text
Internet -> Dokploy (TLS) -> caddy:8080 -> /api/*        -> api:4000
                                           /media/*      -> minio:9000 (public images only)
                                           everything else -> web:3000
```

Only `caddy` is reachable from outside. `web`, `api`, `worker`, `postgres` and `minio` publish no ports, and the MinIO console is off.

## Before you start

- A server with Dokploy installed, at least 4 GB of RAM and 40 GB of disk.
- `gmb.axxeler.in` pointing at the server.
- A Google App Password for `aiwithsalman33@gmail.com`. Google requires 2-Step Verification on the account before you can create one.
- An OpenAI API key.

## 1. Create the Compose app

1. In Dokploy, create a project, then add a **Compose** service.
2. Point it at this repository's `main` branch.
3. Set the compose path to `docker-compose.prod.yml`.

`docker-compose.override.yml` is for local use and publishes ports. Confirm your Dokploy deploy command names `docker-compose.yml` with `-f`, so the override isn't loaded. You can check this under the service's deployment logs.

## 2. Set environment variables

Generate four secrets on any machine, running this once for each of `JWT_SECRET`, `ENCRYPTION_KEY`, `POSTGRES_PASSWORD` and `MINIO_SECRET_KEY`:

```sh
openssl rand -hex 32
```

Back up `ENCRYPTION_KEY` somewhere safe. Stored Google tokens and OpenAI keys can't be read without it.

Paste this into the **Environment** tab with your values:

Required:

```env
APP_URL=https://gmb.axxeler.in
JWT_SECRET=<generated>
ENCRYPTION_KEY=<generated>
SIGNUP_ALLOWED_EMAILS=<your email>
SEED_ADMIN_EMAIL=<your email>
SEED_ADMIN_PASSWORD=<a strong password>
```

Generate each secret with `openssl rand -hex 32`.

Postgres and MinIO run inside Docker, so you don't need to set anything for them. Neither publishes a port, and Caddy only serves public images from MinIO, read-only. The compose file builds the database connection itself. If you do set `POSTGRES_PASSWORD` or `MINIO_SECRET_KEY`, keep the same value afterwards, because each volume keeps the one it first started with. Use hex for `POSTGRES_PASSWORD`, because characters like `@ : / # ?` break the database URL.

Set the Gmail that holds Manager access to your clients' profiles:

```env
AGENCY_GOOGLE_EMAIL=<your agency Gmail>
```

Remove `GBP_ADAPTER=mock`, `AI_ADAPTER=mock` and `MOCK_SAMPLE_DATA` if an older setup added them. Production ignores them and always uses real Google and OpenAI.

Optional, and needed to send email:

```env
MAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=aiwithsalman33@gmail.com
SMTP_PASS=<Google App Password>
MAIL_FROM="LocalPilot <aiwithsalman33@gmail.com>"
MAIL_DAILY_CAP=300
```

The API won't start in production without the required values or with development secrets. Google, SMTP and OpenAI settings aren't needed to start. `API_URL` and `PUBLIC_MEDIA_URL` follow `APP_URL` unless you set them.

Without SMTP, email is off. Signing in with the seeded account works, but password resets, invites and verification emails can't be sent, and those attempts show as failed in the mail log.

On every start the API removes anything an earlier mock setup left behind: sample businesses, the fake Google connection, simulated posts and photos, mock AI drafts, and invented reviews and metrics. Clients you typed in are kept and go back to waiting until they're connected to their real profile. The startup log says what was removed.

Save an OpenAI key in Account Settings so SEO posts and review replies can be written.

`SEED_ADMIN_*` creates a verified owner on first start, so you can log in before email is confirmed working. It never changes an existing account. You can clear the password from Dokploy after your first login.

## 3. Set the domain

In the **Domains** tab, add:

| Field | Value |
|---|---|
| Host | `gmb.axxeler.in` |
| Service | `caddy` |
| Container port | `8080` |
| HTTPS | On |

## 4. Deploy and check

Deploy, then confirm:

```sh
curl https://gmb.axxeler.in/api/health
# {"status":"ok","checks":{"database":true,"storage":true}}
```

Then:

1. Open `https://gmb.axxeler.in` and log in.
2. In **Account Settings > Alerts**, choose **Send test email**.
3. Upload an image in **Library**, and check its address starts with `https://gmb.axxeler.in/media/`.

If the health check gets a 502, or requests from the same IP lock out unrelated users, check `TRUST_PROXY_HOPS`. It should equal the number of proxies in front of the API.

## 5. Connect real Google

Google login works as soon as credentials are set. Business Profile access needs Google's approval first.

1. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, or enter them in Settings > Google.
2. Add both redirect URIs shown in Settings > Google to your OAuth client.
3. Add `axxeler@gmail.com` and `baranikumargd2@gmail.com` as Test users.
4. In Google Cloud, enable My Business Account Management API, My Business Business Information API, Business Profile Performance API and Google My Business API. Business Profile calls fail with a zero quota until Google approves API access for the project; Settings > Google then shows "API access: not approved".
5. In Settings > Google, connect your agency Gmail. Every account and location it manages is listed, and waiting clients with a matching phone or business name connect by themselves.

Test with one real profile first: one photo, one post and one review reply.

## Prebuilt images

The server shouldn't build anything. See "Deploying prebuilt images" in the [README](../README.md) for setup, redeploying and rolling back.

## Backups

The `backup` service writes a compressed dump to the `backups` volume once a day and keeps the newest 14 (`BACKUP_KEEP`).

```sh
docker compose exec backup ls -lh /backups               # list backups
docker compose exec backup sh /usr/local/bin/backup.sh   # back up now
sh scripts/restore.sh localpilot-20260101-020000.sql.gz  # restore
```

Backups stay on the server, so copy them somewhere else too.

## Upgrades

- Migrations run automatically when the API starts.
- Back up before upgrading.
- The MinIO image is a community fork pinned by digest. Read its release notes before changing the digest. See [storage-decision.md](storage-decision.md).
