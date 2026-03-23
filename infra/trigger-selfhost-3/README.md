# Trigger Self-Host 3

This revision is the cleaned-up version of what actually worked on the VPS after moving away from Coolify and fixing self-hosted Trigger CI/CD.

It is opinionated:

- plain Docker Compose for runtime
- private Trigger webapp bind on `127.0.0.1`
- Caddy or another reverse proxy in front
- fixed internal runner callback settings
- GHCR-backed worker image pushes
- GitHub Actions deploying Trigger tasks on push

## Why This Exists

`trigger-selfhost` was the original Coolify-oriented version.

`trigger-selfhost-2` captured the first successful move to standalone Compose, but it still carried old Traefik/Coolify assumptions and stale Trigger CLI deploy guidance.

`trigger-selfhost-3` bakes in the learnings that mattered:

- do not let Coolify own the Trigger runtime
- keep ingress separate from the Trigger stack
- bind the webapp privately and proxy it deliberately
- keep `TRIGGER_WORKLOAD_API_DOMAIN`, `TRIGGER_WORKLOAD_API_PROTOCOL`, and `TRIGGER_WORKLOAD_API_PORT_EXTERNAL` explicit
- use a real GHCR PAT for worker image pushes
- use a self-hosted Trigger personal access token for CI
- for Trigger CLI `4.4.3`, deploy with `--api-url` and `--env-file`

## Files

- `docker-compose.yml`: standalone Trigger stack
- `.env.example`: required env template
- `Caddyfile.example`: reverse proxy examples
- `github-actions-trigger-deploy.yml`: sample workflow to copy into `.github/workflows/`

## The Important Working Values

These three variables were the difference between healthy runners and a broken stack:

```env
TRIGGER_WORKLOAD_API_DOMAIN=supervisor
TRIGGER_WORKLOAD_API_PROTOCOL=http
TRIGGER_WORKLOAD_API_PORT_EXTERNAL=8020
```

Leave them alone unless you are intentionally redesigning the runner callback path.

## Bootstrap

1. Create a deployment directory on the VPS.
2. Copy `docker-compose.yml` and `.env.example`.
3. Create a real `.env`.
4. Generate the Trigger secrets:

```bash
openssl rand -hex 16
```

Generate separate values for:

- `TRIGGER_SESSION_SECRET`
- `TRIGGER_MAGIC_LINK_SECRET`
- `TRIGGER_ENCRYPTION_KEY`
- `TRIGGER_MANAGED_WORKER_SECRET`

For the internal Postgres and ClickHouse passwords, prefer URL-safe values.
This stack builds connection URLs from those env vars, so raw reserved characters like `/` and `@` make debugging needlessly harder.

5. Set the GHCR values:

- `TRIGGER_DOCKER_REGISTRY_NAMESPACE`
- `TRIGGER_DOCKER_REGISTRY_USERNAME`
- `TRIGGER_DOCKER_REGISTRY_PASSWORD`

The password must be a GitHub PAT with at least:

- `read:packages`
- `write:packages`

If you are cutting over an existing Trigger install instead of starting fresh, point `TRIGGER_VOLUME_*` at the old Docker volume names before the first `docker compose up -d`.
That lets the new runtime adopt the existing Postgres, Redis, ClickHouse, MinIO, and shared worker-token data without an extra copy step.

6. Start the stack:

```bash
docker compose up -d
```

7. Verify health:

```bash
docker compose ps
docker compose logs --tail=200 webapp
docker compose logs --tail=200 supervisor
curl -IksS https://trigger.example.com/healthcheck
```

Healthy shape:

- `webapp` healthy
- `supervisor` healthy
- runners stop getting stuck in `DEQUEUED`

## Reverse Proxy

This stack intentionally does not own ingress.

The webapp binds to:

```text
127.0.0.1:3000
```

Then you proxy that with Caddy, Nginx, or Traefik.

Two common options are shown in `Caddyfile.example`:

- host-installed Caddy: proxy to `127.0.0.1:3000`
- containerized Caddy: join it to `TRIGGER_INTERNAL_NETWORK` and proxy to `trigger-webapp:3000`

If you use Cloudflare with `tls internal`, use SSL mode `Full`, not `Full (strict)`, unless you install a real origin certificate.

## First Login And Project Setup

1. Open `https://trigger.example.com`.
2. Create your admin user.
3. Create the Trigger project.
4. Copy:
   - the project ref
   - the app secret key you want to use
5. Update your app:
   - `trigger.config.ts`
   - `TRIGGER_SECRET_KEY`
   - `TRIGGER_API_URL=https://trigger.example.com`

## CI/CD

Copy `github-actions-trigger-deploy.yml` into `.github/workflows/trigger-deploy.yml`.

Repo secrets you need:

- `TRIGGER_ACCESS_TOKEN`: a self-hosted Trigger personal access token, which starts with `tr_pat_`
- `GHCR_PUSH_TOKEN`: a GitHub PAT that can push the Trigger worker images to GHCR
- `BUILD_ENV`: the env file contents used by Trigger task build and indexing

Prefer creating `TRIGGER_ACCESS_TOKEN` from the Trigger UI:

- Account
- Personal Access Tokens

If your self-hosted version does not expose PAT management there yet, mint the token through the admin or API path your instance supports and store the resulting `tr_pat_...` value in GitHub.

Do not use an org token here unless you have explicitly verified your CLI/auth flow supports it.

## Trigger CLI Notes

For `trigger.dev@4.4.3`, the working deploy shape is:

```bash
npm run trigger:prod -- \
  --api-url "https://trigger.example.com" \
  --env-file /path/to/envfile
```

Important:

- do not rely on the old `--self-hosted --push` guidance
- do not force `--local-build` in this setup

In our case, forcing `--local-build` caused the CLI to ask Trigger for generated registry credentials and failed early. Let the self-hosted stack fall into its normal implicit build path instead.

## GHCR Rule That Bit Us

The Trigger worker image name is not your app image name. It looks like:

```text
ghcr.io/<namespace>/proj_<projectRef>:<version>
```

GitHub Actions `GITHUB_TOKEN` was not enough for this push path in practice.

What worked:

- `docker/login-action` using a real PAT stored as `GHCR_PUSH_TOKEN`
- the same namespace configured in the Trigger stack

## Troubleshooting

### Supervisor unhealthy or runners crash immediately

Check:

- `TRIGGER_WORKLOAD_API_DOMAIN`
- `TRIGGER_WORKLOAD_API_PROTOCOL`
- `TRIGGER_WORKLOAD_API_PORT_EXTERNAL`

The safe values are:

```env
TRIGGER_WORKLOAD_API_DOMAIN=supervisor
TRIGGER_WORKLOAD_API_PROTOCOL=http
TRIGGER_WORKLOAD_API_PORT_EXTERNAL=8020
```

### Trigger deploy fails with `403 Forbidden` while pushing to GHCR

Use a real GHCR PAT for the workflow.

Do not depend on `GITHUB_TOKEN` for the Trigger worker image push.

### Trigger deploy fails before build with unknown CLI flags

You are following stale self-hosted docs or stale notes.

For `4.4.3`, use:

```bash
--api-url
--env-file
```

not:

```bash
--self-hosted
--push
```

### Raw env import API says `Environment not found`

The correct import route shape is:

```text
/api/v1/projects/<projectRef>/envvars/prod/import
```

not:

```text
/api/v1/projects/<projectRef>/envvars/prod.import
```

## Upgrade Notes

If you change Trigger versions later:

1. update `TRIGGER_VERSION`
2. keep the app SDK and CLI compatible
3. re-check the deploy CLI flags before assuming old notes still apply

## Reset

Only do this if the stack is disposable:

```bash
docker compose down -v --remove-orphans
docker compose up -d
```
