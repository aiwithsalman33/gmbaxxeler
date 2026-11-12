# LocalPilot

Automates Google Business Profile management for agencies: client connection, dashboards, an image library, scheduled photos, SEO posts and review replies.

**How Google fits together:** you log in with your own Google account or a password. A separate agency Google account holds Manager access to every client profile, and it's connected once in Settings > Google. One Google Cloud project serves the whole app, and clients never need one.

Deploying to a VPS? See [docs/deploy-dokploy.md](docs/deploy-dokploy.md).

> **Storage:** MinIO has archived its open-source server, so `docker-compose.yml` uses the `pgsty/minio` community fork, pinned by digest. See `docs/storage-decision.md`.

## Run it

```sh
docker compose up --build
```

No `.env` is needed for development. Then open <http://127.0.0.1:8080>.

| Service | URL |
|---|---|
| App | <http://127.0.0.1:8080> |
| API docs | <http://127.0.0.1:8080/api/docs> |
| Health | <http://127.0.0.1:8080/api/health> |

### Log in

1. Register at <http://127.0.0.1:8080/register> with `admin@localpilot.dev`, the development allowlist.
2. Read the verification link from the logs: `docker compose logs worker | grep verify-email`
3. Open the link, then log in.

With `MAIL_PROVIDER=dev`, every email is printed to the worker log instead of being sent. Set the `SMTP_*` variables and `MAIL_PROVIDER=smtp` to send real mail.

Five wrong passwords lock an account for 15 minutes. Forgot password works from the login page.

### Connect Google and your clients

