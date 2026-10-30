"use strict";

const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { Client } = require("ssh2");
const { SshManager } = require("./sshManager");

let mainWindow;
let sshClient = null;
let sshConnection = null;
const sshManager = new SshManager(() => sshClient);
let remoteStatusCache = { expiresAt: 0, value: null, pending: null };
let environmentStatus = {
  initialized: false,
  ok: false,
  missingComponents: [],
  error: "Environment initialization has not run."
};

const connectionError = (error) => {
  const code = error && typeof error === "object" ? error.code : "";
  const messages = {
    ECONNREFUSED: "Connection refused. Verify the SSH service and port.",
    ECONNRESET: "The server closed the SSH connection.",
    ETIMEDOUT: "The server did not respond within 10 seconds.",
    ENOTFOUND: "The host could not be found. Check the IP address or hostname.",
    EHOSTUNREACH: "The host is unreachable from this computer.",
    EAI_AGAIN: "The host name could not be resolved. Try again."
  };
  const message = messages[code] || (error instanceof Error ? error.message : String(error));
  return new Error(message || "The SSH operation failed.");
};

const closeSshConnection = () => {
  if (sshClient) {
    sshClient.end();
    sshClient = null;
  }
  sshConnection = null;
  sshManager.clearSession();
  remoteStatusCache = { expiresAt: 0, value: null, pending: null };
};

const executeRemoteResult = (command, options = {}) => sshManager.execute(command, {
  timeoutMs: options.timeoutMs || 10000,
  input: options.input || "",
  onStdout: options.onStdout,
  onStderr: options.onStderr
});

const executeRemote = async (command, options = {}) => {
  const result = await executeRemoteResult(command, options);
  if (result.code !== 0) {
    throw new Error(result.stderr || `Remote command exited with code ${result.code}.`);
  }
  return result.stdout;
};

const missingComponentsFrom = (output) => {
  const missing = new Set();
  const text = `${output.stdout || ""}\n${output.stderr || ""}`.toLowerCase();
  if (/modprobe:.*not found|modprobe:.*no such file|br_netfilter.*not found/.test(text)) missing.add("br_netfilter");
  if (/systemctl:.*not found|systemctl:.*no such file/.test(text)) missing.add("systemd");
  if (/containerd.*(not found|no such file)|unit containerd.*not found/.test(text)) missing.add("containerd");
  if (/docker.*(not found|no such file)|unit docker.*not found/.test(text)) missing.add("docker");
  if (/sudo:.*(password is required|a terminal is required|not found)|permission denied/.test(text)) missing.add("sudo-permission");
  if (missing.size === 0 && text) missing.add("docker-environment");
  return [...missing];
};

const initializeEnvironment = async () => {
  const setupCommand = "sudo -n modprobe br_netfilter && sudo -n systemctl reset-failed docker && sudo -n systemctl enable --now containerd docker";
  try {
    const cachedPassword = sshManager.getCachedSudoPassword();
    const result = cachedPassword
      ? await executeRemoteResult("sudo -S -p '' -v && sudo -n modprobe br_netfilter && sudo -n systemctl reset-failed docker && sudo -n systemctl enable --now containerd docker", { input: `${cachedPassword}\n`, timeoutMs: 300000 })
      : await executeRemoteResult(setupCommand, { timeoutMs: 300000 });
    if (result.code === 0) {
      environmentStatus = {
        initialized: true,
        ok: true,
        missingComponents: [],
        error: null
      };
    } else {
      environmentStatus = {
        initialized: true,
        ok: false,
        missingComponents: missingComponentsFrom(result),
        error: result.stderr || "Docker environment initialization failed."
      };
    }
  } catch (error) {
    environmentStatus = {
      initialized: true,
      ok: false,
      missingComponents: ["ssh-execution"],
      error: error.message || "Docker environment initialization failed."
    };
  }
  return environmentStatus;
};

