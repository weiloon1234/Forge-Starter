# Deployment Guide

This guide matches the current deployment scripts:

- `scripts/setup.sh` provisions an Ubuntu 24.04+ server.
- `scripts/build.sh` builds locally in Docker and uploads an artifact to S3/R2.
- `scripts/deploy-poll.sh` runs on the server, watches the bucket, deploys new versions, and runs migrations.

Example values used below:

| Value | Example |
|---|---|
| App name | `my-saas` |
| Environment | `staging` |
| App ID | `my-saas-staging` |
| Domain | `staging.my-saas.com` |
| Server IP | `203.0.113.50` |

`APP_NAME` and `ENVIRONMENT` are important. The scripts derive paths and service names from them:

```text
APP_ID          = {APP_NAME}-{ENVIRONMENT}
App directory   = /opt/{APP_ID}
Artifact prefix = s3://{DEPLOY_BUCKET}/_deployments/{APP_NAME}/{ENVIRONMENT}
Binary name     = app
Services        = {APP_ID}-http, {APP_ID}-worker, {APP_ID}-scheduler, {APP_ID}-websocket, {APP_ID}-deploy-poll
```

Use the same app name when running `scripts/setup.sh` on the server and `scripts/build.sh` locally. On the first run, type the app name explicitly instead of relying on the prompt default. A lowercase slug like `my-saas` is recommended because the value is used directly in paths and systemd unit names.

---

## 1. Prerequisites

### Local machine

- Git.
- Docker Desktop or Docker daemon running.
- AWS CLI v2 configured with credentials that can write to your S3/R2 deploy bucket.
- A local `.env.staging` or `.env.production` file for deploy settings and public frontend build variables.

### Server

- Ubuntu 24.04+.
- Root SSH access or a sudo-capable user.
- DNS access if you want Nginx + Let's Encrypt SSL.
- A temporary copy of `scripts/setup.sh` and `scripts/deploy-poll.sh`.
- AWS/R2 credentials that can read from the deploy bucket.

### Deploy bucket

Cloudflare R2 works well. The bucket stores only deployment artifacts:

```text
_deployments/{APP_NAME}/{ENVIRONMENT}/VERSION
_deployments/{APP_NAME}/{ENVIRONMENT}/app-{version}.zip
```

Do not upload `.env` files to the bucket.

The build script keeps the newest 5 `app-*.zip` files per app/environment prefix by default and deletes older matching ZIP files after a successful upload. The `VERSION` file is never removed by retention cleanup.

---

## 2. Create R2 Credentials

In Cloudflare:

1. Go to **R2 Object Storage**.
2. Create or choose a bucket, for example `my-saas`.
3. Create an R2 API token with **Object Read & Write** for that bucket.
4. Save:
   - Access Key ID
   - Secret Access Key
   - Endpoint, for example `https://<account-id>.r2.cloudflarestorage.com`

Configure AWS CLI on your local machine:

```bash
aws configure
```

The AWS CLI is used because R2 speaks the S3-compatible API. For R2, enter:

```text
AWS Access Key ID:     your R2 Access Key ID
AWS Secret Access Key: your R2 Secret Access Key
Default region name:   auto
Default output format: json
```

The secret access key is different from the access key ID. `Default output format` only controls how AWS CLI command output is printed (`json`, `text`, or `table`); `json` is a good default. The scripts pass the endpoint from `DEPLOY_ENDPOINT`; `DEPLOY_REGION=auto` is fine for R2.

You can verify access with:

```bash
aws s3 ls s3://my-saas --endpoint-url https://<account-id>.r2.cloudflarestorage.com
```

---

## 3. Prepare the Server

Point DNS at the server before requesting SSL:

| Type | Name | Value |
|---|---|---|
| A | `staging.my-saas.com` | `203.0.113.50` |

Copy only the setup scripts to a temporary server directory:

```bash
# Run locally from the project root
ssh root@203.0.113.50 'rm -rf /tmp/my-saas-setup && mkdir -p /tmp/my-saas-setup/scripts'
scp scripts/setup.sh scripts/deploy-poll.sh root@203.0.113.50:/tmp/my-saas-setup/scripts/
```

