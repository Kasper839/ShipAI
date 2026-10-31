# ShipAI

## Private infrastructure control for Linux AI servers

**ShipAI is a private-by-design Electron desktop control plane for remote Linux server management, Docker telemetry, and hardware-aware Ollama model deployment over SSH.** Connect to a host, understand its live capacity, operate its AI infrastructure, and deploy a model that fits—without sending your infrastructure or prompts through a hosted control plane.

[![License](https://img.shields.io/badge/license-MIT-22c55e.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Kasper839/ShipAI?display_name=tag&sort=semver&color=2563eb)](https://github.com/Kasper839/ShipAI/releases)
[![Electron](https://img.shields.io/badge/Electron-38.x-47848f?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![SSH2](https://img.shields.io/badge/SSH2-1.16.x-111827?logo=openssh&logoColor=white)](https://github.com/mscdex/ssh2)

> **Your server. Your models. Your session.**
>
> ShipAI connects directly from your desktop to your Linux host over encrypted SSH. It is not a cloud proxy, SaaS dashboard, or telemetry collector.

## Why ShipAI?

Running a private AI server often means switching between SSH terminals, Docker commands, hardware utilities, and model documentation. ShipAI brings those workflows into one focused desktop interface while keeping execution on the server you control.

## Key features

### ✨ v1.1.0 highlights

- Save multiple SSH server profiles locally and select them from the connection screen
- Protect saved passwords with the operating-system-backed Electron `safeStorage` API
- Reuse password profiles without re-entering credentials; private-key profiles store only the key-file path
- See live Ollama pull percentage and status updates while large models download
- Receive an explicit dashboard error when an active SSH connection is lost

### 📊 Real-time telemetry

- Live CPU utilization and temperature
- RAM utilization and detected VRAM
- Network activity, disk I/O, mounted filesystem capacity, and uptime
- Environment health for Docker and Ollama
- Hardware inspection before model deployment

### 🧠 Hardware-aware AI marketplace

- Browse models by deployment class and capability
- Compare quantized minimums and recommended inference capacity with the connected host
- See clear compatibility states: supported, slower with quantization, or incompatible
- Pull and remove Ollama models from the remote server
- Start a streamed chat with installed models

### 🐳 Docker and Ollama management

- Inspect running and stopped containers
- Start, stop, restart, and view recent container logs
- Initialize the remote Docker environment when required
- Install or detect Ollama on the host
- Pull models and start the Ollama service remotely

### ⚡ Power controls

- Confirmed remote restart and shutdown actions
- Uses the active sudo session and reports command failures explicitly

### 🔒 Zero-cloud privacy

- Direct SSH connection from the desktop to the target host
- No ShipAI account, hosted API, or third-party telemetry service
- Saved SSH passwords are encrypted with the local operating system credential store; sudo passwords remain session-only
- Prompts, model traffic, and operational commands stay on your infrastructure

## Supported AI models

ShipAI’s catalogue is grouped by the kind of hardware and workload it targets. The names below are the models currently represented in the built-in catalogue; model availability and licensing remain subject to each upstream project’s terms.

| Category | Models | Typical use |
| --- | --- | --- |
| **Edge** | Phi-3.5 Mini, Phi-4, Llama 3.1 8B, Gemma 2 9B, Gemma 2 27B | Low-cost inference, chat, extraction, summarization, and compact local assistants |
| **High Performance** | Qwen 2.5 Coder 14B/32B, DeepSeek-R1 Distill 14B/32B, CodeLlama 34B/70B, Llama 3.1 70B | Coding agents, reasoning, long-context work, and workstation or multi-GPU deployments |
| **Enterprise / Agentic** | Qwen 2.5 72B, Llama 3.1 405B, DeepSeek R1, DeepSeek V4, GLM-5.2, GLM-5.3, Kimi K3 | Large-scale reasoning, tool use, autonomous workflows, and multi-user serving |

### How compatibility is calculated

When you connect, ShipAI reads the target server’s memory and GPU capacity. Each catalogue entry contains:

- A **Q4_K_M minimum** for a practical quantized deployment
- A **recommended RAM and VRAM profile** for better throughput and multi-user load
- Model scale, architecture, context window, capabilities, and license metadata

ShipAI compares the model’s minimum RAM and VRAM with the detected host. A model is marked **incompatible** when the minimum is not met, or **runs with quantization / slow** when the minimum is met but the recommended profile is not. These are deployment guidance signals—not performance guarantees; thermals, drivers, context length, concurrency, and quantization all affect real-world results.

## Prerequisites

### Local computer

ShipAI runs on Windows, macOS, and Linux through Electron.

| Platform | Requirements |
| --- | --- |
| **Windows** | Windows 10 or later, x64, with network access to the target host |
| **macOS** | A supported Electron/macOS system with network access to the target host |
| **Linux** | A supported Electron/Linux desktop environment with network access to the target host |
| **Building from source** | Node.js 18+ and npm; the repository uses Electron 38 and electron-builder |

The local computer does not need a GPU. GPU memory matters on the **target Linux server** where Ollama runs.

### Target Linux server

- A supported Linux distribution with an SSH server and `systemd`
- A reachable SSH port (22 by default, or your configured port)
- An SSH user with permission to run the required operations
- `sudo` access for Ollama installation, Docker initialization, and power controls
- Docker Engine and Docker Compose support for container management
- `curl` for Ollama API discovery and installation
- A compatible NVIDIA/AMD/Intel GPU stack when GPU acceleration is desired
- Sufficient disk space for Docker images and model weights

ShipAI can report missing Docker/Ollama components, but it does not remove the need to review your server’s operating system, GPU drivers, storage, and security policy.

## SSH setup

Complete these steps on the **target Linux server** before connecting from ShipAI.

### Ubuntu or Debian

```bash
sudo apt update
sudo apt install -y openssh-server
sudo systemctl enable --now ssh
sudo systemctl status ssh --no-pager
```

### Arch Linux

```bash
sudo pacman -Sy --needed openssh
sudo systemctl enable --now sshd
sudo systemctl status sshd --no-pager
```

### Fedora or RHEL

```bash
sudo dnf install -y openssh-server
sudo systemctl enable --now sshd
sudo systemctl status sshd --no-pager
```

`enable --now` starts the service immediately and enables it at boot. Use the service name provided by your distribution: Ubuntu and Debian commonly use `ssh`; Arch, Fedora, and RHEL commonly use `sshd`.

### Verify reachability and firewall access

On the server, confirm that SSH is listening:

```bash
sudo ss -tlnp | grep ':22'
```

If UFW is enabled, allow SSH before connecting. For a non-default SSH port, replace `22/tcp` with your configured port:

```bash
sudo ufw allow ssh
sudo ufw status verbose
```

From the local computer, test the connection before opening ShipAI:

```bash
ssh -p 22 operator@192.0.2.10
```

The command uses the documentation-only address `192.0.2.10` and the example account `operator`; use the actual account and private address configured for your server. Do not expose SSH to the public internet without applying your organization’s hardening policy; prefer a private network, VPN, firewall allowlist, key-based authentication, and a non-root operator account.

## Quick start and installation

### Option A: Windows installer

1. Download the latest `ShipAI Setup *.exe` from the [GitHub Releases page](https://github.com/Kasper839/ShipAI/releases).
2. Run the installer and launch **ShipAI** from the Start menu.
3. If Windows Defender SmartScreen displays **Windows protected your PC**, select **More info**, verify that the application is ShipAI from the release you intended to download, and select **Run anyway**.
4. Enter the target host, SSH port, username, SSH password, and—when needed—the sudo password.
5. After connection, review the detected hardware and environment status before installing services or models.

> SmartScreen may warn because an unsigned or newly published open-source build has limited reputation. Only bypass the warning when you downloaded the installer from the official ShipAI repository and have verified the release asset.

### Option B: Build from source

```bash
git clone https://github.com/Kasper839/ShipAI.git
cd ShipAI
npm install
npm start
```

To create a distributable package for your current platform:

```bash
npm run package
```

The packaged artifacts are written to `dist/`. The build configuration targets an NSIS installer on Windows, a DMG on macOS, and an AppImage on Linux.

## First connection

1. Open ShipAI and enter the server hostname or IP address.
2. Confirm the SSH port (22 unless you changed it), username, and credentials.
3. Use a dedicated operator account where practical; do not connect as `root`.
4. Supply a sudo password only when ShipAI needs to install Ollama, initialize Docker, or perform a power action.
5. Review the telemetry dashboard and hardware compatibility indicators.
6. Install only the Docker services and Ollama models you intend to run.

### Saved profile storage

ShipAI stores profiles in `profiles.json` under Electron’s per-user application data directory. The persisted structure is:

```json
{
  "version": 1,
  "profiles": [
    {
      "id": "generated-profile-id",
      "name": "Production GPU server",
      "host": "192.0.2.10",
      "port": 22,
      "username": "operator",
      "authType": "password",
      "keyPath": "",
      "encryptedPassword": "OS-keychain-backed ciphertext",
      "updatedAt": "2026-10-31T00:00:00.000Z"
    }
  ]
}
```

`encryptedPassword` is produced by Electron `safeStorage`; ShipAI never writes a plaintext SSH password to this file. For key-based profiles, only the configured private-key path is persisted and the key contents are read by the main process when connecting.

## Security model

ShipAI is a desktop client that executes remote operations through the active SSH session. Treat the application and the connected server as a privileged administrative boundary.

- **Credentials:** Saved SSH passwords use the operating system credential store through Electron `safeStorage`; sudo passwords and active connection secrets remain in memory for the session. Do not paste credentials into issues, logs, screenshots, shell history, or source files. Disconnect when finished.
- **Transport:** SSH provides the encrypted transport. Validate host keys and use your normal SSH trust process; do not disable host verification to work around a warning.
- **Privileges:** Use a least-privilege operator account with only the sudo rules required by your deployment policy. Docker access can effectively grant root-equivalent control on many Linux hosts.
- **Remote changes:** Docker actions, Ollama installation/model pulls, and reboot/shutdown controls change the target host. Review the selected action and target before confirming it.
- **Isolation:** Run AI workloads in the Docker/Ollama isolation model appropriate for your environment. Keep model APIs bound to trusted interfaces, protect exposed ports, and apply firewall rules independently of ShipAI.
- **Data locality:** ShipAI does not provide a hosted relay. Remote commands, telemetry, prompts, model downloads, and responses travel between your desktop and the target infrastructure.

> ShipAI helps make private infrastructure easier to operate; it does not replace SSH hardening, patch management, network segmentation, backups, or your organization’s security review.

## Contributing

Contributions are welcome, including bug fixes, documentation improvements, accessibility work, translations, and model catalogue updates. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request. Never include passwords, private keys, hostnames, IP addresses, or other secrets in reports or screenshots.

## License

ShipAI is released under the [MIT License](LICENSE).
