# Deployment Runbook

This project deploys by uploading signed release folders to one private S3/R2
bucket. The server polls that private bucket, verifies the signed manifest, and
installs the release.

No deployment artifact should be public. Do not enable `r2.dev` public access and
do not attach a public custom domain to the deploy bucket.

## Project Names

Use a lowercase base project slug when setup or deploy prompts ask for
`App name`. Do not include the environment in the app name.

| Project | App name |
|---|---|
| Forge-Starter | `forge-starter` |
| ABCProject | `abc-project` |

Each environment gets its own app id:

```text
APP_ID = {APP_NAME}-{ENVIRONMENT}
Example: abc-project-staging
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

Recommended simple setup: use one team deploy signing key pair for all projects.
Install the public key on every server/app setup. Keep the private key only on
local deploy machines or CI.

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

1. Use root only for the first operator-user bootstrap on a fresh server.
2. Use a sudo-capable operator user such as `ops` for project setup.
3. Run setup as `ops` with `sudo -H bash scripts/setup.sh`.
4. Let setup create/use the locked `forge` system user for app runtime.
5. Do not SSH as `forge` and do not run the app as root.
6. The deploy poller currently runs as root because it controls systemd services
   and writes runtime files under `/opt/{APP_ID}`.
7. The risk is controlled by using a private bucket, read-only server bucket
   credentials, and signed manifest verification before extraction.

For a fresh VPS, SSH as root only long enough to create `ops` and copy the
current SSH login keys:

```bash
adduser ops
usermod -aG sudo ops
install -d -m 700 -o ops -g ops /home/ops/.ssh
rsync -a --include='authorized_keys' --include='known_hosts' --exclude='*' /root/.ssh/ /home/ops/.ssh/
chown -R ops:ops /home/ops/.ssh
chmod 700 /home/ops/.ssh
chmod 600 /home/ops/.ssh/authorized_keys 2>/dev/null || true
```

All project setup runs should be done as `ops` with `sudo -H`.

## 5. Choose A Server Setup Path

Use **Path A** for a fresh VPS. Use **Path B** when the server already has at
least one Forge app installed and you are adding another project or environment.

In both paths, the setup prompt app name is always the base project slug:

```text
forge-starter
abc-project
```

Do not type `abc-project-staging`, `MyProject-Staging`, or
`MyProject-Production` as the app name. The setup script appends the environment
automatically.

## 5A. Path A: New Server

SSH in as root only for the initial operator-user bootstrap:

```bash
ssh root@<server-ip>
```

Then paste this whole block into the root shell. It writes a temp script first,
so a helper failure does not close your SSH session:

```bash
cat >/tmp/forge-new-server-bootstrap.sh <<'FORGE_BOOTSTRAP'
set -euo pipefail

if [[ "$(id -u)" != "0" ]]; then
  echo "Run this new-server helper as root."
  exit 1
fi

read -r -p "Operator sudo username [ops]: " OPS_USER
OPS_USER="${OPS_USER:-ops}"
if ! id "$OPS_USER" >/dev/null 2>&1; then
  adduser --gecos "" "$OPS_USER"
  usermod -aG sudo "$OPS_USER"
else
  usermod -aG sudo "$OPS_USER"
fi

install -d -m 700 -o "$OPS_USER" -g "$OPS_USER" "/home/$OPS_USER/.ssh"
if [[ -d /root/.ssh ]]; then
  if command -v rsync >/dev/null 2>&1; then
    rsync -a \
      --include='authorized_keys' \
      --include='known_hosts' \
      --exclude='*' \
      /root/.ssh/ "/home/$OPS_USER/.ssh/"
  else
    [[ -f /root/.ssh/authorized_keys ]] && cp /root/.ssh/authorized_keys "/home/$OPS_USER/.ssh/authorized_keys"
    [[ -f /root/.ssh/known_hosts ]] && cp /root/.ssh/known_hosts "/home/$OPS_USER/.ssh/known_hosts"
  fi
fi
chown -R "$OPS_USER:$OPS_USER" "/home/$OPS_USER/.ssh"
chmod 700 "/home/$OPS_USER/.ssh"
if [[ -f "/home/$OPS_USER/.ssh/authorized_keys" ]]; then
  chmod 600 "/home/$OPS_USER/.ssh/authorized_keys"
fi