const connectSsh = (credentials) => new Promise((resolve, reject) => {
  closeSshConnection();
  environmentStatus = {
    initialized: false,
    ok: false,
    missingComponents: [],
    error: "Environment initialization is in progress."
  };
  const client = new Client();
  let settled = false;
  let timeoutId;
  const cleanupFailedConnection = () => {
    clearTimeout(timeoutId);
    client.removeAllListeners();
    client.end();
  };
  const fail = (error) => {
    if (!settled) {
      settled = true;
      cleanupFailedConnection();
      reject(connectionError(error));
    }
  };

  const verifyRemoteExecution = () => {
    client.exec("uptime", (error, stream) => {
      if (error) {
        fail(error);
        return;
      }
      let output = "";
      let stderr = "";
      stream.on("data", (chunk) => { output += chunk.toString(); });
      stream.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      stream.once("error", fail);
      stream.once("close", (code) => {
        if (code !== 0 || !output.trim()) {
          fail(new Error(stderr.trim() || "The SSH connection was authenticated but remote execution failed."));
          return;
        }
        clearTimeout(timeoutId);
        sshClient = client;
        sshConnection = {
          host: credentials.host,
          port: credentials.port,
          username: credentials.username
        };
        sshManager.setCachedSudoPassword(credentials.sudoPassword);
        initializeEnvironment().then((initialization) => {
          settled = true;
          resolve({
            host: credentials.host,
            port: credentials.port,
            username: credentials.username,
            verification: "uptime",
            environment: initialization
          });
        }).catch((initializationError) => {
          settled = true;
          resolve({
            host: credentials.host,
            port: credentials.port,
            username: credentials.username,
            verification: "uptime",
            environment: {
              initialized: true,
              ok: false,
              missingComponents: ["docker-environment"],
              error: initializationError.message
            }
          });
        });
      });
    });
  };

  client.once("ready", () => {
    if (settled) return;
    verifyRemoteExecution();
  });
  client.once("error", fail);
  client.once("close", () => {
    if (sshClient === client) {
      sshClient = null;
      sshConnection = null;
    }
  });
  timeoutId = setTimeout(() => fail(new Error("SSH connection timed out after 10 seconds.")), 10000);

  const auth = {
    host: credentials.host,
    port: credentials.port,
    username: credentials.username,
    readyTimeout: 10000,
    tryKeyboard: false
  };
  if (credentials.privateKey) {
    auth.privateKey = credentials.privateKey;
    if (credentials.passphrase) auth.passphrase = credentials.passphrase;
  } else {
    auth.password = credentials.password;
  }
  try {
    client.connect(auth);
  } catch (error) {
    fail(error);
  }
});

const validateCredentials = (credentials) => {
  if (!credentials || typeof credentials !== "object") throw new Error("Connection details are required.");
  const host = typeof credentials.host === "string" ? credentials.host.trim() : "";
  const username = typeof credentials.username === "string" ? credentials.username.trim() : "";
  const port = Number(credentials.port);
  if (!host || host.length > 253) throw new Error("Enter a valid host or IP address.");
  if (!username || username.length > 128) throw new Error("Enter a valid username.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SSH port must be between 1 and 65535.");
  if (!credentials.password && !credentials.privateKey) throw new Error("A password or private key is required.");
  const sudoPassword = typeof credentials.sudoPassword === "string" && credentials.sudoPassword.length > 0
    ? credentials.sudoPassword
    : (typeof credentials.password === "string" ? credentials.password : "");
  return { ...credentials, host, username, port, sudoPassword };
};

