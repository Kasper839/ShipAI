#!/usr/bin/env bash

set -Eeuo pipefail

readonly DOCKER_KEYRING="/etc/apt/keyrings/docker.asc"
readonly DOCKER_SOURCES_LIST="/etc/apt/sources.list.d/docker.list"
readonly DOCKER_GPG_URL="https://download.docker.com/linux"

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  readonly RED=$'\033[0;31m'
  readonly GREEN=$'\033[0;32m'
  readonly YELLOW=$'\033[1;33m'
  readonly BLUE=$'\033[0;34m'
  readonly NC=$'\033[0m'
else
  readonly RED=""
  readonly GREEN=""
  readonly YELLOW=""
  readonly BLUE=""
  readonly NC=""
fi

log() {
  printf '%b[%s]%b %s\n' "${BLUE}" "INFO" "${NC}" "$*"
}

success() {
  printf '%b[%s]%b %s\n' "${GREEN}" " OK " "${NC}" "$*"
}

warn() {
  printf '%b[%s]%b %s\n' "${YELLOW}" "WARN" "${NC}" "$*" >&2
}

die() {
  printf '%b[%s]%b %s\n' "${RED}" "ERROR" "${NC}" "$*" >&2
  exit 1
}

on_error() {
  local exit_code=$?
  printf '%b[%s]%b Installation failed on line %s (exit code %s).\n' \
    "${RED}" "ERROR" "${NC}" "${BASH_LINENO[0]}" "${exit_code}" >&2
  exit "${exit_code}"
}

trap on_error ERR

if [[ "${EUID}" -ne 0 ]]; then
  die "This script must be run as root. Try: sudo $0"
fi
success "Running with root privileges."

if command -v docker >/dev/null 2>&1; then
  success "Docker is already installed ($(docker --version)). Skipping installation."
  exit 0
fi

if [[ ! -r /etc/os-release ]]; then
  die "Cannot identify the operating system: /etc/os-release is missing."
fi
# shellcheck disable=SC1091
source /etc/os-release

case "${ID:-}" in
  ubuntu|debian)
    ;;
  *)
    die "Unsupported distribution '${ID:-unknown}'. This script supports Ubuntu and Debian only."
    ;;
esac

if [[ -z "${VERSION_CODENAME:-}" ]]; then
  if command -v lsb_release >/dev/null 2>&1; then
    VERSION_CODENAME="$(lsb_release -sc)"
  else
    die "Could not determine the distribution codename. Install lsb-release or set VERSION_CODENAME."
  fi
fi

if ! command -v apt-get >/dev/null 2>&1; then
  die "apt-get is required but was not found."
fi
if ! command -v curl >/dev/null 2>&1; then
  log "curl is not installed yet; it will be installed with the prerequisites."
fi

case "$(dpkg --print-architecture)" in
  amd64|arm64|armhf|ppc64el|s390x)
    DOCKER_ARCH="$(dpkg --print-architecture)"
    ;;
  architecture)
    die "Could not determine the system architecture."
    ;;
  *)
    die "Unsupported architecture '$(dpkg --print-architecture)'."
    ;;
esac

log "Updating package lists."
apt-get update
success "Package lists updated."

log "Installing repository prerequisites."
apt-get install --yes --no-install-recommends \
  apt-transport-https \
  ca-certificates \
  curl \
  gnupg
success "Repository prerequisites installed."

log "Configuring Docker's official signing key."
install --directory --mode=0755 /etc/apt/keyrings
curl --fail --silent --show-error --location "${DOCKER_GPG_URL}/${ID}/gpg" \
  | gpg --dearmor --yes --output "${DOCKER_KEYRING}"
chmod 0644 "${DOCKER_KEYRING}"
success "Docker signing key installed."

log "Configuring Docker's official ${ID} repository."
printf 'deb [arch=%s signed-by=%s] %s/%s %s stable\n' \
  "${DOCKER_ARCH}" \
  "${DOCKER_KEYRING}" \
  "${DOCKER_GPG_URL}" \
  "${ID}" \
  "${VERSION_CODENAME}" \
  > "${DOCKER_SOURCES_LIST}"
chmod 0644 "${DOCKER_SOURCES_LIST}"
success "Docker repository configured."

log "Updating package lists with the Docker repository."
apt-get update

log "Installing Docker Engine, containerd, and Docker Compose plugin."
apt-get install --yes \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin
success "Docker packages installed."

if ! command -v systemctl >/dev/null 2>&1; then
  die "systemctl is required to enable and start Docker."
fi

log "Enabling Docker to start on system boot."
systemctl enable docker.service
systemctl enable containerd.service
success "Docker services enabled."

log "Starting Docker."
systemctl start docker.service
systemctl is-active --quiet docker.service
success "Docker is running and ready."

printf '\n%bDocker installation completed successfully.%b\n' "${GREEN}" "${NC}"
docker --version
docker compose version
