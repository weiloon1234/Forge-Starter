# Deployment Guide

Step-by-step from a fresh Ubuntu server to a running application.

**Example values:** app name `my-saas`, environment `staging`, domain `staging.my-saas.com`, server IP `203.0.113.50`.

---

## Prerequisites

| What | Where | Required |
|------|-------|----------|
| Ubuntu 24.04+ server | Cloud provider | Yes |
| Docker Desktop | Local machine | Yes |
| AWS CLI v2 | Local machine | Yes |
| Git | Both | Yes |
| Cloudflare R2 bucket | Cloudflare | Yes |
| Domain with DNS access | DNS provider | Recommended |

---

## Part 1: Configure Storage (R2)

The project uses one R2 bucket for both app storage and deployment artifacts. No separate "deploy bucket" needed.

### 1.1 Create R2 Bucket

1. [Cloudflare Dashboard](https://dash.cloudflare.com) > **R2 Object Storage** > **Create bucket**
2. Name: `my-saas` (or any name)
3. Click **Create bucket**

### 1.2 Create R2 API Token

1. **R2** > **Overview** > **Manage R2 API Tokens** > **Create API token**
   - Token name: `deploy`
   - Permissions: **Object Read & Write**
   - Specify bucket: select your bucket
2. **Save these values** (shown once):
   ```
   Access Key ID:     xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   Secret Access Key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   Endpoint:          https://<account-id>.r2.cloudflarestorage.com
   ```

### 1.3 Update config/storage.toml

In your local project, fill in the R2 credentials:

```toml
[storage]
default = "r2"

[storage.disks.r2]
driver = "s3"
key = "your-access-key-id"
secret = "your-secret-access-key"
region = "auto"
bucket = "my-saas"
endpoint = "https://<account-id>.r2.cloudflarestorage.com"
visibility = "private"
```

This file is read by both `build.sh` (local) and `deploy-poll.sh` (server) — one config, shared bucket.

---

## Part 2: Server Setup

### 2.1 SSH into Your Server

```bash
ssh root@203.0.113.50
```

### 2.2 Point DNS to Server

Before proceeding, point your domain to the server IP:

| Type | Name | Value |
|------|------|-------|
| A | staging.my-saas.com | 203.0.113.50 |

DNS propagation may take a few minutes.

### 2.3 Generate Deploy Key

```bash
ssh-keygen -t ed25519 -C "deploy@my-saas-staging" -f ~/.ssh/deploy_key -N ""
cat ~/.ssh/deploy_key.pub
```

Copy the public key output.

### 2.4 Add Deploy Key to GitHub

1. Repo > **Settings** > **Deploy keys** > **Add deploy key**
   - Title: `my-saas-staging`
   - Key: paste the public key
   - Allow write access: **No**

### 2.5 Configure SSH for GitHub

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/deploy_key
    IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
```

Test:
```bash
ssh -T git@github.com
```

### 2.6 Clone the Repo

```bash
cd /tmp
git clone git@github.com:your-org/my-saas.git
cd my-saas
```

### 2.7 Run Setup Script

```bash
sudo bash scripts/setup.sh
```

The script installs everything and walks you through configuration:

```
=== App Identity ===
[?] App name [my-saas]:                              ← Enter
[?] Environment (staging/production) [production]: staging
[?] Domain for this app (e.g. staging.my-saas.com): staging.my-saas.com

=== PostgreSQL 16 ===
[?] PostgreSQL username [my_saas]:                    ← Enter
[?] Database name [my_saas_staging]:                  ← Enter
[?] Password for 'my_saas' (empty = auto-generate):  ← Enter (auto-generates)
[INFO]  Auto-generated password: K7xm9Rp2...         ← note this

=== Redis ===
[OK]    Redis installed.

=== AWS CLI v2 ===
[OK]    AWS CLI v2 installed.
[?] Configure AWS credentials now? (y/N): y

    AWS Access Key ID:     ← paste R2 access key
    AWS Secret Access Key: ← paste R2 secret key
    Default region name:   auto
    Default output format: json

=== Nginx ===
[OK]    Nginx installed.
[?] HTTP port for this app [3000]:                    ← Enter
[?] WebSocket port for this app [3010]:               ← Enter
[OK]    Nginx config written: /etc/nginx/sites-available/my-saas-staging

=== SSL Certificate (Certbot) ===
[?] Obtain SSL certificate for staging.my-saas.com now? (Y/n): y
[?] Email for Let's Encrypt notifications: admin@my-saas.com
[OK]    SSL certificate obtained and Nginx configured for HTTPS.

=== Application Directory ===
[OK]    Storage bucket: my-saas (from config/storage.toml)
[?] Poll interval in seconds [30]:                    ← Enter

=== .env Setup ===
[?] DATABASE_URL [postgres://my_saas:K7xm...]:       ← Enter
[?] REDIS_URL [redis://127.0.0.1:6379]:              ← Enter
[OK]    .env written.

=== Systemd Services ===
[OK]    Generated my-saas-staging-http.service
[OK]    Generated my-saas-staging-worker.service
[OK]    Generated my-saas-staging-scheduler.service
[OK]    Generated my-saas-staging-websocket.service
[OK]    Generated my-saas-staging-deploy-poll.service
```

### 2.8 Re-running Setup (Safe)

The setup script is safe to run multiple times. On re-run:

- **Existing .env values are loaded as defaults** — just press Enter to keep them
- **APP_KEY is preserved** (never regenerated if already set)
- **PostgreSQL user/database creation is skipped** if they already exist
- **Packages are not reinstalled** if already present
- **Nginx config is not overwritten** if it already exists
- **SSL certificate is not re-requested** if already obtained
- **deploy.conf is updated** with current identity values

This means you can re-run setup to change the poll interval, update after a config change, or fix a missed step — without losing any existing configuration.

### 2.9 Start Deploy Polling

```bash
sudo systemctl start my-saas-staging-deploy-poll
```

The server is now watching your R2 bucket for new deployments.

### 2.10 Clean Up

```bash
rm -rf /tmp/my-saas
```

---

## Part 3: Environment Files (Local)

On your **local machine**:

```bash
cp .env.staging.example .env.staging
```

Edit `.env.staging`:

```env
# Server config (pulled by server from R2 bucket on deploy)
APP_ENV=staging
APP_KEY=base64:generate-me
DATABASE_URL=postgres://my_saas:K7xm9Rp2...@127.0.0.1:5432/my_saas_staging
REDIS_URL=redis://127.0.0.1:6379

# Frontend build-time variables (baked into React during Docker build)
VITE_API_URL=https://staging.my-saas.com
VITE_APP_NAME=My SaaS (Staging)
```

---

## Part 4: First Build & Deploy

On your **local machine**:

```bash
bash scripts/build.sh
```

```
[OK]    aws CLI found
[OK]    Docker is running
[OK]    Disk: r2 (from config/storage.toml)
[OK]    Bucket: my-saas
[OK]    Endpoint: https://...r2.cloudflarestorage.com

App name [my-saas]:                        ← Enter
Environment (staging/production) [staging]: ← Enter

[INFO]  Reading VITE_* vars from .env.staging
[OK]    VITE_API_URL=https://staging.my-saas.com
[OK]    VITE_APP_NAME=My SaaS (Staging)

[INFO]  Version: a1b2c3d-20260414120000
[INFO]  Starting Docker build...
... (first build takes several minutes)
[OK]    Docker build completed in 312s
[OK]    Archive created: 8.2M
[OK]    Artifact uploaded
[OK]    VERSION uploaded

Upload .env.staging to bucket? (y/N): y     ← first deploy: upload .env
[OK]    .env uploaded
```

### Watch It Deploy (on server)

```bash
journalctl -u my-saas-staging-deploy-poll -f
```

Within 30 seconds:

```
[my-saas-staging] INFO  New version detected: a1b2c3d-20260414120000
[my-saas-staging] INFO  Downloading artifact...
[my-saas-staging] INFO  Deployed public assets.
[my-saas-staging] INFO  my-saas-staging-http is running. Deployment successful.
[my-saas-staging] INFO  Deployment complete: a1b2c3d-20260414120000
```

### Verify

```bash
curl https://staging.my-saas.com/health
# {"status":"ok"}
```

---

## Part 5: Database Migrations

```bash
ssh root@203.0.113.50
cd /opt/my-saas-staging
sudo -u forge PROCESS=cli ./bin/app db:migrate
```

---

## Part 6: Subsequent Deployments

```bash
# Make changes, commit, push
bash scripts/build.sh
# Press Enter through prompts (remembers previous values)
# Server deploys automatically within 30 seconds
```

---

## Part 7: Production on Same Server

Run setup.sh again:

```bash
ssh root@203.0.113.50
cd /tmp && git clone git@github.com:your-org/my-saas.git && cd my-saas
sudo bash scripts/setup.sh
# App name: my-saas
# Environment: production
# Domain: my-saas.com
# HTTP port: 3001         ← different port!
# WebSocket port: 3011
```

| | Staging | Production |
|---|---|---|
| Directory | `/opt/my-saas-staging/` | `/opt/my-saas-production/` |
| Database | `my_saas_staging` | `my_saas_production` |
| Domain | `staging.my-saas.com` | `my-saas.com` |
| HTTP port | 3000 | 3001 |
| Services | `my-saas-staging-*` | `my-saas-production-*` |
| R2 path | `_deployments/my-saas/staging/` | `_deployments/my-saas/production/` |

---

## Part 8: Useful Commands

Replace `my-saas-staging` with your actual `{APP_NAME}-{ENVIRONMENT}`.

### Deploy

```bash
# Check current deployed version
cat /opt/my-saas-staging/VERSION

# Check what version is in R2 (what deploy-poll will pick up next)
aws s3 cp s3://my-saas/_deployments/my-saas/staging/VERSION - \
    --endpoint-url https://<account-id>.r2.cloudflarestorage.com

# Force deploy NOW (don't wait for poll interval)
sudo systemctl restart my-saas-staging-deploy-poll
# deploy-poll checks immediately on startup, then resumes normal polling
```

### Logs

```bash
# Tail logs (live) — pick the process you need
sudo journalctl -u my-saas-staging-http -f
sudo journalctl -u my-saas-staging-worker -f
sudo journalctl -u my-saas-staging-scheduler -f
sudo journalctl -u my-saas-staging-websocket -f
sudo journalctl -u my-saas-staging-deploy-poll -f

# Tail ALL app logs at once
sudo journalctl -u 'my-saas-staging-*' -f

# Logs from last 10 minutes
sudo journalctl -u my-saas-staging-http --since "10 minutes ago"

# Logs since last boot
sudo journalctl -u my-saas-staging-http -b

# Search for errors
sudo journalctl -u my-saas-staging-http --since today | grep -i error

# Last 100 lines
sudo journalctl -u my-saas-staging-worker -n 100 --no-pager
```

### Service Management

```bash
# Status of all services for this app
systemctl list-units 'my-saas-staging-*'

# Status of a specific service
systemctl status my-saas-staging-http

# Restart a single process
sudo systemctl restart my-saas-staging-http
sudo systemctl restart my-saas-staging-worker
sudo systemctl restart my-saas-staging-scheduler
sudo systemctl restart my-saas-staging-websocket

# Restart ALL app processes (not deploy-poll)
for svc in http worker scheduler websocket; do
    sudo systemctl restart my-saas-staging-$svc
done

# Stop a single process
sudo systemctl stop my-saas-staging-worker

# Start a single process
sudo systemctl start my-saas-staging-worker

# Stop ALL (maintenance)
for svc in http worker scheduler websocket; do
    sudo systemctl stop my-saas-staging-$svc
done

# Start ALL
for svc in http worker scheduler websocket; do
    sudo systemctl start my-saas-staging-$svc
done

# Stop deploy polling (pause deployments)
sudo systemctl stop my-saas-staging-deploy-poll

# Resume deploy polling
sudo systemctl start my-saas-staging-deploy-poll
```

### Database & CLI

```bash
cd /opt/my-saas-staging

# Migrations
sudo -u forge PROCESS=cli ./bin/app db:migrate
sudo -u forge PROCESS=cli ./bin/app db:rollback
sudo -u forge PROCESS=cli ./bin/app db:seed

# List all routes
sudo -u forge PROCESS=cli ./bin/app routes:list

# Any CLI command
sudo -u forge PROCESS=cli ./bin/app <command>
```

### Nginx & SSL

```bash
# Test Nginx config (always test before reload)
sudo nginx -t

# Reload Nginx (apply config changes)
sudo nginx -t && sudo systemctl reload nginx

# Check SSL certificate status
sudo certbot certificates

# Renew SSL (automatic via timer, manual if needed)
sudo certbot renew

# Force SSL renewal
sudo certbot renew --force-renewal

# Edit Nginx config for this app
sudo nano /etc/nginx/sites-available/my-saas-staging
```

---

## Part 9: Troubleshooting

### Deploy-poll not working

```bash
# Check status
systemctl status my-saas-staging-deploy-poll
journalctl -u my-saas-staging-deploy-poll --since "5 minutes ago"

# Common causes:
# 1. AWS/R2 credentials not configured → aws configure
# 2. Bucket empty in storage.toml → fill in config/storage.toml, re-run setup
# 3. Lock stuck → rm /opt/my-saas-staging/deploy-poll.lock
```

### Service won't start

```bash
journalctl -u my-saas-staging-http --since "2 minutes ago"

# Port in use → ss -tlnp | grep 3000
# Database down → systemctl status postgresql
# Redis down → systemctl status redis-server
# Binary missing → ls -la /opt/my-saas-staging/bin/app
```

### SSL issues

```bash
# Check certificate
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal

# Check Nginx config
sudo nginx -t
```

### Manual rollback

```bash
# Stop services
for svc in http worker scheduler websocket; do
    sudo systemctl stop my-saas-staging-$svc
done

# Restore previous binary
cp /opt/my-saas-staging/bin/app.bak /opt/my-saas-staging/bin/app

# Start services
for svc in http worker scheduler websocket; do
    sudo systemctl start my-saas-staging-$svc
done
```

---

## Architecture

```
Local Machine                        R2 Bucket (shared)                    Server
─────────────                        ──────────────────                    ──────

config/storage.toml ──── credentials ────────────────────── config/storage.toml
        │                                                          │
bash scripts/build.sh                                       deploy-poll.sh
  │ Docker build                  _deployments/               │ polls every 30s
  │ Frontend (Vite+React)           my-saas/staging/          │
  │ Backend (Rust)                    VERSION        ◄────────┤ compare
  │ Zip + Upload ──────────────►      app-{ver}.zip  ◄────────┤ download
  │                                   .env           ◄────────┤ download
  ▼                                                            ▼
                                                         /opt/my-saas-staging/
                                                           bin/app
                                                           public/
                                                           config/
                                                           .env
                                                               │
                                                           Nginx (SSL) ← :443
                                                               │
                                                           systemd services
                                                             my-saas-staging-http
                                                             my-saas-staging-worker
                                                             my-saas-staging-scheduler
                                                             my-saas-staging-websocket
```
