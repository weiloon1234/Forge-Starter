# Deployment Runbook

This project deploys by uploading signed release folders to one private S3/R2
bucket. The server polls that private bucket, verifies the signed manifest, and
installs the release.

No deployment artifact should be public. Do not enable `r2.dev` public access and
do not attach a public custom domain to the deploy bucket.

## Project Names

Use these exact app names when setup or deploy prompts ask for `App name`:

| Project | App name |
|---|---|
| Daily-Deal | `daily-deal` |
| Mediaforge-new | `mediaforge-new` |
| Forge-Starter | `forge-starter` |

Each environment gets its own app id:

```text
APP_ID = {APP_NAME}-{ENVIRONMENT}
Example: daily-deal-staging
```

Server runtime paths and services are isolated by app id:

```text
/opt/{APP_ID}
{APP_ID}-http
{APP_ID}-worker
{APP_ID}-scheduler
{APP_ID}-websocket
{APP_ID}-deploy-poll
```

Bucket layout:

```text
_deployments/{APP_NAME}/{ENVIRONMENT}/VERSION
_deployments/{APP_NAME}/{ENVIRONMENT}/{VERSION}/app.zip
_deployments/{APP_NAME}/{ENVIRONMENT}/{VERSION}/app.zip.sha256
_deployments/{APP_NAME}/{ENVIRONMENT}/{VERSION}/release.manifest
_deployments/{APP_NAME}/{ENVIRONMENT}/{VERSION}/release.manifest.sig
```

## What Goes Where

| Location | Purpose | Contains |
|---|---|---|
| Local project `.env.staging` | Local staging deploy/build input | Deploy writer credentials, signing private key path, public `VITE_*` values |
| Local project `.env.production` | Local production deploy/build input | Deploy writer credentials, signing private key path, public `VITE_*` values |
| Server `/root/.aws/*` | Server artifact download | Deploy reader credentials only |
| Server `/opt/{APP_ID}/config/deploy.conf` | Poller config | Bucket, endpoint, app id, public signing key path |
| Server `/opt/{APP_ID}/.env` | Runtime app config | Database, Redis, app keys, app secrets, WebSocket origins |

Do not put deploy writer credentials or the signing private key on the server.
Do not put runtime `.env` secrets in the deploy bucket.

It is fine to create both `.env.staging` and `.env.production` locally because
they are gitignored, but treat them as secrets anyway.

## 1. Create The Private Deploy Bucket

In Cloudflare R2:

1. Create one private bucket, for example `team-deployments`.
2. Keep public access disabled.
3. Create a local/CI writer token:
   - list/write/delete under `_deployments/*`
   - read is also okay if your provider bundles it with write
4. Create a server reader token:
   - read/list only
   - for a multi-project server, read/list under `_deployments/*` is simplest
   - if you want stricter tokens, scope one token per app/environment prefix

Use the writer token only in local or CI `.env.staging` and `.env.production`.
Use the reader token only on the server.

## 2. Create Deploy Signing Keys

On your local deploy machine or CI secret store:

```bash
mkdir -p ~/.forge-deploy
openssl genrsa -out ~/.forge-deploy/deploy-signing.key 4096
openssl rsa -in ~/.forge-deploy/deploy-signing.key -pubout -out ~/.forge-deploy/deploy-signing.pub
chmod 600 ~/.forge-deploy/deploy-signing.key
chmod 644 ~/.forge-deploy/deploy-signing.pub
```

Recommended simple setup: use one team deploy signing key pair for all three
projects. Install the public key on every server/app setup. Keep the private key
only on local deploy machines or CI.

## 3. Fill Local Deploy Env Files

Do this in each project you deploy.

For staging:

```bash
cp .env.staging.example .env.staging
```

For production:

```bash
cp .env.production.example .env.production
```

Add these deployment values to both files if you deploy both environments:

```env
DEPLOY_BUCKET=team-deployments
DEPLOY_REGION=auto
DEPLOY_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
DEPLOY_ACCESS_KEY_ID=<writer access key id>
DEPLOY_SECRET_ACCESS_KEY=<writer secret access key>
DEPLOY_SIGNING_PRIVATE_KEY_PATH=/Users/<you>/.forge-deploy/deploy-signing.key
DEPLOY_RETAIN_RELEASES=5
DEPLOY_DOCKER_CLEANUP=aggressive
DEPLOY_DOCKER_PLATFORM=linux/amd64
```

Also set the public frontend values for that environment:

```env
VITE_APP_ENV=staging
VITE_APP_URL=https://staging.example.com
VITE_API_URL=https://staging.example.com
VITE_WS_URL=wss://staging.example.com/ws
VITE_STORAGE_URL=https://asset-staging.example.com
```

Use production domains in `.env.production`.

Do not add `WEBSOCKET__ALLOWED_ORIGINS` here. That belongs in the server runtime
file `/opt/{APP_ID}/.env`.

## 4. Root, Sudo, And Runtime User

Recommended model for the current scripts:

1. Use root, or a sudo-capable `ops` user, only for server provisioning and setup.
2. Run setup with `sudo -H bash scripts/setup.sh`.
3. Let setup create/use the locked `forge` system user for app runtime.
4. Do not SSH as `forge` and do not run the app as root.
5. The deploy poller currently runs as root because it controls systemd services
   and writes runtime files under `/opt/{APP_ID}`.
6. The risk is controlled by using a private bucket, read-only server bucket
   credentials, and signed manifest verification before extraction.

For a fresh VPS, root login for first setup is acceptable. After the server is
ready, create an operator user and disable root SSH if that matches your server
policy:

```bash
adduser ops
usermod -aG sudo ops
```

Future setup runs can be done as `ops` with `sudo -H`.

## 5. Choose A Server Setup Path

Use **Path A** for a fresh VPS. Use **Path B** when the server already has at
least one Forge app installed and you are adding another project or environment.

In both paths, the setup prompt app name is always the base project slug:

```text
daily-deal
mediaforge-new
forge-starter
```

Do not type `daily-deal-staging`, `MediaForge-Staging`, or
`MediaForge-Production` as the app name. The setup script appends the
environment automatically.

## 5A. Path A: New Server

SSH in as root for first setup:

```bash
ssh root@<server-ip>
```

Optional but recommended after first access:

```bash
adduser ops
usermod -aG sudo ops
```

You can continue as root for the first setup, or reconnect as `ops` and use
`sudo -H` for the remaining commands.

Install the public deploy signing key on the server. From your local machine:

```bash
scp ~/.forge-deploy/deploy-signing.pub root@<server-ip>:/root/deploy-signing.pub
```

Configure one server reader token for the shared private deploy bucket when
`scripts/setup.sh` asks to configure S3-compatible credentials. This token should
be read/list only and can cover `_deployments/*` for the whole server.

