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
3. Set the compose path to `docker-compose.yml`.

`docker-compose.override.yml` is for local use and publishes ports. Confirm your Dokploy deploy command names `docker-compose.yml` with `-f`, so the override isn't loaded. You can check this under the service's deployment logs.

## 2. Set environment variables

Generate four secrets on any machine, running this once for each of `JWT_SECRET`, `ENCRYPTION_KEY`, `POSTGRES_PASSWORD` and `MINIO_SECRET_KEY`:

```sh
openssl rand -hex 32
```

Back up `ENCRYPTION_KEY` somewhere safe. Stored Google tokens and OpenAI keys can't be read without it.

Paste this into the **Environment** tab with your values:

```env
APP_ENV=production
APP_URL=https://gmb.axxeler.in
API_URL=https://gmb.axxeler.in/api
PUBLIC_MEDIA_URL=https://gmb.axxeler.in/media
TRUST_PROXY_HOPS=2

POSTGRES_PASSWORD=<generated>
JWT_SECRET=<generated>
ENCRYPTION_KEY=<generated>
MINIO_ACCESS_KEY=localpilot
MINIO_SECRET_KEY=<generated>

SIGNUP_ALLOWED_EMAILS=<your email>
SEED_ADMIN_EMAIL=<your email>
SEED_ADMIN_PASSWORD=<a strong password>

MAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=aiwithsalman33@gmail.com
SMTP_PASS=<Google App Password>
MAIL_FROM="LocalPilot <aiwithsalman33@gmail.com>"
MAIL_DAILY_CAP=300

AI_ADAPTER=openai
GBP_ADAPTER=real
GOOGLE_CLIENT_ID=<from Google Cloud>
GOOGLE_CLIENT_SECRET=<from Google Cloud>
```

The API refuses to start in production with development secrets, `MAIL_PROVIDER=dev`, a mock adapter, or missing SMTP settings. Mock data can't appear on the live site.

Create the OAuth credentials before deploying. Google calls fail with a quota error until your API access is approved.

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

1. Apply for API access. You need a verified Business Profile active for 60+ days and a website.
2. In Google Cloud, check your quota. 0 means not approved yet, 300 means approved.
3. Enable the Business Profile APIs and create OAuth credentials.
4. Add this redirect URI: `https://gmb.axxeler.in/api/v1/google/oauth/callback`
5. Check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, then redeploy.

Test with one real profile first: one photo, one post and one review reply.

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