SERVER_SIGNING_KEY="/etc/forge/deploy-signing.pub"
if [[ ! -f "$SERVER_SIGNING_KEY" ]]; then
  echo ""
  echo "Paste the contents of your local deploy-signing.pub now."
  echo "It starts with: -----BEGIN PUBLIC KEY-----"
  echo "It ends with:   -----END PUBLIC KEY-----"
  tmp_pub="$(mktemp)"
  while IFS= read -r line; do
    printf '%s\n' "$line" >> "$tmp_pub"
    [[ "$line" == "-----END PUBLIC KEY-----" ]] && break
  done
  if ! grep -q -- "-----BEGIN PUBLIC KEY-----" "$tmp_pub" \
    || ! grep -q -- "-----END PUBLIC KEY-----" "$tmp_pub"; then
    rm -f "$tmp_pub"
    echo "The pasted deploy signing public key did not look like a PEM public key."
    exit 1
  fi
  install -d -m 755 -o root -g root /etc/forge
  install -m 644 -o root -g root "$tmp_pub" "$SERVER_SIGNING_KEY"
  rm -f "$tmp_pub"
  echo "Installed server deploy signing public key: $SERVER_SIGNING_KEY"
else
  echo "Server deploy signing public key already exists: $SERVER_SIGNING_KEY"
fi

echo ""
echo "Operator user is ready: $OPS_USER"
echo "Root bootstrap is done."
echo ""
echo "Next:"
echo "  1. Open a new SSH/Termius session as username: $OPS_USER"
echo "  2. Use the same server login SSH key you used for root."
echo "  3. Run: sudo whoami"
echo "  4. Expected output: root"
echo "  5. Then run Path B below to add the first project/environment."
FORGE_BOOTSTRAP

bash /tmp/forge-new-server-bootstrap.sh
```

This helper copies only SSH login files such as `authorized_keys` and
`known_hosts`. It does not copy root private keys. All project setup work happens
as `ops`.

## 5B. Path B: Existing Forge Server, Add Project Or Environment

SSH in as your operator user:

```bash
ssh ops@<server-ip>
```

Then paste this whole block into the `ops` shell. It writes a temp script first,
so a helper failure does not close your SSH session:

```bash
cat >/tmp/forge-add-project.sh <<'FORGE_ADD_PROJECT'
set -euo pipefail

if [[ "$(id -u)" == "0" ]]; then
  echo "Run this helper as your operator user, for example: ssh ops@<server-ip>"
  exit 1
fi

sudo -v

ask() {
  local prompt="$1"
  local default="${2:-}"
  local value
  if [[ -n "$default" ]]; then
    read -r -p "$prompt [$default]: " value
    printf '%s' "${value:-$default}"
  else
    read -r -p "$prompt: " value
    printf '%s' "$value"
  fi
}

require_yes() {
  local prompt="$1"
  local value
  read -r -p "$prompt Type Y when done: " value
  if [[ "$value" != "Y" && "$value" != "y" ]]; then
    echo "Stopped."
    exit 1
  fi
}

read_existing_deploy_value() {
  local key="$1"
  local file line value
  while IFS= read -r file; do
    line="$(sudo grep -m1 "^${key}=" "$file" 2>/dev/null || true)"
    if [[ -n "$line" ]]; then
      value="${line#*=}"
      value="${value%\"}"
      value="${value#\"}"
      printf '%s' "$value"
      return 0
    fi
  done < <(sudo find /opt -path '*/config/deploy.conf' -type f -print 2>/dev/null | sort)
}

SERVER_SIGNING_KEY="/etc/forge/deploy-signing.pub"
if ! sudo test -f "$SERVER_SIGNING_KEY"; then
  echo ""
  echo "Paste the contents of your local deploy-signing.pub now."
  echo "It starts with: -----BEGIN PUBLIC KEY-----"
  echo "It ends with:   -----END PUBLIC KEY-----"
  tmp_pub="$(mktemp)"
  while IFS= read -r line; do
    printf '%s\n' "$line" >> "$tmp_pub"
    [[ "$line" == "-----END PUBLIC KEY-----" ]] && break
  done
  if ! grep -q -- "-----BEGIN PUBLIC KEY-----" "$tmp_pub" \
    || ! grep -q -- "-----END PUBLIC KEY-----" "$tmp_pub"; then
    rm -f "$tmp_pub"
    echo "The pasted deploy signing public key did not look like a PEM public key."
    exit 1
  fi
  sudo install -d -m 755 -o root -g root /etc/forge
  sudo install -m 644 -o root -g root "$tmp_pub" "$SERVER_SIGNING_KEY"
  rm -f "$tmp_pub"
fi

install -d -m 700 "$HOME/.ssh"
GITHUB_KEY="$HOME/.ssh/github_forge_deploy"
if [[ ! -f "$GITHUB_KEY" ]]; then
  ssh-keygen -t ed25519 -C "forge-deploy@$(hostname)" -f "$GITHUB_KEY" -N ""
fi
chmod 600 "$GITHUB_KEY"
chmod 644 "$GITHUB_KEY.pub"

