(() => {
  "use strict";

  if (!window.api) return;
  const elements = {
    temperature: document.getElementById("cpu-temperature"),
    ramUsage: document.getElementById("ram-usage"),
    ramTotal: document.getElementById("ram-total"),
    ramProgress: document.getElementById("ram-progress"),
    containerCount: document.getElementById("container-count"),
    tableBody: document.getElementById("container-table-body"),
    refresh: document.getElementById("refresh-button"),
    disconnect: document.getElementById("disconnect-button"),
    error: document.getElementById("dashboard-error"),
    environmentWarning: document.getElementById("environment-warning"),
    updated: document.getElementById("last-updated"),
    dockerWarning: document.getElementById("docker-warning")
  };
  let refreshTimer;
  let refreshInFlight = false;
  let hardware = null;
  let installedModels = [];
  let chatModel = null;
  let chatResponse = null;
  const history = { cpu: [], ram: [], network: [] };
  const serviceDefinitions = {
    portainer: { type: "container", name: "portainer", image: "portainer/portainer-ce:latest", ports: ["9000:9000"] },
    "nginx-proxy-manager": { type: "container", name: "nginx-proxy-manager", image: "jc21/nginx-proxy-manager:latest", ports: ["80:80", "81:81", "443:443"] },
    nextcloud: { type: "container", name: "nextcloud", image: "nextcloud:latest", ports: ["8080:80"] },
    "uptime-kuma": { type: "container", name: "uptime-kuma", image: "louislam/uptime-kuma:latest", ports: ["3001:3001"] }
  };

  const showError = (error) => {
    elements.error.textContent = error.message || "Unable to retrieve server telemetry.";
    elements.error.hidden = false;
  };
  const t = (key) => window.shipaiI18n ? window.shipaiI18n.translate(key) : key;

  const setDashboardTab = (name) => {
    document.querySelectorAll("[data-dashboard-tab]").forEach((tab) => {
      const active = tab.dataset.dashboardTab === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-dashboard-view]").forEach((view) => {
      const active = view.dataset.dashboardView === name;
      view.hidden = !active;
      view.classList.toggle("hidden", !active);
      view.setAttribute("aria-hidden", String(!active));
    });
  };

  const showToast = (message) => {
    const toast = document.getElementById("dashboard-toast");
    toast.textContent = message;
    toast.hidden = false;
    window.setTimeout(() => { toast.hidden = true; }, 2600);
  };

  const renderContainers = (containers) => {
    elements.containerCount.textContent = String(containers.filter((container) => container.state === "running").length);
    elements.tableBody.replaceChildren();
    containers.forEach((container) => {
      const running = container.state === "running" || /^up\b/i.test(container.status);
      const row = document.createElement("tr");
      row.innerHTML = `<th scope="row"><span class="service-name"></span><span class="service-id">Docker container</span></th><td class="container-image"></td><td><span class="status-badge"><span class="status-dot" aria-hidden="true"></span><span data-container-state></span></span></td><td class="last-action">Synced</td><td><span data-container-actions></span></td>`;
      row.querySelector(".service-name").textContent = container.name;
      row.querySelector(".container-image").textContent = container.ports || "No published ports";
      row.querySelector("[data-container-state]").textContent = running ? "Running" : "Stopped";
      const actions = row.querySelector("[data-container-actions]");
      const addAction = (action, label) => {
        const button = document.createElement("button");
        button.className = "button button-small button-secondary";
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", () => runDockerAction(action, container, button));
        actions.append(button);
      };
      addAction(running ? "stop" : "start", running ? "Stop" : "Start");
      addAction("logs", "Logs");
      elements.tableBody.append(row);
    });
  };

  const renderDockerStatus = (docker) => {
    const dockerAvailable = docker && docker.dockerAvailable === true;
    elements.dockerWarning.hidden = dockerAvailable;
    renderServiceCards(dockerAvailable ? docker.containers : []);
    renderContainers(dockerAvailable ? docker.containers : []);
  };

  const serviceMatches = (definition, container) => {
    const name = `${container.name} ${container.image}`.toLowerCase();
    return name.includes(definition.name.toLowerCase()) ||
      (definition.name === "nginx-proxy-manager" && name.includes("nginx-proxy")) ||
      (definition.name === "uptime-kuma" && name.includes("uptime"));
  };

  const runDockerAction = async (action, container, button) => {
    button.disabled = true;
    try {
      const result = await window.api.dockerAction(action, container.name);
      if (action === "logs") {
        const log = document.getElementById("deployment-log");
        log.hidden = false;
        log.textContent = result.output || "No logs available.";
        log.scrollTop = log.scrollHeight;
      }
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
    }
  };

  const renderServiceCards = (containers) => {
    document.querySelectorAll("[data-service]").forEach((deployButton) => {
      const definition = serviceDefinitions[deployButton.dataset.service];
      const card = deployButton.closest(".launcher-card");
      const container = containers.find((candidate) => serviceMatches(definition, candidate));
      const state = card.querySelector("[data-service-state]");
      const actions = card.querySelector("[data-service-actions]");
      actions.replaceChildren();
      if (!container) {
        state.textContent = "Not installed";
        state.className = "service-state";
        deployButton.hidden = false;
        return;
      }
      const running = container.state === "running" || /^up\b/i.test(container.status);
      state.textContent = running ? "Running" : "Stopped";
      state.className = `service-state ${running ? "is-running" : "is-stopped"}`;
      deployButton.hidden = true;
      const addAction = (action, label) => {
        const button = document.createElement("button");
        button.className = "button button-small button-secondary";
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", () => runDockerAction(action, container, button));
        actions.append(button);
      };
      if (running) addAction("stop", "Stop");
      else addAction("start", "Start");
      addAction("logs", "Logs");
    });
  };

  const renderEnvironmentStatus = (environment) => {
    if (!environment || environment.ok === true) {
      elements.environmentWarning.hidden = true;
      return;
    }
    const missing = Array.isArray(environment.missingComponents) && environment.missingComponents.length > 0
      ? ` Missing components: ${environment.missingComponents.join(", ")}.`
      : "";
    elements.environmentWarning.textContent = `Remote environment setup is incomplete.${missing} ${environment.error || ""}`.trim();
    elements.environmentWarning.hidden = false;
  };

  const addHistoryPoint = (key, value) => {
    if (Number.isFinite(value)) history[key].push(value);
    if (history[key].length > 30) history[key].shift();
  };

  const renderChart = (id, values, color, min = null, max = null) => {
    const chart = document.getElementById(id);
    if (!chart || values.length === 0) return;
    const lower = min ?? Math.min(...values);
    const upper = max ?? Math.max(...values);
    const range = upper - lower || 1;
    const points = values.map((value, index) => {
      const x = values.length === 1 ? 160 : (index / (values.length - 1)) * 320;
      const y = 96 - ((value - lower) / range) * 78;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    chart.innerHTML = `<path d="M 0 96 H 320 M 0 57 H 320 M 0 18 H 320" stroke="#e2e8f0" stroke-width="1" fill="none"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  };

  const updateHardwareStatus = () => {
    const status = document.getElementById("hardware-status");
    const selected = document.getElementById("model-select").selectedOptions[0];
    const requiredRam = Number(selected.dataset.ram);
    const requiredVram = Number(selected.dataset.vram);
    const availableRam = hardware?.totalMemoryBytes ? hardware.totalMemoryBytes / (1024 ** 3) : 0;
    const availableVram = hardware?.totalVramBytes ? hardware.totalVramBytes / (1024 ** 3) : 0;
    const ramInsufficient = availableRam < requiredRam;
    const vramInsufficient = requiredVram > 0 && availableVram < requiredVram;
    const deployButton = document.getElementById("deploy-model");
    const warning = document.getElementById("model-warning");
    deployButton.disabled = !hardware || ramInsufficient || vramInsufficient;
    if (!hardware) {
      status.textContent = "Hardware unavailable";
      warning.hidden = false;
      warning.textContent = t("checking");
    } else if (ramInsufficient) {
      status.textContent = "Insufficient resources";
      warning.hidden = false;
      warning.textContent = `${t("insufficient")}: Requires ${requiredRam}GB, Available ${availableRam.toFixed(1)}GB. Try Phi-3.`;
    } else if (vramInsufficient) {
      status.textContent = "Insufficient resources";
      warning.hidden = false;
      warning.textContent = `Insufficient VRAM: Requires ${requiredVram}GB, Available ${availableVram.toFixed(1)}GB.`;
    } else {
      status.textContent = `${availableRam.toFixed(1)}GB RAM available`;
      warning.hidden = true;
    }
  };

  const checkHardware = async () => {
    try {
      hardware = await window.api.checkHardware();
    } catch (error) {
      hardware = null;
      showError(error);
    }
    updateHardwareStatus();
  };

  const appendDeploymentLog = (entry) => {
    const log = document.getElementById("deployment-log");
    log.hidden = false;
    log.textContent += `${entry.data}\n`;
    log.scrollTop = log.scrollHeight;
  };

  const deploy = async (configuration, button) => {
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "Starting...";
    document.getElementById("deployment-log").textContent = "";
    try {
      await window.api.deployService(configuration);
      setDashboardTab("overview");
      showToast(t("installStarted"));
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  };

  const initializeLauncher = () => {
    const content = document.getElementById("launcher-content");
    const toggle = document.getElementById("launcher-toggle");
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      toggle.textContent = expanded ? "Expand" : "Collapse";
      content.hidden = expanded;
    });
    document.querySelectorAll("[data-service]").forEach((button) => {
      button.addEventListener("click", () => deploy(serviceDefinitions[button.dataset.service], button));
    });
    document.getElementById("model-select").addEventListener("change", updateHardwareStatus);
    document.getElementById("deploy-model").addEventListener("click", (event) => {
      deploy({ type: "model", model: document.getElementById("model-select").value }, event.currentTarget);
    });
    window.api.onDeploymentLog(appendDeploymentLog);
    if (window.api.onInstallProgress) {
      window.api.onInstallProgress(appendDeploymentLog);
    }
  };

  document.querySelectorAll("[data-dashboard-tab]").forEach((tab) => {
    tab.addEventListener("click", () => setDashboardTab(tab.dataset.dashboardTab));
  });
  window.addEventListener("shipai:language-changed", updateHardwareStatus);

  const refresh = async () => {
    if (refreshInFlight) return;
    refreshInFlight = true;
    elements.refresh.disabled = true;
    try {
      const telemetry = await window.api.getTelemetry();
      elements.error.hidden = true;
      elements.temperature.textContent = telemetry.cpuTemperatureC === null ? "N/A" : telemetry.cpuTemperatureC.toFixed(1);
      if (telemetry.cpuUsagePercent !== null) {
        addHistoryPoint("cpu", telemetry.cpuUsagePercent);
        document.getElementById("chart-cpu-value").textContent = `${telemetry.cpuUsagePercent}%`;
      }
      if (telemetry.networkBytesPerSecond !== null) {
        addHistoryPoint("network", telemetry.networkBytesPerSecond);
        document.getElementById("chart-network-value").textContent = `${(telemetry.networkBytesPerSecond / 1024).toFixed(1)} KB/s`;
      }
      if (telemetry.memory) {
        elements.ramUsage.textContent = (telemetry.memory.usedMb / 1024).toFixed(1);
        elements.ramTotal.textContent = (telemetry.memory.totalMb / 1024).toFixed(1);
        elements.ramProgress.style.width = `${telemetry.memory.usagePercent}%`;
        elements.ramProgress.parentElement.setAttribute("aria-label", `RAM usage: ${telemetry.memory.usagePercent} percent`);
        addHistoryPoint("ram", telemetry.memory.usagePercent);
        document.getElementById("chart-ram-value").textContent = `${telemetry.memory.usagePercent}%`;
      } else {
        elements.ramUsage.textContent = "N/A";
        elements.ramTotal.textContent = "N/A";
        elements.ramProgress.style.width = "0%";
        elements.ramProgress.parentElement.setAttribute("aria-label", "RAM usage unavailable");
      }
      renderChart("cpu-chart", history.cpu, "#4f46e5", 0, 100);
      renderChart("ram-chart", history.ram, "#0f766e", 0, 100);
      renderChart("network-chart", history.network, "#b45309");
      renderEnvironmentStatus(telemetry.environment);
      renderDockerStatus(telemetry.docker || {
        dockerAvailable: telemetry.dockerAvailable === true,
        containers: telemetry.containers || []
      });
      updateModelStatus(telemetry.ollama?.models || []);
      elements.updated.textContent = `Updated ${new Date(telemetry.timestamp).toLocaleTimeString()}`;
    } catch (error) {
      showError(error);
    } finally {
      elements.refresh.disabled = false;
      refreshInFlight = false;
    }
  };

  const updateModelStatus = (models) => {
    installedModels = models;
    const selected = document.getElementById("model-select").value.toLowerCase();
    const installed = models.find((model) => model.name.toLowerCase() === selected || model.name.toLowerCase().startsWith(`${selected}:`));
    const status = document.getElementById("model-status");
    const chatButton = document.getElementById("start-chat");
    if (installed) {
      chatModel = installed.name;
      status.textContent = `Installed on server: ${installed.name}`;
      status.className = "service-state is-running";
      chatButton.disabled = false;
      document.getElementById("deploy-model").textContent = "Installed";
      document.getElementById("deploy-model").disabled = true;
    } else {
      chatModel = null;
      status.textContent = "Model is not installed";
      status.className = "service-state";
      chatButton.disabled = true;
      document.getElementById("deploy-model").textContent = "Deploy model";
      updateHardwareStatus();
    }
  };

  const initializeChat = () => {
    const panel = document.getElementById("chat-panel");
    const chatButton = document.getElementById("start-chat");
    const memory = document.getElementById("chat-memory");
    window.api.onChatChunk((payload) => {
      if (payload.type === "token" && chatResponse) {
        chatResponse.textContent += payload.data;
      } else if (payload.type === "error") {
        if (chatResponse) chatResponse.textContent += `\nError: ${payload.data}`;
        memory.textContent = "Idle";
      } else if (payload.type === "done") {
        memory.textContent = "Idle";
      }
      const messages = document.getElementById("chat-messages");
      messages.scrollTop = messages.scrollHeight;
    });
    chatButton.addEventListener("click", () => {
      panel.hidden = false;
      document.getElementById("chat-prompt").focus();
    });
    document.getElementById("chat-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!chatModel) return;
      const input = document.getElementById("chat-prompt");
      const prompt = input.value.trim();
      if (!prompt) return;
      const messages = document.getElementById("chat-messages");
      const userMessage = document.createElement("div");
      userMessage.className = "chat-message chat-message--user";
      userMessage.textContent = prompt;
      messages.append(userMessage);
      chatResponse = document.createElement("div");
      chatResponse.className = "chat-message chat-message--assistant";
      messages.append(chatResponse);
      input.value = "";
      document.getElementById("chat-send").disabled = true;
      memory.textContent = "Responding";
      try {
        await window.api.sendChatPrompt(chatModel, prompt);
      } catch (error) {
        chatResponse.textContent = `Error: ${error.message}`;
      } finally {
        document.getElementById("chat-send").disabled = false;
        memory.textContent = "Idle";
      }
    });
  };

  elements.refresh.addEventListener("click", refresh);
  setDashboardTab("overview");
  initializeLauncher();
  initializeChat();
  document.getElementById("model-select").addEventListener("change", () => {
    updateHardwareStatus();
    updateModelStatus(installedModels);
  });
  checkHardware();
  elements.disconnect.addEventListener("click", async () => {
    window.clearInterval(refreshTimer);
    await window.api.disconnect();
    window.location.assign("index.html");
  });
  refresh();
  refreshTimer = window.setInterval(refresh, 1000);
})();
