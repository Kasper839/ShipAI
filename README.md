# ShipAI

## High-Performance Remote Server Management & Local AI Marketplace

ShipAI is an Electron desktop control plane for managing Linux AI infrastructure over SSH. Monitor a remote host in real time, operate AI-focused Docker runtimes, and choose Ollama models using hardware-aware compatibility guidance—all from one private workspace.

[![Version](https://img.shields.io/badge/version-v1.0.0%20Stable-2563eb.svg)](https://github.com/Kasper839/ShipAI/releases)
[![License](https://img.shields.io/badge/license-MIT-22c55e.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Electron%20%2F%20Node.js%20%2F%20Linux-64748b.svg)](https://www.electronjs.org/)
[![Linux hosts](https://img.shields.io/badge/hosts-Arch%20Linux%20%7C%20Ubuntu-e95420.svg)](https://ubuntu.com/)

## Why ShipAI?

ShipAI keeps server operations and local AI deployment in one focused interface. Credentials remain in the active session, commands are executed on the connected host, and your models and data stay on your infrastructure.

## Key features

- **Real-time telemetry** — CPU, temperature, RAM, network, disk I/O, and mounted filesystem capacity.
- **Docker lifecycle management** — Start, stop, restart, and inspect AI infrastructure containers without manually repeating shell commands.
- **Hardware-aware AI marketplace** — Compare model requirements with remote RAM and VRAM before pulling a model.
- **Remote power management** — Confirmed remote restart and shutdown controls using the active sudo session.
- **Ollama model operations** — Pull, remove, and start chats with installed models through a streamed interface.
- **Private by design** — ShipAI connects directly to your host over SSH; there is no hosted control plane.

## Supported AI models

The expandable catalogue covers lightweight edge inference through enterprise-scale, multi-GPU systems:

- **Edge and workstation:** Phi-3.5 Mini, Phi-4, Gemma 2, Llama 3.1 8B, Qwen 2.5 Coder, and DeepSeek-R1 Distill.
- **High-performance:** Llama 3.1 70B, CodeLlama, and Qwen 2.5 72B.
- **Enterprise and agentic:** Kimi K3, GLM-5.2/5.3, DeepSeek V4/R1, and Llama 3.1 405B.

Each model includes architecture, context window, capabilities, quantized minimums, recommended inference sizing, and a live compatibility state.

## Quick start

### Prerequisites

- Node.js and npm
- A Linux host reachable over SSH
- Docker installed on the remote host for AI infrastructure containers
- Ollama installed on the remote host, or permission to install it through ShipAI
- A user with the required sudo permissions for Docker/Ollama setup and power actions

### Install from source

```bash
git clone https://github.com/Kasper839/ShipAI.git
cd ShipAI
npm install
npm start
```

Connect using the host address, SSH port, username, and password. ShipAI then probes the host, reports hardware capability, and opens the AI infrastructure dashboard.

## Development

Run the Electron app locally:

```bash
npm run dev
```

Create a distributable package with:

```bash
npm run package
```

The application entry point is `main/main.js`; the renderer and model catalogue live under `app/`.

## Security notes

ShipAI is intended for trusted, SSH-accessible infrastructure. Use a dedicated operator account where practical, restrict SSH exposure, and grant only the sudo permissions required by your deployment policy. Never commit credentials, private keys, or host-specific secrets.

## Contributing

Bug reports, documentation improvements, model catalogue updates, and code contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request.

## License

ShipAI is released under the [MIT License](LICENSE).