echo ""
echo "Add this public key to your GitHub machine user SSH keys:"
echo "--------------------------------------------------------"
cat "$GITHUB_KEY.pub"
echo "--------------------------------------------------------"
echo "Then give that GitHub machine user read access to the repo you will clone."
require_yes "After GitHub access is ready,"

REPO_URL="$(ask "Git SSH repo URL" "git@github.com:<owner>/<repo>.git")"
DEFAULT_DIR="$(basename "$REPO_URL" .git)"
CLONE_DIR="$(ask "Temporary clone dir under /tmp" "$DEFAULT_DIR")"
if [[ -e "/tmp/$CLONE_DIR" ]]; then
  echo "/tmp/$CLONE_DIR already exists. Remove it or choose another clone dir."
  exit 1
fi

GIT_SSH_COMMAND="ssh -i $GITHUB_KEY -o IdentitiesOnly=yes" \
  git clone "$REPO_URL" "/tmp/$CLONE_DIR"

DEFAULT_DEPLOY_BUCKET="$(read_existing_deploy_value DEPLOY_BUCKET || true)"
DEFAULT_DEPLOY_REGION="$(read_existing_deploy_value DEPLOY_REGION || true)"
DEFAULT_DEPLOY_ENDPOINT="$(read_existing_deploy_value DEPLOY_ENDPOINT || true)"
DEFAULT_POLL_INTERVAL="$(read_existing_deploy_value POLL_INTERVAL || true)"

DEPLOY_BUCKET="$(ask "Deploy artifact bucket" "$DEFAULT_DEPLOY_BUCKET")"
DEPLOY_REGION="$(ask "Deploy artifact region" "${DEFAULT_DEPLOY_REGION:-auto}")"
DEPLOY_ENDPOINT="$(ask "Deploy artifact endpoint (blank for AWS S3)" "$DEFAULT_DEPLOY_ENDPOINT")"
POLL_INTERVAL="$(ask "Poll interval in seconds" "${DEFAULT_POLL_INTERVAL:-30}")"

SETUP_ARGS=(
  --deploy-signing-public-key-path "$SERVER_SIGNING_KEY"
  --deploy-region "$DEPLOY_REGION"
  --poll-interval "$POLL_INTERVAL"
)
if [[ -n "$DEPLOY_BUCKET" ]]; then
  SETUP_ARGS+=(--deploy-bucket "$DEPLOY_BUCKET")
fi
if [[ -n "$DEPLOY_ENDPOINT" ]]; then
  SETUP_ARGS+=(--deploy-endpoint "$DEPLOY_ENDPOINT")
fi

cd "/tmp/$CLONE_DIR"
sudo -H bash scripts/setup.sh "${SETUP_ARGS[@]}"
FORGE_ADD_PROJECT

bash /tmp/forge-add-project.sh
```

This helper reuses the server-wide signing public key and existing deploy bucket
defaults, creates or reuses the GitHub machine-user SSH key, clones the repo,
then runs setup for the new app/environment.

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

Path B prefills the deploy bucket, region, endpoint, poll interval, and public
signing key path when it can find existing values. You can still change them at
the setup prompts for a special case.

Check the public signing key exists:

```bash
sudo test -f /etc/forge/deploy-signing.pub && echo "public signing key exists"
```

If it does not exist, the Path B helper asks you to paste the contents of
`deploy-signing.pub` and installs it at `/etc/forge/deploy-signing.pub`.

The helper above includes GitHub key creation, clone, and setup. Sections 6 and
7 below are the manual equivalent if you do not want to use the copy-paste
helper.

## 6. Manual: Prepare GitHub Access And Clone

Do this as `ops`, not `root`.

```bash
ssh ops@<server-ip>
```

There are two supported GitHub access styles:

1. **Machine user key:** one SSH key added to a GitHub machine user that has
   read-only access to the repos this server may clone. This is easiest for many
   repos.
2. **Repo deploy key:** one SSH key added under a single repository's deploy
   keys. This is stricter, but one key cannot be reused across every repo.

For the machine user style, generate one server GitHub key as `ops`:

```bash
ssh-keygen -t ed25519 -C "forge-deploy@<server-name>" -f ~/.ssh/github_forge_deploy -N ""
cat ~/.ssh/github_forge_deploy.pub
```

Add the printed public key to the GitHub machine user:

```text
GitHub machine user -> Settings -> SSH and GPG keys -> New SSH key
```

Then grant that machine user read-only access to the repositories this server
needs to clone.

For the repo deploy key style, generate one key per repository instead:

```bash
ssh-keygen -t ed25519 -C "deploy@abc-project" -f ~/.ssh/abc_project_deploy -N ""
cat ~/.ssh/abc_project_deploy.pub
```

Add the printed public key to GitHub:

```text
Repository -> Settings -> Deploy keys -> Add deploy key
Allow write access: off
```

Clone the repository into `/tmp` using the machine user key:

```bash
cd /tmp
GIT_SSH_COMMAND='ssh -i ~/.ssh/github_forge_deploy -o IdentitiesOnly=yes' \
  git clone git@github.com:<owner>/<repo>.git abc-project