const parseTemperature = (output) => {
  const match = output.match(/(-?\d+(?:\.\d+)?)\s*['°]?C/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

const parseMemory = (output) => {
  const line = output.split(/\r?\n/).find((entry) => /^\s*Mem:\s+/i.test(entry));
  if (!line) throw new Error("Unable to parse memory information from the server.");
  const columns = line.trim().split(/\s+/);
  const totalMb = Number(columns[1]);
  const availableMb = Number(columns[6] ?? columns[3]);
  if (!Number.isFinite(totalMb) || !Number.isFinite(availableMb)) throw new Error("Unable to parse memory information from the server.");
  const usedMb = Math.max(0, totalMb - availableMb);
  return {
    usedMb,
    totalMb,
    usagePercent: totalMb > 0 ? Math.round((usedMb / totalMb) * 100) : 0
  };
};

const parseContainers = (output) => output
  ? output.split(/\r?\n/).filter(Boolean).map((line) => {
    const [name, status, ports = ""] = line.split("|");
    return { name, status, ports };
  })
  : [];

const parseDockerJson = (output) => output
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    try {
      const container = JSON.parse(line);
      return {
        id: container.ID || container.Id || "",
        name: container.Names || container.Name || "",
        image: container.Image || "",
        status: container.Status || "",
        state: String(container.State || "").toLowerCase(),
        ports: container.Ports || ""
      };
    } catch (error) {
      return null;
    }
  })
  .filter((container) => container && container.name);

const parseOllamaModels = (output) => {
  try {
    const data = JSON.parse(output || "{\"models\":[]}");
    return Array.isArray(data.models)
      ? data.models.map((model) => ({
        name: model.name || model.model || "",
        size: Number(model.size || 0),
        modifiedAt: model.modified_at || null
      })).filter((model) => model.name)
      : [];
  } catch (error) {
    return [];
  }
};

const getRemoteStatus = async () => {
  if (remoteStatusCache.value && remoteStatusCache.expiresAt > Date.now()) return remoteStatusCache.value;
  if (remoteStatusCache.pending) return remoteStatusCache.pending;
  remoteStatusCache.pending = executeRemoteResult(
    "printf '__DOCKER__\\n'; if command -v docker >/dev/null 2>&1; then docker ps -a --format '{{json .}}'; else printf '__DOCKER_MISSING__\\n'; fi; printf '\\n__OLLAMA__\\n'; if command -v curl >/dev/null 2>&1; then curl -fsS --max-time 3 http://127.0.0.1:11434/api/tags 2>/dev/null || printf '{\"models\":[]}\\n'; else printf '{\"models\":[]}\\n'; fi",
    { timeoutMs: 15000 }
  ).then((result) => {
    const sections = result.stdout.split(/__(DOCKER|OLLAMA)__\r?\n/);
    const section = (name) => {
      const index = sections.indexOf(name);
      return index >= 0 ? (sections[index + 1] || "").trim() : "";
    };
    const dockerOutput = section("DOCKER");
    const value = {
      docker: {
        dockerAvailable: !dockerOutput.includes("__DOCKER_MISSING__"),
        containers: parseDockerJson(dockerOutput),
        error: dockerOutput.includes("__DOCKER_MISSING__") ? "Docker not installed" : null
      },
      ollama: { models: parseOllamaModels(section("OLLAMA")) }
    };
    remoteStatusCache = { expiresAt: Date.now() + 2500, value, pending: null };
    return value;
  }).catch((error) => {
    remoteStatusCache.pending = null;
    throw error;
  });
  return remoteStatusCache.pending;
};

const parseCpuUsage = (output) => {
  const [totalBefore, idleBefore, totalAfter, idleAfter] = output.split(/\s+/).map(Number);
  const totalDelta = totalAfter - totalBefore;
  const idleDelta = idleAfter - idleBefore;
  if (!Number.isFinite(totalDelta) || !Number.isFinite(idleDelta) || totalDelta <= 0) return null;
  return Math.round(Math.max(0, Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100)));
};

const parseNetworkRate = (output) => {
  const [before, after] = output.split(/\s+/).map(Number);
  if (!Number.isFinite(before) || !Number.isFinite(after) || after < before) return null;
  return Math.round((after - before) * 10);
};

