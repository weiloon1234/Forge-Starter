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
| Repository | `git@github.com:your-org/my-saas.git` |

`APP_NAME` and `ENVIRONMENT` are important. The scripts derive paths and service names from them:

```text
APP_ID          = {APP_NAME}-{ENVIRONMENT}
App directory   = /opt/{APP_ID}
Artifact prefix = s3://{DEPLOY_BUCKET}/_deployments/{APP_NAME}/{ENVIRONMENT}
Binary name     = app
Services        = {APP_ID}-http, -worker, -scheduler, -websocket, -deploy-poll
```

Use the same app name when running `scripts/setup.sh` on the server and `scripts/build.sh` locally. On the first run, type the app name explicitly instead of relying on the prompt default.

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
- Git read access to this repository, usually through a GitHub deploy key.
- AWS/R2 credentials that can read from the deploy bucket.

### Deploy bucket

Cloudflare R2 works well. The bucket stores only deployment artifacts:

```text
_deployments/{APP_NAME}/{ENVIRONMENT}/VERSION
_deployments/{APP_NAME}/{ENVIRONMENT}/app-{version}.zip
```

Do not upload `.env` files to the bucket.

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

For R2, use the R2 access key and secret. The scripts pass the endpoint from `DEPLOY_ENDPOINT`; `DEPLOY_REGION=auto` is fine.

You can verify access with:

```bash
aws s3 ls s3://my-saas --endpoint-url https://<account-id>.r2.cloudflarestorage.com
```

---

## 3. Prepare the Server

SSH into the server:

```bash
ssh root@203.0.113.50
```

Point DNS at the server before requesting SSL:

| Type | Name | Value |
|---|---|---|
| A | `staging.my-saas.com` | `203.0.113.50` |

Create a read-only deploy key:

```bash
ssh-keygen -t ed25519 -C "deploy@my-saas-staging" -f ~/.ssh/my_saas_deploy -N ""
cat ~/.ssh/my_saas_deploy.pub
```

Add the public key in GitHub:

```text
Repository -> Settings -> Deploy keys -> Add deploy key
```

Leave write access disabled.

Configure SSH for GitHub:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/my_saas_deploy
    IdentitiesOnly yes
EOF

chmod 600 ~/.ssh/config
ssh -T git@github.com
```

Clone the repository to a temporary location:

```bash
cd /tmp
git clone git@github.com:your-org/my-saas.git
cd my-saas
```

---

## 4. Run Server Setup

Run setup as root:

```bash
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
- Dynamic systemd units for HTTP, worker, scheduler, websocket, and deploy polling.

Use values like:

```text
App name: my-saas
Environment (staging/production): staging
Domain for this app: staging.my-saas.com
PostgreSQL username: my_saas
Database name: my_saas_staging
Password for 'my_saas': leave blank to auto-generate
Configure AWS credentials now: y
HTTP port for this app: 3000
WebSocket port for this app: 3010
Obtain SSL certificate: y
Deploy artifact bucket: my-saas
Deploy artifact region: auto
Deploy artifact endpoint: https://<account-id>.r2.cloudflarestorage.com
Poll interval in seconds: 30
```

The app name must match the app name you use later with `make deploy`. If the setup prompt has no default, enter `my-saas` explicitly.

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

VITE_APP_NAME=My SaaS (Staging)
VITE_APP_ENV=staging
VITE_APP_URL=https://staging.my-saas.com
VITE_API_URL=https://staging.my-saas.com
VITE_WS_URL=wss://staging.my-saas.com/ws
VITE_STORAGE_URL=https://assets-staging.my-saas.com
```

`scripts/build.sh` reads this file locally only:

- `DEPLOY_*` chooses where to upload the artifact.
- `VITE_*` values are public and are baked into the frontend bundles.

Runtime secrets in `/opt/{APP_ID}/.env` are never uploaded by `scripts/build.sh`.

The build script also accepts these deploy bucket keys if you prefer to reuse storage config names:

```env
STORAGE__DISKS__R2__BUCKET=my-saas
STORAGE__DISKS__R2__REGION=auto
STORAGE__DISKS__R2__ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
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
5. Builds the Rust release binary named `app`.
6. Generates API docs.
7. Extracts:
   - `app`
   - `public/`
   - `config/`
   - `locales/`
   - `templates/`
   - `docs/`
8. Creates `app-{git-hash}-{timestamp}.zip`.
9. Uploads the zip and `VERSION` file to:

```text
s3://my-saas/_deployments/my-saas/staging/
```

---

## 7. Start Deployment Polling

On the server:

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
10. Starts app services.
11. Verifies the HTTP service is active.
12. Writes `/opt/{APP_ID}/VERSION` on success.
13. Restores the previous binary if HTTP startup fails.

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
ssh root@203.0.113.50
cd /tmp
git clone git@github.com:your-org/my-saas.git my-saas-production-setup
cd my-saas-production-setup
sudo bash scripts/setup.sh
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
# Current deployed version
cat /opt/my-saas-staging/VERSION

# Remote version in R2
aws s3 cp s3://my-saas/_deployments/my-saas/staging/VERSION - \
    --endpoint-url https://<account-id>.r2.cloudflarestorage.com

# Wake the poller immediately
sudo systemctl restart my-saas-staging-deploy-poll

# Pause deployments
sudo systemctl stop my-saas-staging-deploy-poll

# Resume deployments
sudo systemctl start my-saas-staging-deploy-poll
```

### Logs

```bash
sudo journalctl -u my-saas-staging-http -f
sudo journalctl -u my-saas-staging-worker -f
sudo journalctl -u my-saas-staging-scheduler -f
sudo journalctl -u my-saas-staging-websocket -f
sudo journalctl -u my-saas-staging-deploy-poll -f

sudo journalctl -u 'my-saas-staging-*' -f
sudo journalctl -u my-saas-staging-http --since "10 minutes ago"
sudo journalctl -u my-saas-staging-worker -n 100 --no-pager
```

### Services

```bash
systemctl list-units 'my-saas-staging-*'
systemctl status my-saas-staging-http

sudo systemctl restart my-saas-staging-http
sudo systemctl restart my-saas-staging-worker
sudo systemctl restart my-saas-staging-scheduler
sudo systemctl restart my-saas-staging-websocket

for svc in http worker scheduler websocket; do
    sudo systemctl restart my-saas-staging-$svc
done
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

---

## 11. Troubleshooting

### Deploy-poll service is missing

Setup skips deploy-poll if the deploy bucket prompt is blank.

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
sudo aws configure
sudo cat /opt/my-saas-staging/config/deploy.conf
```

`my-saas-staging-deploy-poll` runs as root, so `sudo aws configure` configures the credentials the service actually uses.

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

Useful checks:

```bash
sudo ss -tlnp | grep -E '3000|3010'
sudo systemctl status postgresql
sudo systemctl status redis-server
ls -la /opt/my-saas-staging/bin/app
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

If `app.bak` has already been removed after a successful deploy, upload and deploy an older artifact by writing that version to the remote `VERSION` file.

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
    -> Docker generates docs/api
    -> uploads app-{version}.zip
    -> uploads VERSION

S3/R2 bucket
  _deployments/my-saas/staging/
    VERSION
    app-{version}.zip

Ubuntu 24.04+ server
  /opt/my-saas-staging/
    .env                 server-only runtime config and secrets
    VERSION              last successful deployed version
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