Then SSH into the server and run setup from that temporary directory. The server does not need a permanent source checkout.

---

## 4. Run Server Setup

Run setup as root:

```bash
ssh root@203.0.113.50
cd /tmp/my-saas-setup
sudo bash scripts/setup.sh
```

The script supports Ubuntu 24.04+ only. It installs and configures:

- Base packages: `build-essential`, `curl`, `wget`, `unzip`, `jq`, `openssl`, `ca-certificates`, `gnupg`.
- System user: `forge`.
- PostgreSQL 16 from the official PostgreSQL apt repository.
- Redis.
- AWS CLI v2.
- Nginx.
- Certbot with the Nginx plugin.
- `/opt/{APP_ID}` app directory.
- `/opt/{APP_ID}/config/deploy.conf`.
- `/opt/{APP_ID}/.env`.
- `/opt/{APP_ID}/Makefile` helper commands.
- Dynamic systemd units for HTTP, worker, scheduler, websocket, and deploy polling.

Use values like:

```text
App name: my-saas
Environment (staging/production): staging
Domain for this app: staging.my-saas.com
PostgreSQL username: my_saas
Database name: my_saas_staging
Password for 'my_saas': leave blank to auto-generate
Configure S3-compatible credentials now: y
S3-compatible Access Key ID: <R2 Access Key ID>
S3-compatible Secret Access Key: <R2 Secret Access Key>
Default region: auto
Default output format: json
HTTP port for this app: 3000
WebSocket port for this app: 3010
Obtain SSL certificate: y
Deploy artifact bucket: my-saas
Deploy artifact region: auto
Deploy artifact endpoint: https://<account-id>.r2.cloudflarestorage.com
Poll interval in seconds: 30
```

The app name must match the app name you use later with `make deploy`. If the setup prompt has no default, enter `my-saas` explicitly.

PostgreSQL usernames, database names, and Redis namespaces are normalized to lowercase SQL-safe identifiers by default. For example, app name `MediaForge` with environment `production` defaults to PostgreSQL user `mediaforge` and database `mediaforge_production`.

Setup also installs the PostgreSQL runtime primitives the starter migrations need, including `pgcrypto` and a `uuidv7()` fallback for PostgreSQL 16.

Setup enables the generated systemd units but leaves them stopped. The first successful deployment starts the HTTP, worker, scheduler, and websocket services.

Setup writes runtime config to:

```bash
/opt/my-saas-staging/.env
```

It generates values like:

```env
APP__NAME=my-saas
APP__ENVIRONMENT=staging
APP__SIGNING_KEY=...
CRYPT__KEY=...
SERVER__HOST=127.0.0.1
SERVER__PORT=3000
WEBSOCKET__HOST=127.0.0.1
WEBSOCKET__PORT=3010
DATABASE__URL=postgres://...
REDIS__URL=redis://127.0.0.1:6379
REDIS__NAMESPACE=my_saas_staging
```

Add production secrets and integration settings to this server `.env`, not to the deploy bucket:

```bash
sudo nano /opt/my-saas-staging/.env
```

Common additions:

```env
STORAGE__DISKS__R2__KEY=...
STORAGE__DISKS__R2__SECRET=...
STORAGE__DISKS__R2__BUCKET=...
STORAGE__DISKS__R2__ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE__DISKS__R2__URL=https://assets.example.com

INTEGRATIONS__OPENROUTER__API_KEY=...
INTEGRATIONS__FAL_AI__API_KEY=...

INTEGRATIONS__STRIPE__SECRET_KEY=...
INTEGRATIONS__STRIPE__PUBLIC_KEY=...
INTEGRATIONS__STRIPE__WEBHOOK_SECRET=...
INTEGRATIONS__STRIPE__APP_BASE_URL=https://staging.my-saas.com
```

Keep the file private:

```bash
sudo chmod 600 /opt/my-saas-staging/.env
sudo chown forge:forge /opt/my-saas-staging/.env
```