const getTelemetry = async () => {
  if (!sshClient) throw new Error("No SSH connection is active.");
  const telemetryCommand = "printf '__TEMP__\\n'; if command -v vcgencmd >/dev/null 2>&1; then vcgencmd measure_temp; else for f in /sys/class/thermal/thermal_zone*/temp; do [ -r \"$f\" ] && awk '{ printf \"%.1f C\\n\", $1 / 1000 }' \"$f\" && break; done; fi; printf '__CPU__\\n'; read_cpu() { awk '/^cpu / { print $2+$3+$4+$5+$6+$7+$8, $5+$6 }' /proc/stat; }; before=$(read_cpu); sleep 0.1; after=$(read_cpu); printf '%s %s\\n' $before $after; printf '__MEM__\\n'; free -m; printf '__NET__\\n'; read_net() { awk 'NR > 2 && /:/ { gsub(\":\", \"\", $1); total += $2 + $10 } END { print total + 0 }' /proc/net/dev; }; before=$(read_net); sleep 0.1; after=$(read_net); printf '%s %s\\n' $before $after";
  const result = await executeRemoteResult(telemetryCommand, { timeoutMs: 10000 });
  const remoteStatus = remoteStatusCache.value || {
    docker: { dockerAvailable: false, containers: [], error: "Docker status is synchronizing." },
    ollama: { models: [] }
  };
  void getRemoteStatus().catch((error) => console.warn("Remote service status sync failed:", error.message));
  const sections = result.stdout.split(/__(TEMP|CPU|MEM|NET)__\r?\n/);
  const section = (name) => {
    const index = sections.indexOf(name);
    return index >= 0 ? (sections[index + 1] || "").trim() : "";
  };
  const temperatureOutput = section("TEMP");
  const cpuOutput = section("CPU");
  const memoryOutput = section("MEM");
  const networkOutput = section("NET");
  const memoryResult = memoryOutput ? { status: "fulfilled", value: memoryOutput } : { status: "rejected" };
  const temperatureResult = temperatureOutput ? { status: "fulfilled", value: temperatureOutput } : { status: "rejected" };
  const cpuResult = cpuOutput ? { status: "fulfilled", value: cpuOutput } : { status: "rejected" };
  const networkResult = networkOutput ? { status: "fulfilled", value: networkOutput } : { status: "rejected" };
  let memory = null;
  if (memoryResult.status === "fulfilled") {
    try {
      memory = parseMemory(memoryOutput);
    } catch (error) {
      console.warn("Unable to parse remote memory output:", error);
    }
  }
  return {
    timestamp: new Date().toISOString(),
    cpuTemperatureC: temperatureResult.status === "fulfilled" ? parseTemperature(temperatureOutput) : null,
    cpuError: temperatureResult.status === "rejected" ? "CPU temperature unavailable" : null,
    cpuUsagePercent: cpuResult.status === "fulfilled" ? parseCpuUsage(cpuOutput) : null,
    networkBytesPerSecond: networkResult.status === "fulfilled" ? parseNetworkRate(networkOutput) : null,
    memory,
    memoryError: memory ? null : "RAM usage unavailable",
    docker: remoteStatus.docker,
    containers: remoteStatus.docker.containers,
    dockerAvailable: remoteStatus.docker.dockerAvailable,
    ollama: remoteStatus.ollama,
    environment: environmentStatus
  };
};

