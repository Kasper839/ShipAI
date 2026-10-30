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
  let hardware = null;
  let pendingModel = null;
  let sudoVerified = false;
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
    elements.containerCount.textContent = String(containers.length);
    elements.tableBody.replaceChildren();
    containers.forEach((container) => {
      const row = document.createElement("tr");
      row.innerHTML = `<th scope="row"><span class="service-name"></span><span class="service-id">Docker container</span></th><td class="container-image"></td><td><span class="status-badge"><span class="status-dot" aria-hidden="true"></span><span>Running</span></span></td><td class="last-action">Active</td><td><button class="button button-small button-secondary" type="button" data-restart-container>Restart</button></td>`;
      row.querySelector(".service-name").textContent = container.name;
      row.querySelector(".container-image").textContent = container.ports || "No published ports";
      row.querySelector("[data-restart-container]").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = "Restarting...";
        try {
          await window.api.restartContainer(container.name);
          row.querySelector(".last-action").textContent = "Restarted just now";
        } catch (error) {
          showError(error);
        } finally {
          button.disabled = false;
          button.textContent = "Restart";
        }
      });
      elements.tableBody.append(row);
    });
  };

  const renderDockerStatus = (docker) => {
    const dockerAvailable = docker && docker.dockerAvailable === true;
    elements.dockerWarning.hidden = dockerAvailable;
    renderContainers(dockerAvailable ? docker.containers : []);
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

  const deployModelWithPermissions = (button) => {
    if (sudoVerified) {
      deploy({ type: "model", model: document.getElementById("model-select").value }, button);
      return;
    }
    pendingModel = { configuration: { type: "model", model: document.getElementById("model-select").value }, button };
    const modal = document.getElementById("sudo-modal");
    modal.hidden = false;
    modal.classList.remove("hidden");
    document.getElementById("sudo-error").hidden = true;
    document.getElementById("sudo-password").focus();
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
      deployModelWithPermissions(event.currentTarget);
    });
    window.api.onDeploymentLog(appendDeploymentLog);
    if (window.api.onInstallProgress) {
      window.api.onInstallProgress(appendDeploymentLog);
    }
  };

  const initializeSudoModal = () => {
    const modal = document.getElementById("sudo-modal");
    const error = document.getElementById("sudo-error");
    const close = () => {
      modal.hidden = true;
      modal.classList.add("hidden");
      pendingModel = null;
      document.getElementById("sudo-password").value = "";
      error.hidden = true;
    };
    document.getElementById("close-sudo").addEventListener("click", close);
    document.getElementById("cancel-sudo").addEventListener("click", close);
    document.getElementById("sudo-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!pendingModel) return;
      const password = document.getElementById("sudo-password").value;
      if (!password) return;
      const request = pendingModel;
      const submit = event.currentTarget.querySelector("button[type='submit']");
      submit.disabled = true;
      error.hidden = true;
      try {
        const result = await window.api.authenticateSudo(password);
        if (!result || result.success !== true) throw new Error("Invalid sudo password.");
        sudoVerified = true;
        modal.hidden = true;
        modal.classList.add("hidden");
        pendingModel = null;
        document.getElementById("sudo-password").value = "";
        deploy(request.configuration, request.button);
      } catch (verificationError) {
        error.textContent = "Špatné heslo / Invalid password";
        error.hidden = false;
      } finally {
        submit.disabled = false;
      }
    });
  };

  document.querySelectorAll("[data-dashboard-tab]").forEach((tab) => {
    tab.addEventListener("click", () => setDashboardTab(tab.dataset.dashboardTab));
  });
  window.addEventListener("shipai:language-changed", updateHardwareStatus);

  const refresh = async () => {
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
      elements.updated.textContent = `Updated ${new Date(telemetry.timestamp).toLocaleTimeString()}`;
    } catch (error) {
      showError(error);
    } finally {
      elements.refresh.disabled = false;
    }
  };

  elements.refresh.addEventListener("click", refresh);
  setDashboardTab("overview");
  initializeLauncher();
  initializeSudoModal();
  checkHardware();
  elements.disconnect.addEventListener("click", async () => {
    window.clearInterval(refreshTimer);
    await window.api.disconnect();
    window.location.assign("index.html");
  });
  refresh();
  refreshTimer = window.setInterval(refresh, 5000);
})();