### Re-running setup

`scripts/setup.sh` is intended to be re-runnable.

On later runs it:

- Loads existing `/opt/{APP_ID}/.env` values as defaults.
- Preserves `APP__SIGNING_KEY` and `CRYPT__KEY` when they already exist.
- Reuses existing PostgreSQL users and databases.
- Reuses existing Nginx and SSL config when present.
- Rewrites `config/deploy.conf`.
- Regenerates and enables the systemd units.

If you left the deploy bucket blank, setup skips the deploy-poll service. Configure the bucket and re-run setup to generate it.

After setup finishes, remove the temporary setup copy:

```bash
rm -rf /tmp/my-saas-setup
```

The long-lived server app directory should be `/opt/{APP_ID}` only. It contains runtime files, compiled artifacts, config, assets, and helper scripts, not the project source tree.

### Server cleanup checklist

After setup or manual deploy-helper testing, remove temporary source or script copies from the server:

```bash
# Temporary setup folder from this guide
rm -rf /tmp/my-saas-setup

# If you temporarily cloned or pulled the full source on the server, remove it too
rm -rf /tmp/my-saas
rm -rf /tmp/mediaforge

# If you copied helper scripts through /tmp during debugging
rm -f /tmp/deploy-poll.sh /tmp/setup.sh
```

Useful checks:

```bash
# /opt should not contain a project source checkout
find /opt -maxdepth 3 \( -name .git -o -name Cargo.toml -o -name package.json \) -print

# /tmp should not keep old full project checkouts
find /tmp -maxdepth 1 -type d \( -iname '*my-saas*' -o -iname '*mediaforge*' -o -iname '*daily-deal*' \) -print
```

Do not delete `/opt/{APP_ID}/.env`, `/opt/{APP_ID}/config/deploy.conf`, `/opt/{APP_ID}/scripts/deploy-poll.sh`, `/opt/{APP_ID}/Makefile`, or `/root/.aws`; those are runtime/deploy files the server still needs.

---

## 5. Prepare Local Deploy Env

On your local machine:

```bash
cp .env.staging.example .env.staging
```

Edit `.env.staging`:

```env
DEPLOY_BUCKET=my-saas
DEPLOY_REGION=auto
DEPLOY_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
DEPLOY_ACCESS_KEY_ID=<R2 Access Key ID>
DEPLOY_SECRET_ACCESS_KEY=<R2 Secret Access Key>
DEPLOY_RETAIN_RELEASES=5
DEPLOY_DOCKER_CLEANUP=aggressive
DEPLOY_DOCKER_PLATFORM=linux/amd64

VITE_APP_NAME=My SaaS (Staging)
VITE_APP_ENV=staging
VITE_APP_URL=https://staging.my-saas.com
VITE_API_URL=https://staging.my-saas.com
VITE_WS_URL=wss://staging.my-saas.com/ws
VITE_STORAGE_URL=https://assets-staging.my-saas.com
```

`VITE_WS_URL` must be a public browser URL (`wss://...` for HTTPS sites), not
`ws://127.0.0.1:3010/ws`. If it is omitted, the frontend derives
`wss://<current-host>/ws` on production HTTPS pages. The server-side
`WEBSOCKET__HOST=127.0.0.1` and `WEBSOCKET__PORT=3010` stay private; Nginx
proxies the public `/ws` path to that local process.

`scripts/build.sh` reads this file locally only:

- `DEPLOY_*` chooses where to upload the artifact.
- `DEPLOY_ACCESS_KEY_ID` and `DEPLOY_SECRET_ACCESS_KEY` authenticate the upload. They are exported only for the local `aws s3 cp` commands and are not printed or uploaded.
- `DEPLOY_RETAIN_RELEASES` keeps only the newest matching `app-*.zip` files in this app/environment bucket prefix.
- `DEPLOY_DOCKER_CLEANUP` controls local Docker cleanup after successful deploy: `aggressive`, `balanced`, `conservative`, or `off`.
- `DEPLOY_DOCKER_PLATFORM` controls the Linux platform used for the Docker build. Keep `linux/amd64` for typical x86_64 Ubuntu servers, especially when building from Apple Silicon.
- `VITE_*` values are public and are baked into the frontend bundles.