const parseUnsignedInteger = (value) => {
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

const getHardware = async () => {
  if (!sshClient) throw new Error("No SSH connection is active.");
  const [memoryResult, vramResult, cpuResult] = await Promise.allSettled([
    executeRemote("free -b"),
    executeRemote("if command -v nvidia-smi >/dev/null 2>&1; then nvidia-smi --query-gpu=memory.total,memory.free --format=csv,noheader,nounits; else exit 127; fi"),
    executeRemote("nproc")
  ]);
  const memoryLine = memoryResult.status === "fulfilled"
    ? memoryResult.value.split(/\r?\n/).find((line) => /^\s*Mem:\s+/i.test(line))
    : null;
  const memoryColumns = memoryLine ? memoryLine.trim().split(/\s+/) : [];
  const totalMemoryBytes = memoryColumns.length > 1 ? parseUnsignedInteger(memoryColumns[1]) : null;
  const vramRows = vramResult.status === "fulfilled"
    ? vramResult.value.split(/\r?\n/).map((line) => line.split(",").map(parseUnsignedInteger))
      .filter((row) => row.length >= 2 && row.every((value) => value !== null))
    : [];
  const totalVramBytes = vramRows.reduce((total, row) => total + (row[0] * 1024 * 1024), 0);
  const freeVramBytes = vramRows.reduce((total, row) => total + (row[1] * 1024 * 1024), 0);
  const cpuCores = cpuResult.status === "fulfilled" ? parseUnsignedInteger(cpuResult.value) : null;
  return {
    totalMemoryBytes,
    availableMemoryBytes: memoryColumns.length > 6 ? parseUnsignedInteger(memoryColumns[6]) : null,
    freeMemoryBytes: memoryColumns.length > 3 ? parseUnsignedInteger(memoryColumns[3]) : null,
    totalVramBytes,
    availableVramBytes: freeVramBytes,
    freeVramBytes,
    cpuCores,
    gpuAvailable: vramRows.length > 0,
    errors: {
      memory: totalMemoryBytes === null ? "Unable to read total RAM." : null,
      gpu: vramResult.status === "rejected" ? "nvidia-smi is unavailable." : null,
      cpu: cpuCores === null ? "Unable to read CPU core count." : null
    },
    queriedAt: new Date().toISOString()
  };
};

const deploymentName = (value) => typeof value === "string" && /^[a-z0-9][a-z0-9_.-]{0,62}$/.test(value);
const deploymentImage = (value) => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.\/:@-]{0,254}$/.test(value);
const deploymentModel = (value) => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.\/:@-]{0,127}$/.test(value);
const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

const buildDeployment = (configuration) => {
  if (!configuration || typeof configuration !== "object") throw new Error("A deployment configuration is required.");
  if (configuration.type === "model") {
    if (!deploymentModel(configuration.model)) throw new Error("Invalid AI model name.");
    return {
      command: `sudo -S -p '' -v && if command -v ollama >/dev/null 2>&1; then echo 'Ollama is already installed.'; else echo 'Installing Ollama...'; curl -fsSL https://ollama.com/install.sh | sudo -n sh || exit $?; fi; sudo -n systemctl enable --now ollama 2>/dev/null || true; ollama pull ${shellQuote(configuration.model)} && nohup ollama run ${shellQuote(configuration.model)} >/tmp/shipai-ollama.log 2>&1 & echo 'Ollama model service started.'`,
      requiresSudo: true
    };
  }
  if (configuration.type !== "container" || !deploymentImage(configuration.image)) {
    throw new Error("A valid container image is required.");
  }
  const args = ["docker", "run", "--detach"];
  if (configuration.name !== undefined) {
    if (!deploymentName(configuration.name)) throw new Error("Invalid container name.");
    args.push("--name", configuration.name);
  }
  if (Array.isArray(configuration.ports)) {
    configuration.ports.forEach((port) => {
      if (!/^\d{1,5}:\d{1,5}(?:\/tcp|\/udp)?$/.test(port)) throw new Error("Invalid container port mapping.");
      args.push("--publish", port);
    });
  }
  args.push(configuration.image);
  return { command: args.map(shellQuote).join(" "), requiresSudo: false };
};

const startDeployment = async (sender, command, jobId, sudoPassword = "") => {
  const send = (type, data) => {
    if (!sender.isDestroyed()) sender.send("ssh:deployment-log", { jobId, type, data: String(data) });
  };
  const result = await executeRemoteResult(command.command, {
    timeoutMs: 300000,
    input: command.requiresSudo ? `${sudoPassword}\n` : "",
    onStdout: (data) => send("stdout", data),
    onStderr: (data) => send("stderr", data)
  });
  send(result.code === 0 ? "complete" : "error", result.code === 0 ? "Deployment completed." : result.stderr || "Deployment failed.");
  if (result.code !== 0) throw new Error(result.stderr || "Remote deployment failed.");
  return { jobId, code: result.code };
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f8fafc",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "..", "preload.js")
    }
  });
  mainWindow.loadFile(path.join(__dirname, "..", "app", "index.html"));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
};