cd /tmp/abc-project
```

Or clone using a repo deploy key:

```bash
cd /tmp
GIT_SSH_COMMAND='ssh -i ~/.ssh/abc_project_deploy -o IdentitiesOnly=yes' \
  git clone git@github.com:<owner>/<repo>.git abc-project
cd /tmp/abc-project
```

Do not copy all of `/root/.ssh` into `ops`. Only copy
`/root/.ssh/authorized_keys` for server login. GitHub clone keys should live
under `/home/ops/.ssh` and be owned by `ops`.

## 7. Manual: Run Setup For One App Environment

From the temporary clone:

```bash
sudo -H bash scripts/setup.sh
```

Use these prompt values as the pattern:

```text
App name: abc-project
Environment (staging/production): staging
Domain for this app: staging.example.com
PostgreSQL username: abc_project_staging
Database name: abc_project_staging
Password for 'abc_project_staging': leave blank to auto-generate
Configure S3-compatible credentials now: y
S3-compatible Access Key ID: <server reader access key id>
S3-compatible Secret Access Key: <server reader secret access key>
Default region: auto
Default output format: json
HTTP port for this app: 4100
WebSocket port for this app: 5100
Obtain SSL certificate: y
Deploy artifact bucket: team-deployments
Deploy artifact region: auto
Deploy artifact endpoint: https://<account-id>.r2.cloudflarestorage.com
Poll interval in seconds: 30
Deploy signing public key path: /etc/forge/deploy-signing.pub
```

For app name, use the base project slug only:

```text
forge-starter
abc-project
```

For environment, use:

```text
staging
production
```

Examples:

| Desired install | App name prompt | Environment prompt | Resulting app id |
|---|---|---|---|
| ABCProject staging | `abc-project` | `staging` | `abc-project-staging` |
| ABCProject production | `abc-project` | `production` | `abc-project-production` |
| Forge-Starter staging | `forge-starter` | `staging` | `forge-starter-staging` |
| Forge-Starter production | `forge-starter` | `production` | `forge-starter-production` |

On the same server, every app/environment needs unique HTTP and WebSocket ports.
Example port plan:

| App id | HTTP | WebSocket |
|---|---:|---:|
| `abc-project-staging` | 4100 | 5100 |
| `abc-project-production` | 4101 | 5101 |
| `forge-starter-staging` | 4102 | 5102 |
| `forge-starter-production` | 4103 | 5103 |
| `another-project-staging` | 4104 | 5104 |
| `another-project-production` | 4105 | 5105 |

If `/root/.aws` is already configured with the server reader token from a
previous setup on the same server, you can answer `n` to configuring S3
credentials. Still fill the deploy bucket, region, endpoint, and public signing
key prompt for each app environment.

After setup, edit runtime secrets:

```bash
sudo nano /opt/abc-project-staging/.env
```

Check these values:

```env
APP__ENVIRONMENT=staging
SERVER__PORT=4100
WEBSOCKET__PORT=5100
WEBSOCKET__ALLOWED_ORIGINS=["https://staging.example.com"]
DATABASE__URL=postgres://...
REDIS__URL=redis://127.0.0.1:6379
```

Add app-specific production secrets here, not in local `.env.staging` and not in
the deploy bucket.

Remove the temporary clone when setup is finished:

```bash
rm -rf /tmp/abc-project
```

Repeat this setup section for every app/environment on the server.

## 8. Build And Upload From Local

From the local project directory:

```bash
make deploy
```

When prompted:

```text
App name [abc-project]: abc-project
Environment (staging/production) [staging]: staging
```

The build script will:

1. Build the Linux artifact in Docker.
2. Verify the zip only contains runtime-safe files.
3. Create `app.zip`, `app.zip.sha256`, `release.manifest`, and
   `release.manifest.sig`.
4. Upload the version folder to:

```text
s3://team-deployments/_deployments/abc-project/staging/{VERSION}/
```

5. Upload `_deployments/abc-project/staging/VERSION` last.

## 9. Start Or Check The Server Poller

On the server:

```bash
sudo systemctl start abc-project-staging-deploy-poll
sudo journalctl -u abc-project-staging-deploy-poll -f
```

Useful commands:

```bash
sudo make -C /opt/abc-project-staging status
sudo make -C /opt/abc-project-staging versions
sudo make -C /opt/abc-project-staging deploy-check
sudo make -C /opt/abc-project-staging doctor
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
sudo journalctl -u abc-project-staging-deploy-poll -n 200 --no-pager
sudo make -C /opt/abc-project-staging deploy-check
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
