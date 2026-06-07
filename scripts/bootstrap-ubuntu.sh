#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/ppj89/family-platform.git}"
APP_DIR="${APP_DIR:-/opt/family-platform}"
APP_USER="${APP_USER:-$USER}"
OPEN_FIREWALL="${OPEN_FIREWALL:-true}"

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required for server bootstrap." >&2
  exit 1
fi

echo "[1/6] Installing Docker prerequisites"
sudo apt-get update
sudo apt-get install -y ca-certificates curl git openssl

echo "[2/6] Installing Docker Engine"
if ! command -v docker >/dev/null 2>&1; then
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" |
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  echo "Docker is already installed."
fi

echo "[3/6] Enabling Docker service"
sudo systemctl enable --now docker
sudo usermod -aG docker "$APP_USER" || true

if [ "$OPEN_FIREWALL" = "true" ] && command -v ufw >/dev/null 2>&1; then
  echo "[4/6] Opening firewall ports 80 and 443"
  sudo ufw allow OpenSSH || true
  sudo ufw allow 80/tcp || true
  sudo ufw allow 443/tcp || true
else
  echo "[4/6] Firewall step skipped"
fi

echo "[5/6] Preparing app directory"
sudo mkdir -p "$APP_DIR"
sudo chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi

echo "[6/6] Bootstrap completed"
echo "Next:"
echo "  cd $APP_DIR"
echo "  scripts/init-prod-env.sh https://your-domain your-domain"
echo "  scripts/deploy-prod-https.sh"
echo
echo "Log out and back in if Docker group permission is not active yet."
