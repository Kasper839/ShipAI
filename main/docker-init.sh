#!/bin/sh
set -u

status() {
  printf 'SHIPAI_DOCKER_%s=%s\n' "$1" "$2"
}

run_privileged() {
  if sudo -n "$@" >/dev/null 2>&1; then
    return 0
  fi
  if command -v doas >/dev/null 2>&1 && doas -n "$@" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

if command -v docker >/dev/null 2>&1; then
  status BINARY present
else
  status BINARY missing
  if command -v apt-get >/dev/null 2>&1; then
    install_command="apt-get update -y && apt-get install -y docker.io"
  elif command -v dnf >/dev/null 2>&1; then
    install_command="dnf install -y docker"
  elif command -v yum >/dev/null 2>&1; then
    install_command="yum install -y docker"
  elif command -v pacman >/dev/null 2>&1; then
    install_command="pacman -Sy --noconfirm docker"
  else
    install_command=""
  fi
  if [ -n "$install_command" ] && run_privileged sh -c "$install_command"; then
    status INSTALL installed
  else
    status INSTALL unavailable
    status STATE unavailable
    exit 0
  fi
fi

if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet docker; then
    status SERVICE active
  elif run_privileged systemctl start docker && systemctl is-active --quiet docker; then
    status SERVICE started
  else
    status SERVICE inactive
  fi
elif command -v service >/dev/null 2>&1; then
  if service docker status >/dev/null 2>&1; then
    status SERVICE active
  elif run_privileged service docker start && service docker status >/dev/null 2>&1; then
    status SERVICE started
  else
    status SERVICE inactive
  fi
else
  status SERVICE unavailable
fi

if docker info >/dev/null 2>&1; then
  status SOCKET accessible
  status STATE ready
  exit 0
fi

if run_privileged docker info; then
  status SOCKET sudo
  status STATE ready-sudo
  if run_privileged usermod -aG docker "$USER"; then
    status GROUP added
  else
    status GROUP unavailable
  fi
  exit 0
fi

status SOCKET denied
status STATE repairing
exit 0
