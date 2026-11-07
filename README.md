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

### Try the client flow with the mock adapter

The mock Google account starts empty. Add `MOCK_SAMPLE_DATA=true` to `.env` before first connecting Google to get 10 sample businesses across two accounts, with reviews and metrics. `GBP_ADAPTER=mock` also works in production, so the app stays usable until Google approves API access. Nothing in mock mode reaches Google.

1. In **Account Settings**, choose **Connect Google**.
2. In **Clients**, tick three locations and import them. Switch between them from the top-right dropdown.
3. Choose **Add client** and enter a business name and an email or mobile number. **Send invite by email** sends the guide. **Copy message** is there for WhatsApp.
4. Choose **Simulate invite**, then **Check now**. The worker also does this every 10 minutes.
5. A client with a matching name and address connects by itself. Anything less goes to **Unmatched invitations** for you to accept. **Simulate invitations** creates one of each.

To test the review path, add a client, then call `POST /api/v1/dev/mock/invitations` with an unrelated `locationName`. To test lost access, call `POST /api/v1/dev/mock/clients/:id/revoke` and press **Refresh** on the dashboard.

### Try the photo scheduler

1. In **Library**, upload a few images to the Photos folder.
2. In **Photos**, choose days, a time, a timezone and a count, then save. The next 14 days are queued, and each job shows the image reserved for it.
3. Choose **Publish next (mock)**. The **History** tab shows the original and new file names.

The worker checks for due uploads every minute. To test failures, call `POST /api/v1/dev/mock/fail-uploads` with `{"count": 4}` before publishing, then see **Account Settings > View failed jobs**.

With `AI_ADAPTER=mock`, names are built from the business details without calling OpenAI. Set `AI_ADAPTER=openai` and save a key in **Account Settings** to use a real vision model.

### Try SEO posts

1. Open **Knowledge base** and fill in the business details.
2. In **Library**, upload images to SEO Post Images.
3. In **SEO Posts**, set a schedule and a button link, then save.
4. Choose **Write next (mock)**, then open the draft to edit and approve it. Choose **Publish next (mock)** to send it.

In draft mode, posts are written 48 hours ahead (adjustable per client), and an unapproved post never publishes. In auto mode they are written about 15 minutes ahead and publish on time.

### Try reviews

1. Open **Reviews** and choose **Sync**. The first sync imports history quietly, with no replies or alerts.
2. Turn on **AI auto-reply**, choose a mode and save.
3. Call `POST /api/v1/dev/mock/clients/:id/reviews` with `{"rating": 5}` or `{"rating": 1}`.

A 1 to 3 star review never publishes on its own, in any mode. It becomes a draft and alerts you straight away.

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

Set `GBP_ADAPTER=real` once Google approves Business Profile API access. Until then, every Business Profile call fails with a zero quota, and Settings shows "API access: not approved". Google login doesn't need this approval.

While the OAuth consent screen is in Testing mode, refresh tokens expire after 7 days. Add the agency account as a Test user and reconnect it weekly until the app is published. Both accounts must be Test users to sign in.

The real adapter has been tested against a fake Google server, not live Google.

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
| `LocalPilot can't start`, then a list | Listed variables are missing or invalid | Fix each one. Only names are printed, never values |
| `Authentication failed` or `P1000` | The postgres volume kept its first password | Restore that password, or delete the volume, which erases its data |
| `invalid port` or a database URL error | `POSTGRES_PASSWORD` has characters like `@ : / #` | Use `openssl rand -hex 32`, or URL-encode it in `DATABASE_URL` |
| `Can't reach storage` | MinIO is down, or its volume kept older credentials | Check `minio` is healthy, or delete its volume |
| `Killed`, or very low free memory | The server ran out of memory | Allow at least 4 GB of RAM |
| No log lines, only unhealthy | The container hasn't started or the health check timed out | Check the `docker inspect` output above |

Changing `POSTGRES_PASSWORD` or `MINIO_SECRET_KEY` after the first start doesn't change the password stored in the volume.

To start again from nothing on a deployment with no real data:

```sh
docker compose -p <project-name> down -v
```

## Deploying to Dokploy

Full steps are in [docs/deploy-dokploy.md](docs/deploy-dokploy.md). In short:

1. Create a **Compose** service in Dokploy from this repository, using `docker-compose.yml`.
2. Set the environment variables in the Dokploy UI, including `SMTP_PASS`, which belongs nowhere else.
3. In **Domains**, set `gmb.axxeler.in` to service `caddy`, port `8080`, with HTTPS on.
4. Deploy, then check `https://gmb.axxeler.in/api/health`.

The API refuses to start with `APP_ENV=production` if it finds development secrets, the dev mail provider or missing SMTP settings. Google credentials are optional at startup.
