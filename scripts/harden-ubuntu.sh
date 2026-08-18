#!/usr/bin/env bash
set -euo pipefail

SWAP_SIZE="${SWAP_SIZE:-2G}"
ENABLE_UFW="${ENABLE_UFW:-true}"
ENABLE_AUTO_UPDATES="${ENABLE_AUTO_UPDATES:-true}"
DOCKER_LOG_MAX_SIZE="${DOCKER_LOG_MAX_SIZE:-10m}"
DOCKER_LOG_MAX_FILE="${DOCKER_LOG_MAX_FILE:-3}"

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required for server hardening." >&2
  exit 1
fi

echo "[1/5] Installing server hardening packages"
sudo apt-get update
sudo apt-get install -y ufw unattended-upgrades apt-listchanges

echo "[2/5] Configuring swap"
if [ "$SWAP_SIZE" != "0" ] && [ ! -f /swapfile ]; then
  swap_count_mb="$(
    case "$SWAP_SIZE" in
      *G) echo "$(( ${SWAP_SIZE%G} * 1024 ))" ;;
      *M) echo "${SWAP_SIZE%M}" ;;
      *) echo "$SWAP_SIZE" ;;
    esac
  )"
  sudo fallocate -l "$SWAP_SIZE" /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count="$swap_count_mb"
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
elif [ -f /swapfile ]; then
  echo "Swap file already exists."
else
  echo "Swap creation skipped."
fi

echo "[3/5] Configuring Docker log rotation"
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "$DOCKER_LOG_MAX_SIZE",
    "max-file": "$DOCKER_LOG_MAX_FILE"
  }
}
EOF
if command -v docker >/dev/null 2>&1; then
  sudo systemctl restart docker || true
fi

echo "[4/5] Configuring automatic security updates"
if [ "$ENABLE_AUTO_UPDATES" = "true" ]; then
  sudo dpkg-reconfigure -f noninteractive unattended-upgrades
  sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
else
  echo "Automatic security updates skipped."
fi

echo "[5/5] Configuring firewall"
if [ "$ENABLE_UFW" = "true" ]; then
  sudo ufw allow OpenSSH
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw --force enable
  sudo ufw status verbose
else
  echo "UFW enable skipped."
fi

echo "Ubuntu hardening completed."
