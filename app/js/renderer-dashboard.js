(() => {
  "use strict";
  if (!window.api) return;

  const $ = (id) => document.getElementById(id);
  const elements = {
    temperature: $("cpu-temperature"), ramUsage: $("ram-usage"), ramTotal: $("ram-total"),
    ramProgress: $("ram-progress"),
    refresh: $("refresh-button"), disconnect: $("disconnect-button"), error: $("dashboard-error"),
    environmentWarning: $("environment-warning"), updated: $("charts-status"),
    dockerStatus: $("docker-status"),
    containerCount: $("container-count"), tableBody: $("containers-table-body"),
    chartCpuValue: $("chart-cpu-value"), chartRamValue: $("chart-ram-value"),
    chartNetworkValue: $("chart-network-value"), chartDiskValue: $("chart-disk-value"),
    storageList: $("storage-list")
  };
  const history = { cpu: [], ram: [], network: [], disk: [] };
  let refreshInFlight = false;
  let refreshTimer;
  let dockerRepairTimer;
  let hardware = null;
  let catalogue = [];
  let installedModels = [];
  let chatModel = null;
  let chatResponse = null;

  const showError = (error) => { elements.error.textContent = error.message || "Unable to retrieve server telemetry."; elements.error.hidden = false; };
  const showToast = (message) => { const toast = $("dashboard-toast"); toast.textContent = message; toast.hidden = false; window.setTimeout(() => { toast.hidden = true; }, 2600); };
  const setDashboardTab = (name) => {
    document.querySelectorAll("[data-dashboard-tab]").forEach((tab) => { const active = tab.dataset.dashboardTab === name; tab.classList.toggle("is-active", active); tab.setAttribute("aria-selected", String(active)); });
    document.querySelectorAll("[data-dashboard-view]").forEach((view) => { const active = view.dataset.dashboardView === name; view.hidden = !active; view.classList.toggle("hidden", !active); });
    if (name === "overview") void ensureDockerAccess();
  };
  const addHistoryPoint = (key, value) => { if (Number.isFinite(value)) history[key].push(value); if (history[key].length > 30) history[key].shift(); };
  const renderChart = (id, values, color, min = null, max = null) => {
    const chart = $(id); if (!chart) return;
    if (!values.length) {
      chart.innerHTML = '<path d="M 0 96 H 320 M 0 57 H 320 M 0 18 H 320" stroke="#e2e8f0" stroke-width="1" fill="none"/>';
      return;
    }
    const lower = min ?? Math.min(...values); const upper = max ?? Math.max(...values); const range = upper - lower || 1;
    const points = values.map((value, index) => `${values.length === 1 ? 160 : (index / (values.length - 1)) * 320},${96 - ((value - lower) / range) * 78}`).join(" ");
    chart.innerHTML = `<path d="M 0 96 H 320 M 0 57 H 320 M 0 18 H 320" stroke="#e2e8f0" stroke-width="1" fill="none"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  };

  const runDockerAction = async (action, container, button) => {
    button.disabled = true;
    try { const result = await window.api.dockerAction(action, container.name); if (action === "logs") { $("deployment-log").hidden = false; $("deployment-log").textContent = result.output || "No logs available."; } }
    catch (error) { renderDockerRepair({ state: "repairing", message: "Docker is recovering. The action will be available when the daemon is ready." }); void ensureDockerAccess(); } finally { button.disabled = false; }
  };
  const renderContainers = (containers) => {
    if (!elements.containerCount || !elements.tableBody) return;
    elements.containerCount.textContent = String(containers.filter((container) => container.state === "running").length);
    elements.tableBody.replaceChildren();
    containers.forEach((container) => {
      const running = container.state === "running" || /^up\b/i.test(container.status);
      const row = document.createElement("tr");
      row.innerHTML = `<th scope="row"><span class="service-name"></span><span class="service-id">AI infrastructure container</span></th><td class="container-image"></td><td><span class="status-badge"><span class="status-dot" aria-hidden="true"></span><span data-container-state></span></span></td><td class="last-action">Synced</td><td><span data-container-actions></span></td>`;
      row.querySelector(".service-name").textContent = container.name; row.querySelector(".container-image").textContent = container.ports || "No published ports";
      row.querySelector("[data-container-state]").textContent = running ? "Running" : "Stopped";
      const actions = row.querySelector("[data-container-actions]");
      [["start", "Start"], ["stop", "Stop"], ["logs", "Logs"]].filter(([action]) => action === "logs" || action === (running ? "stop" : "start")).forEach(([action, label]) => {
        const button = document.createElement("button"); button.className = "button button-small button-secondary"; button.type = "button"; button.textContent = label;
        button.addEventListener("click", () => runDockerAction(action, container, button)); actions.append(button);
      });
      elements.tableBody.append(row);
    });
  };
  const renderDockerStatus = (docker) => {
    if (!elements.dockerStatus) return;
    const available = docker?.dockerAvailable === true;
    elements.dockerStatus.hidden = available;
    if (!available) elements.dockerStatus.textContent = docker?.error || "Docker is synchronizing over SSH.";
    renderContainers(available ? (docker.containers || []) : []);
  };
  const renderDockerRepair = (status) => {
    if (!elements.dockerStatus) return;
    const ready = status?.state === "ready";
    elements.dockerStatus.hidden = ready;
    elements.dockerStatus.textContent = ready ? "" : status?.message || "Docker is synchronizing over SSH.";
  };
  const ensureDockerAccess = async () => {
    renderDockerRepair({ state: "repairing", message: "Checking Docker and repairing access over SSH..." });
    try {
      const status = await window.api.ensureDocker();
      renderDockerRepair(status);
      if (status.state === "ready") {
        window.clearTimeout(dockerRepairTimer);
        await refresh();
      } else {
        window.clearTimeout(dockerRepairTimer);
        dockerRepairTimer = window.setTimeout(() => { void ensureDockerAccess(); }, 5000);
      }
    } catch (error) {
      renderDockerRepair({ state: "repairing", message: "Docker is synchronizing. Retrying automatically." });
      window.clearTimeout(dockerRepairTimer);
      dockerRepairTimer = window.setTimeout(() => { void ensureDockerAccess(); }, 5000);
    }
  };
  const renderEnvironmentStatus = (environment) => {
    if (!environment || environment.ok === true) { elements.environmentWarning.hidden = true; return; }
    const missing = environment.missingComponents?.length ? ` Missing components: ${environment.missingComponents.join(", ")}.` : "";
    elements.environmentWarning.textContent = `AI runtime environment is incomplete.${missing} ${environment.error || ""}`.trim(); elements.environmentWarning.hidden = false;
  };
  const renderStorage = (disk) => {
    const root = elements.storageList;
    if (!root) return;
    root.replaceChildren();
    if (!disk.filesystems?.length) { root.textContent = "Filesystem telemetry is unavailable."; return; }
    disk.filesystems.forEach((filesystem) => {
      const item = document.createElement("article"); item.className = "storage-item";
      item.innerHTML = `<div class="storage-heading"><strong></strong><span></span></div><div class="progress-track"><span class="progress-value"></span></div><div class="storage-meta"><span></span><span></span></div>`;
      item.querySelector("strong").textContent = filesystem.mount; item.querySelector(".storage-heading span").textContent = `${filesystem.usagePercent}% used`;
      item.querySelector(".progress-value").style.width = `${Math.min(100, filesystem.usagePercent)}%`;
      item.querySelector(".storage-meta span:first-child").textContent = `${formatBytes(filesystem.usedBytes)} used of ${formatBytes(filesystem.totalBytes)}`;
      item.querySelector(".storage-meta span:last-child").textContent = `${formatBytes(filesystem.availableBytes)} free`;
      root.append(item);
    });
  };
  const formatBytes = (bytes) => { if (!Number.isFinite(bytes)) return "N/A"; if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`; return `${(bytes / 1024 ** 3).toFixed(1)} GB`; };

  const modelInstalled = (model) => installedModels.find((installed) => installed.name.toLowerCase() === model.ollama.toLowerCase() || installed.name.toLowerCase().startsWith(`${model.ollama.toLowerCase()}:`));
  const specGb = (value) => Number.parseFloat(String(value).replace(",", "."));
  const compatibility = (model) => {
    if (!hardware || !Number.isFinite(hardware.totalMemoryBytes)) return { state: "unknown", label: "CHECKING HARDWARE", reason: "Hardware telemetry is still being collected." };
    const ram = hardware.totalMemoryBytes / 1024 ** 3;
    const vram = (hardware.totalVramBytes || 0) / 1024 ** 3;
    const minRam = specGb(model.minimum.ram); const minVram = specGb(model.minimum.vram);
    const recommendedRam = specGb(model.recommended.ram); const recommendedVram = specGb(model.recommended.vram);
    if (ram < minRam || (minVram > 0 && vram < minVram)) return { state: "incompatible", label: "INCOMPATIBLE / UNSUPPORTED", reason: `Requires ${model.minimum.ram} RAM${minVram ? ` and ${model.minimum.vram} VRAM` : ""}; server has ${ram.toFixed(1)}GB RAM${hardware.gpuAvailable ? ` and ${vram.toFixed(1)}GB VRAM` : " and no detected VRAM"}.` };
    if (ram >= recommendedRam && (!recommendedVram || vram >= recommendedVram)) return { state: "full", label: "FULLY COMPATIBLE", reason: "Server meets the recommended inference profile." };
    return { state: "slow", label: "RUNS WITH QUANTIZATION / SLOW", reason: `Meets minimum sizing (${model.minimum.ram} RAM / ${model.minimum.vram} VRAM), but recommended capacity is ${model.recommended.ram} RAM / ${model.recommended.vram} VRAM.` };
  };
  const openModelDetails = (model) => {
    const existing = $("model-modal"); if (existing) existing.remove();
    const modal = document.createElement("div"); modal.id = "model-modal"; modal.className = "modal-backdrop"; modal.innerHTML = `<article class="modal-card model-modal-card" role="dialog" aria-modal="true" aria-labelledby="model-modal-title"><button class="modal-close" type="button" aria-label="Close">×</button><div class="section-kicker">${model.category}</div><h2 id="model-modal-title"></h2><p class="section-lead"></p><div class="model-modal-tags"></div><dl class="spec-list"></dl><div class="modal-actions"></div></article>`;
    modal.querySelector("h2").textContent = model.name; modal.querySelector(".section-lead").textContent = model.description;
    modal.querySelector(".model-modal-tags").innerHTML = model.capabilities.map((item) => `<span class="model-tag">${item}</span>`).join("");
    modal.querySelector(".spec-list").innerHTML = [["Scale", model.scale], ["Architecture", model.architecture], ["Context window", model.context], ["License", model.license], ["Minimum (Q4_K_M)", `${model.minimum.ram} RAM / ${model.minimum.vram} VRAM`], ["Recommended", `${model.recommended.ram} RAM / ${model.recommended.vram} VRAM (${model.recommended.precision})`], ["Compatibility", model.badge]].map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join("");
    modal.querySelector(".modal-close").addEventListener("click", () => modal.remove()); modal.addEventListener("click", (event) => { if (event.target === modal) modal.remove(); }); document.body.append(modal);
  };
  const deployModel = async (model, button) => {
    button.disabled = true; button.textContent = "Pulling...";
    try { await window.api.deployService({ type: "model", model: model.ollama }); showToast(`Pull started for ${model.name}`); }
    catch (error) { showError(error); button.disabled = false; button.textContent = "Download"; }
  };
  const removeModel = async (model, button) => {
    button.disabled = true;
    try { await window.api.removeModel(model.ollama); showToast(`${model.name} removed`); await refresh(); }
    catch (error) { showError(error); button.disabled = false; }
  };
  const runModel = async (model, button) => {
    button.disabled = true;
    try { await window.api.runModel(model.ollama); showToast(`Spuštění modelu ${model.name} bylo zahájeno.`); }
    catch (error) { showError(error); }
    finally { button.disabled = false; }
  };
  const downloadCustomModel = async (event) => {
    event.preventDefault();
    const input = $("custom-model-name");
    const button = event.currentTarget.querySelector("button");
    const model = input.value.trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.\/:@-]{0,127}$/.test(model)) { showError(new Error("Zadejte platný název Ollama modelu.")); return; }
    button.disabled = true;
    try { await window.api.deployService({ type: "model", model }); input.value = ""; showToast(`Stahování modelu ${model} bylo zahájeno.`); }
    catch (error) { showError(error); }
    finally { button.disabled = false; }
  };
  const renderCatalogue = () => {
    const query = ($("model-search").value || "").toLowerCase(); const category = $("model-category").value;
    const visible = catalogue.filter((model) => (category === "all" || model.category === category) && `${model.name} ${model.description} ${model.capabilities.join(" ")}`.toLowerCase().includes(query)).sort((left, right) => (Number.parseFloat(left.minimum?.vram) || 0) - (Number.parseFloat(right.minimum?.vram) || 0));
    const root = $("model-catalogue"); root.replaceChildren();
    const groups = [...new Set(visible.map((model) => model.category))];
    groups.forEach((group) => { const section = document.createElement("section"); section.className = "model-group"; section.innerHTML = `<div class="model-group-heading"><h3>${group}</h3><span>${visible.filter((model) => model.category === group).length} engines</span></div><div class="model-grid"></div>`; const grid = section.querySelector(".model-grid");
      visible.filter((model) => model.category === group).forEach((model) => { const installed = modelInstalled(model); const fit = compatibility(model); const card = document.createElement("article"); card.className = "model-card"; card.dataset.modelId = model.id; card.innerHTML = `<button class="model-card-main" type="button"><span class="model-card-top"><span class="model-category">${model.category}</span><span class="model-status ${installed ? "is-installed" : ""}">${installed ? "Installed" : "Available"}</span></span><h4></h4><p class="model-description"></p><span class="model-card-meta"></span><span class="model-tags"></span><span class="model-performance" title=""></span></button><div class="model-card-actions"><button class="button button-small button-secondary model-run" type="button">Try / Run</button><button class="button button-small button-primary model-download" type="button">Download</button><button class="button button-small button-secondary model-remove" type="button">Remove</button></div>`;
        card.querySelector("h4").textContent = model.name; card.querySelector(".model-description").textContent = model.description; card.querySelector(".model-card-meta").textContent = `${model.architecture} · ${model.context}`; card.querySelector(".model-tags").innerHTML = model.capabilities.slice(0, 3).map((item) => `<span class="model-tag">${item}</span>`).join("");
        const performance = card.querySelector(".model-performance"); performance.textContent = model.vram || `~${model.minimum?.vram || "N/A"} VRAM`; performance.title = fit.reason; const run = card.querySelector(".model-run"); const download = card.querySelector(".model-download"); const remove = card.querySelector(".model-remove"); download.disabled = Boolean(installed); remove.disabled = !installed; run.addEventListener("click", () => runModel(model, run)); download.addEventListener("click", () => deployModel(model, download)); remove.addEventListener("click", () => removeModel(model, remove)); card.querySelector(".model-card-main").addEventListener("click", () => openModelDetails(model)); grid.append(card);
      }); root.append(section);
    });
    $("catalogue-count").textContent = `${catalogue.length}`; $("installed-count").textContent = `${installedModels.length} installed in Ollama`;
  };
  const updateModelStatus = (models) => {
    const previous = installedModels.map((model) => model.name).sort().join("|");
    const next = models.map((model) => model.name).sort().join("|");
    installedModels = models;
    if (catalogue.length && previous !== next) renderCatalogue();
  };
  const loadCatalogue = async () => {
    try { const response = await fetch("data/models.json"); if (!response.ok) throw new Error("Model catalogue could not be loaded."); catalogue = await response.json(); [...new Set(catalogue.map((model) => model.category))].forEach((category) => { const option = document.createElement("option"); option.value = category; option.textContent = category; $("model-category").append(option); }); renderCatalogue(); }
    catch (error) { showError(error); $("model-catalogue").textContent = "Unable to load model catalogue."; }
  };

  const updateHardwareStatus = async () => { try { hardware = await window.api.checkHardware(); if (catalogue.length) renderCatalogue(); } catch (error) { hardware = null; showError(error); } };
  const appendDeploymentLog = (entry) => { const log = $("deployment-log"); log.hidden = false; log.textContent += `${entry.data}\n`; log.scrollTop = log.scrollHeight; };
  const updateModelProgress = (payload) => {
    const panel = $("model-progress");
    const percent = Number.isFinite(payload.percent) ? Math.max(0, Math.min(100, payload.percent)) : 0;
    panel.hidden = false;
    $("model-progress-percent").textContent = `${percent}%`;
    $("model-progress-status").textContent = payload.message || (payload.state === "complete" ? "Model is ready." : "Downloading model...");
    $("model-progress-value").style.width = `${percent}%`;
    panel.querySelector(".progress-track").setAttribute("aria-valuenow", String(percent));
    if (payload.state === "complete" || payload.state === "error") window.setTimeout(() => { panel.hidden = true; }, 2500);
  };
  const refresh = async () => {
    if (refreshInFlight) return; refreshInFlight = true; elements.refresh.disabled = true;
    try {
      const telemetry = await window.api.getTelemetry(); elements.error.hidden = true; elements.temperature.textContent = telemetry.cpuTemperatureC === null ? "N/A" : telemetry.cpuTemperatureC.toFixed(1);
      if (telemetry.cpuUsagePercent !== null) { addHistoryPoint("cpu", telemetry.cpuUsagePercent); elements.chartCpuValue.textContent = `${telemetry.cpuUsagePercent}%`; }
      if (telemetry.networkBytesPerSecond !== null) { addHistoryPoint("network", telemetry.networkBytesPerSecond); elements.chartNetworkValue.textContent = `${(telemetry.networkBytesPerSecond / 1024).toFixed(1)} KB/s`; }
      if (telemetry.memory) { elements.ramUsage.textContent = (telemetry.memory.usedMb / 1024).toFixed(1); elements.ramTotal.textContent = (telemetry.memory.totalMb / 1024).toFixed(1); elements.ramProgress.style.width = `${telemetry.memory.usagePercent}%`; addHistoryPoint("ram", telemetry.memory.usagePercent); elements.chartRamValue.textContent = `${telemetry.memory.usagePercent}%`; }
      if (telemetry.disk) { const diskRate = (telemetry.disk.readBytesPerSecond || 0) + (telemetry.disk.writeBytesPerSecond || 0); addHistoryPoint("disk", diskRate); elements.chartDiskValue.textContent = `${(diskRate / 1024 / 1024).toFixed(1)} MB/s`; renderStorage(telemetry.disk); }
      renderChart("cpu-chart", history.cpu, "#4f46e5", 0, 100); renderChart("ram-chart", history.ram, "#0f766e", 0, 100); renderChart("network-chart", history.network, "#b45309"); renderChart("disk-chart", history.disk, "#db2777"); renderDockerStatus(telemetry.docker); renderEnvironmentStatus(telemetry.environment); updateModelStatus(telemetry.ollama?.models || []); elements.updated.textContent = `Updated ${new Date(telemetry.timestamp).toLocaleTimeString()}`;
    } catch (error) { showError(error); } finally { elements.refresh.disabled = false; refreshInFlight = false; }
  };

  const initializeChat = () => {
    window.api.onChatChunk((payload) => { if (payload.type === "token" && chatResponse) chatResponse.textContent += payload.data; if (payload.type === "error" && chatResponse) chatResponse.textContent += `\nError: ${payload.data}`; if (payload.type === "done" || payload.type === "error") $("chat-memory").textContent = "Idle"; $("chat-messages").scrollTop = $("chat-messages").scrollHeight; });
    $("chat-form").addEventListener("submit", async (event) => { event.preventDefault(); if (!chatModel) return; const input = $("chat-prompt"); const prompt = input.value.trim(); if (!prompt) return; const messages = $("chat-messages"); const user = document.createElement("div"); user.className = "chat-message chat-message--user"; user.textContent = prompt; messages.append(user); chatResponse = document.createElement("div"); chatResponse.className = "chat-message chat-message--assistant"; messages.append(chatResponse); input.value = ""; $("chat-send").disabled = true; $("chat-memory").textContent = "Responding"; try { await window.api.sendChatPrompt(chatModel, prompt); } catch (error) { chatResponse.textContent = `Error: ${error.message}`; } finally { $("chat-send").disabled = false; $("chat-memory").textContent = "Idle"; } });
  };
  document.querySelectorAll("[data-dashboard-tab]").forEach((tab) => tab.addEventListener("click", () => setDashboardTab(tab.dataset.dashboardTab)));
  $("model-search").addEventListener("input", renderCatalogue); $("model-category").addEventListener("change", renderCatalogue); $("custom-model-form").addEventListener("submit", downloadCustomModel); elements.refresh.addEventListener("click", refresh);
  const requestPowerAction = (action, label) => {
    if (!window.confirm(`Are you sure you want to ${label} the remote server?`)) return;
    window.api.powerAction(action).then(() => showToast(`${label[0].toUpperCase()}${label.slice(1)} requested.`)).catch(showError);
  };
  $("restart-server").addEventListener("click", () => requestPowerAction("restart", "reboot"));
  $("shutdown-server").addEventListener("click", () => requestPowerAction("shutdown", "shutdown"));
  $("start-chat")?.addEventListener("click", () => { $("chat-panel").hidden = false; $("chat-prompt").focus(); });
  window.api.onDeploymentLog(appendDeploymentLog); window.api.onInstallProgress(appendDeploymentLog); window.api.onModelProgress(updateModelProgress); window.api.onConnectionState((payload) => { showError(new Error(payload.reason || "SSH connection lost.")); window.clearInterval(refreshTimer); }); setDashboardTab("overview"); initializeChat(); loadCatalogue(); updateHardwareStatus(); refresh(); refreshTimer = window.setInterval(refresh, 1000);
  elements.disconnect.addEventListener("click", async () => { window.clearInterval(refreshTimer); await window.api.disconnect(); window.location.assign("index.html"); });
})();
