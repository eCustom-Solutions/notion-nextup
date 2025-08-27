# Deployment Guide – EC2

This guide explains how to deploy the Notion-NextUp webhook server to the production EC2 instance.

## Quick Deploy (recommended)

Use the helper script added in `scripts/deploy-ec2.sh`:

```bash
# Deploy whatever is on origin/main
./scripts/deploy-ec2.sh

# Deploy a specific commit / tag / branch
./scripts/deploy-ec2.sh 8567b3c
```

The script will:
1. SSH to the instance (default `admin@3.131.200.212` using `~/.ssh/id_ed25519`)
2. `git fetch origin && git reset --hard <commit>`
3. `npm ci --silent`
4. `npm run --silent build`
5. `pm2 restart notion-webhook --update-env`

If any step fails, the script exits non-zero.

### Environment Variables
Override any of these when calling the script:

| Variable        | Default                          | Description                                   |
|-----------------|----------------------------------|-----------------------------------------------|
| `EC2_HOST`      | `3.131.200.212`                  | Public hostname / IP of EC2 instance          |
| `EC2_USER`      | `admin`                          | SSH username                                  |
| `SSH_KEY_PATH`  | `~/.ssh/id_ed25519`              | Path to private key                           |
| `REMOTE_DIR`    | `/opt/myapp/notion-nextup`       | Path to repo on the instance                  |
| `PM2_APP_NAME`  | `notion-webhook`                 | pm2 process name                              |

Example – deploy feature branch with custom key:

```bash
EC2_HOST=ec2-3-222-111-99.us-east-2.compute.amazonaws.com \
SSH_KEY_PATH=~/.ssh/other_key \
./scripts/deploy-ec2.sh feature/my-branch
```

---

## Manual Steps (fallback)
When troubleshooting, you can run the commands by hand:

```bash
ssh -i ~/.ssh/id_ed25519 admin@3.131.200.212
cd /opt/myapp/notion-nextup
sudo -u appuser git fetch origin
sudo -u appuser git reset --hard origin/main   # or desired commit
sudo -u appuser npm ci --silent
sudo -u appuser npm run --silent build
sudo -u appuser pm2 restart notion-webhook --update-env
```

---

Happy shipping! 🍀