Runtime secrets in `/opt/{APP_ID}/.env` are never uploaded by `scripts/build.sh`.

The build script also accepts these deploy bucket keys if you prefer to reuse storage config names:

```env
STORAGE__DISKS__R2__BUCKET=my-saas
STORAGE__DISKS__R2__REGION=auto
STORAGE__DISKS__R2__ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE__DISKS__R2__KEY=<R2 Access Key ID>
STORAGE__DISKS__R2__SECRET=<R2 Secret Access Key>
```

Explicit `DEPLOY_*` values are simpler and recommended for deployment.

---

## 6. Build and Upload

On your local machine:

```bash
make deploy
```

or:

```bash
bash scripts/build.sh
```

When prompted:

```text
App name [forge-starter]: my-saas
Environment (staging/production) [staging]: staging
```

The default app name can come from local config or the previous `scripts/.build.conf`. Type the same app name used during server setup if the default is different.

The script:

1. Checks `aws` and Docker.
2. Saves app name and environment in `scripts/.build.conf` for next time.
3. Copies public `VITE_*` values into temporary `frontend/*/.env.production.local` files.
4. Builds every frontend portal directory that exists under `frontend/` (for example `admin` and `user`; projects may also add `website` or `team`).
5. Builds the Rust release binary named `app` for `DEPLOY_DOCKER_PLATFORM` (`linux/amd64` by default).
6. Extracts:
   - `app`
   - `public/`
   - `config/*.toml`
   - `locales/`
   - `templates/`
   - `docs/` placeholder
7. Verifies the zip contains runtime files only. It aborts before upload if it finds `.env`, source folders, Cargo manifests, `.git`, `node_modules`, `target`, `scripts`, `database`, or tests.
8. Creates `app-{git-hash}-{timestamp}.zip`.
9. Uploads the zip and `VERSION` file to:

```text
s3://my-saas/_deployments/my-saas/staging/
```

10. Deletes older `app-*.zip` files in that prefix, keeping the newest 5 by default.
11. Runs local Docker cleanup. The default is `aggressive`, which removes the deploy image and prunes Docker build cache.

API docs are not generated inside deploy Docker builds because the Forge CLI bootstrap opens runtime services such as the database. Run `make api-docs` locally when you need developer docs.

---

## 7. Start Deployment Polling

On the server, start the deploy-poll systemd service for your real `APP_ID`.

The name is not literally `my-saas-staging-deploy-poll` unless you used:

```text
App name: my-saas
Environment: staging
```

The mapping is:

```text
APP_ID = {APP_NAME}-{ENVIRONMENT}
App directory = /opt/{APP_ID}
Deploy poll service = {APP_ID}-deploy-poll.service
```

Use the exact `APP_ID` casing from `/opt/{APP_ID}` or `/opt/{APP_ID}/config/deploy.conf`. Linux paths and systemd unit names are case-sensitive, so `MediaForge-production-deploy-poll` and `Mediaforge-production-deploy-poll` are different names.

Examples:

| App name | Environment | Deploy poll service |
|---|---|---|
| `my-saas` | `staging` | `my-saas-staging-deploy-poll.service` |
| `mediaforge-new` | `production` | `mediaforge-new-production-deploy-poll.service` |
| `daily-deal` | `staging` | `daily-deal-staging-deploy-poll.service` |

Use these commands to discover what setup actually generated:

```bash
# Similar to `supervisorctl status`: list this app's loaded systemd services
sudo systemctl list-units --type=service --all 'my-saas-staging-*'

# List installed unit files, including services that have not started yet
sudo systemctl list-unit-files 'my-saas-staging-*'

# Find all Forge deploy-poll service files on the server
sudo find /etc/systemd/system -maxdepth 1 -name '*deploy-poll.service' -printf '%f\n'

# Show APP_ID values from installed app deploy configs
sudo grep -R '^APP_ID=' /opt/*/config/deploy.conf

# For one app directory, print the exact commands to use
APP_ID="$(sudo grep '^APP_ID=' /opt/MediaForge-production/config/deploy.conf | cut -d= -f2 | tr -d '\"')"
echo "sudo systemctl start ${APP_ID}-deploy-poll"
echo "sudo journalctl -u ${APP_ID}-deploy-poll -f"
```

Then start and follow the matching service:

```bash
sudo systemctl start my-saas-staging-deploy-poll
sudo journalctl -u my-saas-staging-deploy-poll -f
```

The poller checks the bucket immediately on startup, then every `POLL_INTERVAL` seconds.

For each new version it:

1. Downloads `VERSION`.
2. Downloads `app-{version}.zip`.
3. Verifies the zip.
4. Backs up the current binary to `/opt/{APP_ID}/bin/app.bak`.
5. Stops app services: HTTP, worker, scheduler, websocket.
6. Extracts the new binary and assets.
7. Copies `config/*.toml` while preserving `config/deploy.conf`.
8. Copies `locales/`, `templates/`, and `docs/`.
9. Runs `PROCESS=cli ./bin/app db:migrate`.
10. Restores the previous binary and leaves `/opt/{APP_ID}/VERSION` unchanged if migrations fail.
11. Starts app services.
12. Verifies the HTTP service is active.
13. Writes `/opt/{APP_ID}/VERSION` on success.
14. Restores the previous binary if HTTP startup fails.

Migrations are automatic during deploy. You normally do not need to run them manually after each release.

Verify the app:

```bash
curl https://staging.my-saas.com/health
```

Expected response:

```json
{"status":"ok"}
```

---

## 8. Subsequent Deployments

Local machine:

```bash
make deploy
```

The build script remembers the previous app name and environment in `scripts/.build.conf`. Press Enter through the prompts if they are still correct.

Server:

```bash
sudo journalctl -u my-saas-staging-deploy-poll -f
```

The server deploys automatically when the uploaded `VERSION` changes.

---

## 9. Production on the Same Server

Run setup again with a different environment and different ports:

```bash
# Run locally from the project root
ssh root@203.0.113.50 'rm -rf /tmp/my-saas-production-setup && mkdir -p /tmp/my-saas-production-setup/scripts'
scp scripts/setup.sh scripts/deploy-poll.sh root@203.0.113.50:/tmp/my-saas-production-setup/scripts/

ssh root@203.0.113.50
cd /tmp/my-saas-production-setup
sudo bash scripts/setup.sh
rm -rf /tmp/my-saas-production-setup
```

Example production values:

```text
App name: my-saas
Environment: production
Domain: my-saas.com
HTTP port: 3001
WebSocket port: 3011
Deploy artifact bucket: my-saas
Deploy artifact region: auto
Deploy artifact endpoint: https://<account-id>.r2.cloudflarestorage.com
```

The two environments can share one deploy bucket because artifact paths include the environment.

| Item | Staging | Production |
|---|---|---|
| App ID | `my-saas-staging` | `my-saas-production` |
| Directory | `/opt/my-saas-staging` | `/opt/my-saas-production` |
| Database | `my_saas_staging` | `my_saas_production` |
| Domain | `staging.my-saas.com` | `my-saas.com` |
| HTTP port | `3000` | `3001` |
| WebSocket port | `3010` | `3011` |
| Artifact path | `_deployments/my-saas/staging/` | `_deployments/my-saas/production/` |

Create `.env.production` locally and run:

```bash
make deploy
```

Choose `production` at the prompt.

---

## 10. Useful Commands

Replace `my-saas-staging` with your actual `APP_ID`.

### Deployment