ipcMain.handle("ssh-connect", async (_event, rawCredentials) => {
  const credentials = validateCredentials(rawCredentials);
  return connectSsh(credentials);
});

ipcMain.handle("ssh:telemetry", async () => getTelemetry());
ipcMain.handle("ssh:get-telemetry", async () => {
  try {
    return { success: true, data: await getTelemetry() };
  } catch (error) {
    return { success: false, error: error.message || "Telemetry unavailable." };
  }
});

ipcMain.handle("ssh:check-hardware", async () => getHardware());
ipcMain.handle("ssh:initialize-environment", async () => initializeEnvironment());
ipcMain.handle("ssh:chat", async (event, request) => {
  if (!request || !deploymentModel(request.model) || typeof request.prompt !== "string" || !request.prompt.trim()) {
    throw new Error("A valid installed model and prompt are required.");
  }
  const body = JSON.stringify({ model: request.model, prompt: request.prompt, stream: true });
  let buffer = "";
  const send = (payload) => {
    if (!event.sender.isDestroyed()) event.sender.send("ssh:chat-chunk", payload);
  };
  const result = await executeRemoteResult(
    `curl -fsS -N --max-time 1800 http://127.0.0.1:11434/api/generate -H 'Content-Type: application/json' --data ${shellQuote(body)}`,
    {
      timeoutMs: 1800000,
      onStdout: (data) => {
        buffer += data;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        lines.filter(Boolean).forEach((line) => {
          try {
            const chunk = JSON.parse(line);
            if (chunk.response) send({ type: "token", data: chunk.response });
            if (chunk.done) send({ type: "done", data: chunk });
          } catch (error) {
            send({ type: "error", data: "Invalid Ollama response." });
          }
        });
      }
    }
  );
  if (result.code !== 0) {
    send({ type: "error", data: result.stderr || "Ollama request failed." });
    throw new Error(result.stderr || "Ollama request failed.");
  }
  return { success: true };
});

ipcMain.handle("ssh:deploy-service", async (event, configuration) => {
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const command = buildDeployment(configuration);
  const sudoPassword = command.requiresSudo
    ? sshManager.getCachedSudoPassword()
    : "";
  if (command.requiresSudo && !sudoPassword) {
    throw new Error("A sudo password is required to install Ollama.");
  }
  startDeployment(event.sender, command, jobId, sudoPassword || "").catch((error) => {
    if (!event.sender.isDestroyed()) event.sender.send("ssh:deployment-log", { jobId, type: "error", data: error.message });
  });
  return { jobId, started: true };
});

ipcMain.handle("ssh:restart-container", async (_event, containerName) => {
  if (typeof containerName !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(containerName)) {
    throw new Error("Invalid Docker container name.");
  }
  await executeRemote(`docker restart -- ${containerName}`);
  return { name: containerName, restartedAt: new Date().toISOString() };
});

ipcMain.handle("ssh:docker-action", async (_event, request) => {
  const allowedActions = new Set(["start", "stop", "logs"]);
  if (!request || !allowedActions.has(request.action) || !deploymentName(request.name)) {
    throw new Error("Invalid Docker action.");
  }
  const command = request.action === "logs"
    ? `docker logs --tail 100 ${shellQuote(request.name)}`
    : `docker ${request.action} -- ${request.name}`;
  if (request.action === "logs") return { name: request.name, action: request.action, output: await executeRemote(command, { timeoutMs: 30000 }) };
  await executeRemote(command, { timeoutMs: 30000 });
  remoteStatusCache.expiresAt = 0;
  return { name: request.name, action: request.action };
});

ipcMain.handle("ssh:disconnect", () => {
  closeSshConnection();
  return true;
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  closeSshConnection();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", closeSshConnection);
