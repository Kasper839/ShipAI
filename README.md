# ShipAI

[![Release](https://img.shields.io/github/v/release/Kasper839/ShipAI?display_name=tag&sort=semver&color=2563eb)](https://github.com/Kasper839/ShipAI/releases)
[![License](https://img.shields.io/badge/license-MIT-22c55e.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-38.x-47848f?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![SSH2](https://img.shields.io/badge/SSH2-1.16.x-111827?logo=openssh&logoColor=white)](https://github.com/mscdex/ssh2)

## Private infrastructure control for Linux AI servers

**ShipAI v1.5.0** is a private-by-design Electron desktop application for managing remote Linux servers over SSH. It combines live hardware telemetry, Ollama model deployment and chat, Docker service installation, container lifecycle controls, and safe remote power operations in one focused workspace.

ShipAI connects directly from your computer to the server you select. It is not a cloud proxy, hosted dashboard, or SaaS control plane.

> **Your server. Your models. Your session.**

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [First connection](#first-connection)
- [Docker service catalogue](#docker-service-catalogue)
- [Ollama and model management](#ollama-and-model-management)
- [Security and privacy](#security-and-privacy)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Features

### Server dashboard

- Live CPU, RAM, VRAM, temperature, network, disk I/O, filesystem, and uptime telemetry.
- Docker and Ollama health detection.
- Hardware-aware model compatibility guidance based on available RAM and VRAM.
- Responsive graphite interface for narrow windows, laptops, and large monitors.
- Collapsible navigation on small screens.

### Ollama and AI

- Detect or install Ollama on the remote host.
- Pull, monitor, cancel, and remove models.
- Stream chat responses from installed models.
- Display active VRAM, freeable VRAM, and context overhead.
- Retry transient Ollama failures and recover interrupted SSH sessions without freezing the UI.

### Docker

- One-click catalogue of ready-to-run services; no port or environment form is required.
- Automatic port fallback when the preferred host port is occupied.
- Every running service displays the actual reachable URL, including the selected fallback port.
- Copy-to-clipboard URL action and service-specific “What to do next” instructions.
- Start, stop, restart, inspect logs, and delete containers.
- Deletion uses `docker rm -f`; a second confirmation controls whether matching Docker volumes/data should also be removed.
- AI containers include `host.docker.internal:host-gateway` where needed to reach Ollama on the host.
- All remote operations run through SSH and Docker commands; ShipAI does not upload shell scripts to the server.

### Remote operations

- Confirmed restart and shutdown controls.
- SSH reconnect handling with explicit status and error messages.
- Bounded command execution and cancellation to avoid a permanently blocked interface.

## Requirements

### Local computer

ShipAI runs on Windows, macOS, and Linux through Electron.

| Platform | Requirement |
| --- | --- |
| Windows | Windows 10 or later, x64 |
| macOS | A version supported by Electron 38 |
| Linux | A desktop environment supported by Electron 38 |
| From source | Node.js 18+ and npm |

The local computer does not need a GPU. GPU memory matters on the target server where Ollama runs.

### Target Linux server

- OpenSSH server with a reachable SSH port.
- A user with permission to execute the required operations; `sudo` is needed for installation and power controls.
- Docker Engine for Docker features.
- `curl` for Ollama discovery and installation.
- `systemd` is recommended for service recovery.
- Enough disk space for Docker images, container data, and model weights.
- A correctly installed NVIDIA, AMD, or Intel driver stack when GPU acceleration is required.

ShipAI reports missing Docker or Ollama components, but it does not replace operating-system hardening, backups, firewall policy, or driver maintenance.

## Installation

### Recommended: release installer

1. Download the latest installer from [GitHub Releases](https://github.com/Kasper839/ShipAI/releases).
2. Verify that the asset belongs to the intended ShipAI release.
3. Install and start ShipAI.
4. On Windows, SmartScreen can warn about an unsigned or new open-source build. Only bypass that warning after verifying the download source.

### Build from source

```bash
git clone https://github.com/Kasper839/ShipAI.git
cd ShipAI
npm install
npm start
```

Create a distributable package for the current platform:

```bash
npm run package
```

Build artifacts are written to `dist/`. The project is configured for an NSIS installer on Windows, a DMG on macOS, and an AppImage on Linux.

## Preparing the server

### Ubuntu or Debian

```bash
sudo apt update
sudo apt install -y openssh-server curl
sudo systemctl enable --now ssh
```

### Fedora or RHEL

```bash
sudo dnf install -y openssh-server curl
sudo systemctl enable --now sshd
```

### Arch Linux

```bash
sudo pacman -Sy --needed openssh curl
sudo systemctl enable --now sshd
```

Check that SSH is listening:

```bash
sudo ss -tlnp | grep ':22'
```

If UFW is enabled, allow the configured SSH port before connecting:

```bash
sudo ufw allow ssh
sudo ufw status verbose
```

Test the connection from the local computer:

```bash
ssh -p 22 operator@192.0.2.10
```

The address and account above are examples. Prefer a dedicated non-root operator account, key-based authentication, a VPN or private network, and a firewall allowlist.

## First connection

1. Open ShipAI and enter the server hostname or IP address.
2. Confirm the SSH port, username, and SSH password or private-key configuration.
3. Enter a sudo password only when required by the selected operation.
4. Optionally save the SSH profile locally.
5. Review the telemetry and health status after connecting.
6. Install Ollama or Docker services only when the server has sufficient resources.

Saved profile passwords are never returned to the renderer for display. Password fields remain masked by default and can be temporarily revealed with the eye control.

## Docker service catalogue

Open **Docker** in the sidebar and select **Start** on a service card. ShipAI uses a validated preset, chooses a free host port automatically, starts the container over SSH, and refreshes the container list.

### Home & Cloud

| Service | Default URL port | After opening |
| --- | ---: | --- |
| Nextcloud | `8080` | Create the first admin account and complete the storage/database setup. |
| Immich | `2283` | Create the administrator and configure the mobile app with the displayed server URL. |
| Jellyfin | `8096` | Select a language, add media libraries, and create users. |
| AdGuard Home | `3005` | Complete the wizard, then point the router DNS to the server IP. |
| Home Assistant | `8123` | Create an account, set the home location, and add integrations. |
| qBittorrent | `8083` | Sign in, immediately change the initial password, and configure download storage. |

### AI & LLM

| Service | Default URL port | After opening |
| --- | ---: | --- |
| Open WebUI | `3000` | Create the first admin account and set Ollama to `http://host.docker.internal:11434`. |
| AnythingLLM | `3001` | Select Ollama, use the displayed host endpoint, then upload PDFs to a workspace. |
| LibreChat | `3080` | Complete the initial configuration and configure the Ollama endpoint. |
| Flowise | `3002` | Create a flow and select Ollama at `http://host.docker.internal:11434`. |
| Qdrant | `6333` | Use the API or dashboard to create collections; secure it before exposing it publicly. |

### Self-Hosted & Cloud

| Service | Default URL port | After opening |
| --- | ---: | --- |
| Portainer | `9000` | Create the first admin account and select the local Docker environment. |
| Uptime Kuma | `3003` | Create an admin account and add the URLs to monitor. |
| Vaultwarden | `8081` | Configure HTTPS/reverse proxy before using real credentials. |
| n8n | `5678` | Create the owner account and configure HTTPS for public access. |

### Databases & Development

| Service | Default port | Connection notes |
| --- | ---: | --- |
| PostgreSQL | `5432` | Initial database is `shipai`, user is `shipai`; change the initial password immediately. |
| Redis | `6379` | The preset has no authentication; keep the port on a trusted network. |
| MongoDB | `27017` | Configure authentication and network restrictions for production. |
| Adminer | `8082` | Use the database server address and its database port in the login form. |
| Gitea | `3004` | Create the first account and complete the setup wizard; SQLite is suitable for evaluation only. |

### Port fallback and URLs

The default port is only a preference. If it is already bound, ShipAI retries with alternative ports and reports the port that was actually assigned. Always use the URL shown on the resulting container card rather than assuming the default port.

The URL is built from the connected server address and the real host port, for example:

```text
http://203.0.113.25:3010
```

Do not expose databases, Redis, Qdrant, Docker sockets, or administration panels directly to the public internet. Use firewall rules, a private network, authentication, and HTTPS/reverse proxy as appropriate.

### Container lifecycle

- **Start / Stop:** change the running state without deleting the container.
- **Restart:** recreate the running process while retaining the container.
- **Logs:** inspect recent output when a service does not become ready.
- **Delete:** stop and remove the container. The additional data confirmation controls volume cleanup; volume deletion is irreversible.

## Ollama and model management

Use the **Marketplace** view to compare models against detected server resources. ShipAI distinguishes between a supported deployment, a deployment that may be slow with quantization, and an incompatible model.

Compatibility is guidance, not a performance guarantee. Context length, concurrency, thermals, drivers, quantization, and storage speed affect real-world results.

For AI Docker services, the usual Ollama endpoint is:

```text
http://host.docker.internal:11434
```

The preset adds the host gateway mapping where required. If the service cannot reach Ollama, verify that Ollama is running, that the server firewall permits the local Docker path, and that the displayed endpoint matches the service instructions.

## Security and privacy

ShipAI is an administrative client. Treat both the application and the connected server as privileged.

- **Credentials:** saved SSH passwords are encrypted with Electron `safeStorage` and backed by the local operating-system credential store. Sudo passwords remain session-only.
- **Zero-leak handling:** credentials are not written as plaintext to JSON, `localStorage`, logs, or console output. Never paste secrets into issues, screenshots, shell history, or source files.
- **Electron isolation:** the renderer runs with `contextIsolation`, disabled Node integration, and sandboxing. The preload bridge exposes only the required IPC methods.
- **Transport:** SSH encrypts the connection. Keep host-key verification enabled and investigate unexpected host-key changes.
- **Command safety:** Docker preset values, image names, ports, and environment keys are validated before execution; values are safely shell-quoted. ShipAI does not execute user-entered shell fragments.
- **Privileges:** Docker access can provide root-equivalent control. Use least privilege and review sudo policy.
- **Network exposure:** bind services to trusted interfaces, configure firewalls, use HTTPS for public administration, and change default credentials immediately.
- **Telemetry:** no hosted control plane is required. Optional anonymous lifecycle telemetry is inactive unless `POSTHOG_API_KEY` is configured.

Security issues should be reported privately where possible. Do not include real credentials, private keys, public IPs, or server logs containing secrets.

## Troubleshooting

### Cannot connect over SSH

1. Test the same host, port, and user with the native `ssh` command.
2. Confirm that the SSH service is running and the firewall allows the port.
3. Confirm the username and authentication method.
4. Check that the server is reachable from the local network or VPN.
5. Disconnect and reconnect in ShipAI after correcting the server configuration.

### Docker service fails to start

1. Open the container logs from the service card.
2. Confirm Docker is installed and running: `sudo systemctl status docker`.
3. Check disk space with `df -h`.
4. Check whether the image can be pulled and whether the server can reach its registry.
5. Confirm the displayed fallback port is allowed by the firewall.

### A web service opens but is not usable

Follow the service-specific “What to do next” instructions. Many services require a first admin account, a database setup, HTTPS, or a separate mobile/router configuration step.

### Ollama is unavailable

Check the service and API from the server:

```bash
systemctl status ollama --no-pager
curl http://127.0.0.1:11434/api/tags
```

Then verify the container endpoint and Docker host gateway mapping. Do not publish Ollama publicly just to work around a local connectivity issue.

## Development

Useful commands:

```bash
npm install
npm start
npm run check
npm run package
npm audit
npm audit --omit=dev
```

`npm run check` validates JavaScript syntax for the main process, preload, and renderer modules. Run it before submitting changes. Keep `package.json` and `package-lock.json` synchronized when changing dependencies.

The main process owns SSH, Docker, credentials, Ollama requests, and privileged IPC handlers. The preload script provides the narrow renderer bridge. The renderer is responsible for views, user interaction, telemetry presentation, and Docker cards.

## Contributing

Contributions are welcome, including bug fixes, documentation, accessibility, translations, and model catalogue improvements. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request.

Please include:

- a clear description of the behavior being changed;
- reproducible steps or a focused test;
- platform and Electron version information where relevant;
- no passwords, private keys, hostnames, IP addresses, or secret logs.

## License

ShipAI is released under the [MIT License](LICENSE).