The app always talks to real Google Business Profile. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (or enter them in **Settings > Google**), and save an OpenAI key in **Account Settings**. See [Going live with Google](#going-live-with-google) for the Cloud project setup.

1. In **Settings > Google**, connect the agency Gmail. Every account and location it manages is listed.
2. In **Clients**, choose **Import from Google** to bring in businesses you already manage.
3. Or choose **Add client**, enter the business name with a mobile number and/or Gmail, then **Add and connect**. A business your accounts already manage connects at once by its phone number or exact name. A close name is offered for you to pick.
4. If it isn't found, sign in with a Gmail that already has Manager access to it (**Connect with Google**), or send the guide so the owner adds you as Manager. Invitations are checked every 10 minutes, or press **Check now**.

### Photos, SEO posts and reviews

- **Photos:** upload images to the Photos folder in **Library**, then set days, a time and a count in **Photos**. The worker uploads due photos every minute.
- **SEO posts:** fill in the **Knowledge base**, upload images to SEO Post Images, and set a schedule in **SEO Posts**. In draft mode posts are written 48 hours ahead and never publish unapproved; in auto mode they are written about 15 minutes ahead and publish on time.
- **Reviews:** choose **Sync** in **Reviews**. The first sync imports history quietly. With **AI auto-reply** on, a 1 to 3 star review never publishes on its own; it becomes a draft and alerts you.

Failed jobs are listed under **Account Settings > View failed jobs** with Google's error.

### Automated tests

The API tests and the e2e suite stand in for Google with a mock adapter, so they never touch real profiles. It is only used when a non-production stack sets `GBP_ADAPTER=mock` (the test harness does this). Production ignores `GBP_ADAPTER=mock`, `AI_ADAPTER=mock` and `MOCK_SAMPLE_DATA`, and on every start with real Google the API deletes anything mock mode left in the database.

## How publishing stays safe

- Each slot has a unique key, so regenerating a schedule can't create duplicates.
- A worker claims a job atomically before sending it, so parallel workers can't send it twice.
- Failed uploads retry after 1, 5 and 25 minutes, then alert the admin. Permissions errors don't retry.
- If a worker dies mid-upload, the job is marked failed rather than retried, because Google may already have the photo. A person checks the profile and chooses **Retry**.

## Develop

Requires Node 22+ and pnpm 10.

```sh
pnpm install
pnpm db:generate
docker compose up -d postgres minio
pnpm lint
pnpm typecheck
pnpm test
```

Integration tests use a `localpilot_test` database and a `localpilot-test` bucket, created automatically.

## How clients connect

The primary flow is the manager invitation:

1. The agency connects one Google account.
2. The client adds that account as Manager under People and access.
3. `poll-invitations` runs every 10 minutes and accepts invitations that match a pending client.

Google's invitation includes only a location name, sometimes an address and sometimes a place ID. Auto-accept needs both the name and the address to match, so add the client's address when you create them. A partial match appears in **Unmatched invitations** with a suggested client and a one-click Accept. A wrong business never connects by itself.

A per-client sign-in link also exists, hidden behind `ENABLE_CLIENT_OAUTH_LINKS=true`, because outside users see Google's unverified-app warning until the app is verified.

## Going live with Google

The steps are in **Settings > Google**, along with a live status checklist. Add both of these redirect URIs to your OAuth client:

- `https://gmb.axxeler.in/api/v1/google/oauth/callback`
- `https://gmb.axxeler.in/api/v1/auth/google/callback`

In Google Cloud, enable My Business Account Management API, My Business Business Information API, Business Profile Performance API and Google My Business API (posts, photos and reviews use it). Business Profile calls fail with a zero quota until Google approves API access for the project, and Settings shows "API access: not approved". Google login doesn't need this approval.

While the OAuth consent screen is in Testing mode, refresh tokens expire after 7 days. Add the agency account as a Test user and reconnect it weekly until the app is published. Both accounts must be Test users to sign in.

The real adapter has been tested against a fake Google server, not live Google.

## Deploying prebuilt images

GitHub Actions builds the web, API and worker images on every push to `main`, so the server never builds anything. Images go to `ghcr.io/aiwithsalman33/localpilot-web`, `-api` and `-worker`, tagged `:latest` and with the commit SHA.

**First-time setup**

1. In Dokploy, keep the Git source and set the compose path to `docker-compose.prod.yml`.
2. The packages inherit this repository's public visibility. If they're ever private, make them public under your GitHub profile's **Packages**, or add `ghcr.io` in Dokploy under **Registry**, using a GitHub token with `read:packages`.

**Redeploy after a push**

1. Wait for **Build** to go green in the GitHub **Actions** tab.
2. Click **Deploy** in Dokploy. It pulls the new `:latest` images and runs any migrations.

**Roll back**

1. Find the commit in the **Actions** tab and copy its full SHA.
2. Set `IMAGE_TAG=<sha>` in the Dokploy environment and click **Deploy**.
3. Remove `IMAGE_TAG` to return to `:latest`.

Migrations don't roll back with the image, so restore a backup if the old code can't read the newer database.

To build on the server instead, use `docker-compose.yml` and set `COMPOSE_PARALLEL_LIMIT=1` and `COMPOSE_BAKE=false`. That isn't recommended on a small VPS.

## Troubleshooting deploy

When a deploy says `container api is unhealthy`, the reason is in the API's log:

```sh
docker ps -a --filter name=api                    # find the container name
docker logs <api-container-name> --tail 40        # read the reason
docker inspect --format '{{json .State.Health}}' <api-container-name>   # health check results
free -m && df -h /                                # memory and disk
```

| Log says | Cause | Fix |
|---|---|---|
| `STARTUP FAILED: environment variables` | The named variables are missing or invalid | Fix each one. Only names are printed, never values |
| `STARTUP FAILED: storage` | MinIO is down, or its volume kept its first keys | Restore those keys, or delete the volume, which erases its files |
| `Authentication failed` or `P1000` | The postgres volume kept its first password | Restore that password, or delete the volume, which erases its data |
| `invalid port` or a database URL error | `POSTGRES_PASSWORD` has characters like `@ : / #` | Use `openssl rand -hex 32`, or URL-encode it in `DATABASE_URL` |
| `Can't reach storage` | MinIO is down, or its volume kept older credentials | Check `minio` is healthy, or delete its volume |
| `Killed`, or very low free memory | The server ran out of memory | Allow at least 4 GB of RAM, or use prebuilt images |
| Build stops with no error | The build ran out of memory or was cancelled | Use prebuilt images, or set `COMPOSE_PARALLEL_LIMIT=1` |
| No log lines, only unhealthy | The container hasn't started or the health check timed out | Check the `docker inspect` output above |

Changing `POSTGRES_PASSWORD` or `MINIO_SECRET_KEY` after the first start doesn't change the password stored in the volume.

To start again from nothing on a deployment with no real data:

```sh
docker compose -p <project-name> down -v
```

## Deploying to Dokploy

Full steps are in [docs/deploy-dokploy.md](docs/deploy-dokploy.md). In short:

1. Create a **Compose** service in Dokploy from this repository, using `docker-compose.yml`.
2. Set the environment variables in the Dokploy UI. Email is optional, but `SMTP_PASS` belongs nowhere else.
3. In **Domains**, set `gmb.axxeler.in` to service `caddy`, port `8080`, with HTTPS on.
4. Deploy, then check `https://gmb.axxeler.in/api/health`.

The API refuses to start with `APP_ENV=production` if it finds development secrets, the dev mail provider or missing SMTP settings. Google credentials are optional at startup.