```bash
cd /opt/my-saas-staging

# Current deployed version
cat /opt/my-saas-staging/VERSION

# Show current deployed version, latest remote version, and bucket versions
sudo make versions

# Deploy the current remote VERSION immediately, then resume polling
sudo make pull

# Deploy a specific artifact version and leave poll stopped
sudo make pull VERSION=2e3c3df-20260429071844

# Deploy a specific artifact version and resume polling after
sudo make pull VERSION=2e3c3df-20260429071844 RESUME_POLL=1

# Remote version in R2
aws s3 cp s3://my-saas/_deployments/my-saas/staging/VERSION - \
    --endpoint-url https://<account-id>.r2.cloudflarestorage.com

# Pause deployments
sudo make stop SERVICE=poll

# Resume deployments
sudo make start SERVICE=poll
```

### Logs

```bash
cd /opt/my-saas-staging

sudo make logs SERVICE=http
sudo make logs SERVICE=worker
sudo make logs SERVICE=scheduler
sudo make logs SERVICE=websocket
sudo make logs SERVICE=poll
sudo make logs SERVICE=all

sudo journalctl -u 'my-saas-staging-*' -f
sudo journalctl -u my-saas-staging-http --since "10 minutes ago"
sudo journalctl -u my-saas-staging-worker -n 100 --no-pager
```

### Services

```bash
cd /opt/my-saas-staging

sudo make status
sudo make restart SERVICE=http
sudo make restart SERVICE=worker
sudo make restart SERVICE=scheduler
sudo make restart SERVICE=websocket
sudo make restart SERVICE=poll
sudo make restart SERVICE=all
```

### CLI and Database

```bash
cd /opt/my-saas-staging

sudo -u forge PROCESS=cli ./bin/app db:migrate
sudo -u forge PROCESS=cli ./bin/app db:rollback
sudo -u forge PROCESS=cli ./bin/app db:seed
sudo -u forge PROCESS=cli ./bin/app routes:list
sudo -u forge PROCESS=cli ./bin/app <command>
```

### Nginx and SSL

```bash
sudo nginx -t
sudo nginx -t && sudo systemctl reload nginx

sudo certbot certificates
sudo certbot renew

sudo nano /etc/nginx/sites-available/my-saas-staging
```

For websocket production traffic, the Nginx site must include:

```nginx
location /ws {
    proxy_pass http://127.0.0.1:3010;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

---

## 11. Troubleshooting

### Deploy-poll service is missing

Setup skips deploy-poll if the deploy bucket prompt is blank.

First confirm the real service name:

```bash
sudo systemctl list-unit-files '*deploy-poll.service'
sudo find /etc/systemd/system -maxdepth 1 -name '*deploy-poll.service' -printf '%f\n'
sudo grep -R '^APP_ID=' /opt/*/config/deploy.conf
```

Fix:

```bash
cd /tmp/my-saas
sudo bash scripts/setup.sh
```

Enter `DEPLOY_BUCKET`, `DEPLOY_REGION`, and `DEPLOY_ENDPOINT` when prompted.

### Deploy-poll cannot read the bucket

Check logs:

```bash
sudo journalctl -u my-saas-staging-deploy-poll --since "5 minutes ago"
```

Common fixes:

```bash
# deploy-poll runs as root, so credentials must exist under /root/.aws
sudo install -d -m 700 /root/.aws
sudo nano /root/.aws/credentials
sudo nano /root/.aws/config
sudo chmod 600 /root/.aws/credentials /root/.aws/config

sudo cat /opt/my-saas-staging/config/deploy.conf
```

`/root/.aws/credentials` should look like:

```ini
[default]
aws_access_key_id = <R2 Access Key ID>
aws_secret_access_key = <R2 Secret Access Key>
```

`/root/.aws/config` should look like:

```ini
[default]
region = auto
output = json
```

`my-saas-staging-deploy-poll` runs as root, so `/root/.aws/...` is the credential location the service uses. You can also run `sudo -H aws configure`, but the raw AWS prompt is easier to misread for R2.

Confirm:

- `DEPLOY_BUCKET` is set.
- `DEPLOY_ENDPOINT` is set for R2.
- The server AWS credentials can read the bucket.

### Deployment keeps retrying

The poller retries on the next interval if deploy fails.

Check:

```bash
sudo journalctl -u my-saas-staging-deploy-poll -f
sudo journalctl -u my-saas-staging-http --since "10 minutes ago"
```

Common causes:

- Artifact zip was interrupted or corrupted.
- Runtime `.env` is missing required secrets.
- Database migration failed.
- HTTP service failed to start.
- A port is already in use.

If migration output says `function uuidv7() does not exist`, the database was created before the setup script installed the starter PostgreSQL primitives. Run the repair SQL shown below for the app database, then retry `make pull`.

Useful checks:

```bash
sudo ss -tlnp | grep -E '3000|3010'
sudo systemctl status postgresql
sudo systemctl status redis-server
ls -la /opt/my-saas-staging/bin/app
```

Repair missing PostgreSQL primitives:

```bash
sudo -u postgres psql -v ON_ERROR_STOP=1 -d my_saas_staging <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION uuidv7()
RETURNS uuid
LANGUAGE sql
VOLATILE
AS $$
    WITH value AS (
        SELECT
            (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint AS unix_ts_ms,
            gen_random_bytes(10) AS rand_bytes
    )
    SELECT encode(
        decode(lpad(to_hex(unix_ts_ms), 12, '0'), 'hex')
        || set_byte(substring(rand_bytes from 1 for 2), 0, (get_byte(rand_bytes, 0) & 15) | 112)
        || set_byte(substring(rand_bytes from 3 for 8), 0, (get_byte(rand_bytes, 2) & 63) | 128),
        'hex'
    )::uuid
    FROM value
$$;

ALTER FUNCTION public.uuidv7() OWNER TO my_saas;
GRANT EXECUTE ON FUNCTION public.uuidv7() TO my_saas;
SQL
```

### Manual rollback

`deploy-poll.sh` automatically restores `bin/app.bak` if the HTTP service does not start after deployment. If you need to roll back manually:

```bash
for svc in http worker scheduler websocket; do
    sudo systemctl stop my-saas-staging-$svc
done

sudo cp /opt/my-saas-staging/bin/app.bak /opt/my-saas-staging/bin/app
sudo chmod +x /opt/my-saas-staging/bin/app

for svc in http worker scheduler websocket; do
    sudo systemctl start my-saas-staging-$svc
done
```

If `app.bak` has already been removed after a successful deploy, use `sudo make versions` to find an older artifact and `sudo make pull VERSION=<version>` to deploy it once. For a persistent rollback, write that older version to the remote `VERSION` file, then resume the poller so future polling does not replace it with the newer remote version.

---

## 12. Architecture

```text
Local machine
  .env.staging or .env.production
    - DEPLOY_* bucket settings
    - public VITE_* frontend settings

  make deploy
    -> scripts/build.sh
    -> Docker builds frontend portals found under frontend/
    -> Docker builds Rust binary: app
    -> Docker includes a docs/api placeholder
    -> verifies runtime-only artifact contents
    -> uploads app-{version}.zip
    -> uploads VERSION
    -> keeps the newest 5 app-*.zip artifacts by default
    -> prunes local Docker deploy image/build cache by default

S3/R2 bucket
  _deployments/my-saas/staging/
    VERSION
    app-{version}.zip

Ubuntu 24.04+ server
  /opt/my-saas-staging/
    .env                 server-only runtime config and secrets
    VERSION              last successful deployed version
    Makefile             server helper commands
    bin/app              current binary
    config/deploy.conf   deploy poller config
    config/*.toml        app config from artifact
    public/              frontend assets from artifact
    locales/             translations from artifact
    templates/           templates from artifact
    docs/                API docs from artifact

  systemd
    my-saas-staging-deploy-poll
      -> polls S3/R2
      -> deploys artifact
      -> runs db:migrate
      -> restarts app services

    my-saas-staging-http
    my-saas-staging-worker
    my-saas-staging-scheduler
    my-saas-staging-websocket

  Nginx
    https://staging.my-saas.com -> 127.0.0.1:3000
    wss://staging.my-saas.com/ws -> 127.0.0.1:3010
```