Then continue to [6. Prepare The Repository Clone](#6-prepare-the-repository-clone).

## 5B. Path B: Existing Forge Server, Add Project Or Environment

SSH in as your operator user or root:

```bash
ssh ops@<server-ip>
```

Check what is already installed:

```bash
sudo grep -R '^APP_ID=' /opt/*/config/deploy.conf
sudo find /etc/systemd/system -maxdepth 1 -name '*deploy-poll.service' -printf '%f\n'
```

Check the shared server deploy reader credentials exist:

```bash
sudo test -f /root/.aws/credentials && echo "server reader credentials exist"
```

If `/root/.aws` already contains the shared read/list token for the private
deploy bucket, answer `n` when setup asks:

```text
Configure S3-compatible credentials now?
```

Still fill the deploy bucket, region, endpoint, and public signing key prompts
for each app environment.

Check the public signing key exists:

```bash
sudo test -f /root/deploy-signing.pub && echo "public signing key exists"
```

If it does not exist, copy it from local:

```bash
scp ~/.forge-deploy/deploy-signing.pub ops@<server-ip>:/tmp/deploy-signing.pub
ssh ops@<server-ip> 'sudo mv /tmp/deploy-signing.pub /root/deploy-signing.pub && sudo chmod 644 /root/deploy-signing.pub'
```

If you are adding a **new repository**, create a new GitHub deploy key for that
repo. If you are adding another environment for a repo already installed on this
server, you can reuse the existing repo deploy key.

Then continue to [6. Prepare The Repository Clone](#6-prepare-the-repository-clone).

## 6. Prepare The Repository Clone

Each GitHub repository should have its own read-only deploy key. GitHub deploy
keys are repository-scoped, so do not rely on one deploy key for all three repos.

On the server, generate a key for the repository you are setting up if one does
not already exist:

```bash
ssh-keygen -t ed25519 -C "deploy@daily-deal-staging" -f ~/.ssh/daily_deal_deploy -N ""
cat ~/.ssh/daily_deal_deploy.pub
```

Add the printed public key to GitHub:

```text
Repository -> Settings -> Deploy keys -> Add deploy key
Allow write access: off
```

Clone the repository into `/tmp` using that key:

```bash
cd /tmp
GIT_SSH_COMMAND='ssh -i ~/.ssh/daily_deal_deploy -o IdentitiesOnly=yes' \
  git clone git@github.com:<owner>/Daily-Deal.git daily-deal
cd /tmp/daily-deal
```

For Mediaforge-new and Forge-Starter, create separate key files and clone their
repositories the same way.

## 7. Run Setup For One App Environment

From the temporary clone:

```bash
sudo -H bash scripts/setup.sh
```

Use these prompt values as the pattern:

```text
App name: daily-deal
Environment (staging/production): staging
Domain for this app: staging.example.com
PostgreSQL username: daily_deal
Database name: daily_deal_staging
Password for 'daily_deal': leave blank to auto-generate
Configure S3-compatible credentials now: y
S3-compatible Access Key ID: <server reader access key id>
S3-compatible Secret Access Key: <server reader secret access key>
Default region: auto
Default output format: json
HTTP port for this app: 3000
WebSocket port for this app: 3010
Obtain SSL certificate: y
Deploy artifact bucket: team-deployments
Deploy artifact region: auto
Deploy artifact endpoint: https://<account-id>.r2.cloudflarestorage.com
Poll interval in seconds: 30
Deploy signing public key path: /root/deploy-signing.pub
```

For app name, use the base project slug only:

```text
daily-deal
mediaforge-new
forge-starter
```

For environment, use:

```text
staging
production
```

Examples:

| Desired install | App name prompt | Environment prompt | Resulting app id |
|---|---|---|---|
| Daily-Deal staging | `daily-deal` | `staging` | `daily-deal-staging` |
| Daily-Deal production | `daily-deal` | `production` | `daily-deal-production` |
| Mediaforge staging | `mediaforge-new` | `staging` | `mediaforge-new-staging` |
| Mediaforge production | `mediaforge-new` | `production` | `mediaforge-new-production` |

On the same server, every app/environment needs unique HTTP and WebSocket ports.
Example port plan:

| App id | HTTP | WebSocket |
|---|---:|---:|
| `daily-deal-staging` | 3000 | 3010 |
| `daily-deal-production` | 3001 | 3011 |
| `mediaforge-new-staging` | 3002 | 3012 |
| `mediaforge-new-production` | 3003 | 3013 |
| `forge-starter-staging` | 3004 | 3014 |
| `forge-starter-production` | 3005 | 3015 |

If `/root/.aws` is already configured with the server reader token from a
previous setup on the same server, you can answer `n` to configuring S3
credentials. Still fill the deploy bucket, region, endpoint, and public signing
key prompt for each app environment.

After setup, edit runtime secrets:

```bash
sudo nano /opt/daily-deal-staging/.env
```

Check these values:

```env
APP__ENVIRONMENT=staging
SERVER__PORT=3000
WEBSOCKET__PORT=3010
WEBSOCKET__ALLOWED_ORIGINS=["https://staging.example.com"]
DATABASE__URL=postgres://...
REDIS__URL=redis://127.0.0.1:6379
```

Add app-specific production secrets here, not in local `.env.staging` and not in
the deploy bucket.

Remove the temporary clone when setup is finished:

```bash
rm -rf /tmp/daily-deal
```

Repeat this setup section for every app/environment on the server.

## 8. Build And Upload From Local

From the local project directory:

```bash
make deploy
```

When prompted:

```text
App name [daily-deal]: daily-deal
Environment (staging/production) [staging]: staging
```

The build script will:

1. Build the Linux artifact in Docker.
2. Verify the zip only contains runtime-safe files.
3. Create `app.zip`, `app.zip.sha256`, `release.manifest`, and
   `release.manifest.sig`.
4. Upload the version folder to:

```text
s3://team-deployments/_deployments/daily-deal/staging/{VERSION}/
```

5. Upload `_deployments/daily-deal/staging/VERSION` last.

## 9. Start Or Check The Server Poller

On the server:

```bash
sudo systemctl start daily-deal-staging-deploy-poll
sudo journalctl -u daily-deal-staging-deploy-poll -f
```

Useful commands:

```bash
sudo make -C /opt/daily-deal-staging status
sudo make -C /opt/daily-deal-staging versions
sudo make -C /opt/daily-deal-staging deploy-check
sudo make -C /opt/daily-deal-staging doctor
```

Verify the public app:

```bash
curl https://staging.example.com/health
```

## 10. Repeat Pattern For All Projects

For each app/environment:

1. Local: create `.env.staging` or `.env.production`.
2. Server: choose Path A for a new server, or Path B for an existing Forge server.
3. Server: create or reuse the GitHub deploy key for that repo.
4. Server: clone into `/tmp` with that key.
5. Server: run `sudo -H bash scripts/setup.sh`.
6. Server: edit `/opt/{APP_ID}/.env`.
7. Local: run `make deploy`.
8. Server: start or watch `{APP_ID}-deploy-poll`.

The same private bucket can safely host all projects because every release is
isolated by app name and environment.

## 11. Quick Troubleshooting

If the server does not deploy:

```bash
sudo journalctl -u daily-deal-staging-deploy-poll -n 200 --no-pager
sudo make -C /opt/daily-deal-staging deploy-check
```

Common causes:

- Wrong app name or environment was used during local deploy.
- Server reader credentials cannot read the bucket prefix.
- `DEPLOY_SIGNING_PRIVATE_KEY_PATH` points to the wrong private key locally.
- The server was given the wrong `deploy-signing.pub`.
- `WEBSOCKET__ALLOWED_ORIGINS` is missing the real browser origin.
- Two app environments were assigned the same HTTP or WebSocket port.

To inspect installed app ids on a server:

```bash
sudo grep -R '^APP_ID=' /opt/*/config/deploy.conf
sudo find /etc/systemd/system -maxdepth 1 -name '*deploy-poll.service' -printf '%f\n'
```
