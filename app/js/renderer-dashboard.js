(() => {
  "use strict";
  if (!window.api) return;

  const $ = (id) => document.getElementById(id);
  const t = (key, fallback) => window.shipaiI18n ? window.shipaiI18n.translate(key) : fallback;
  const elements = {
    temperature: $("cpu-temperature"), ramUsage: $("ram-usage"), ramTotal: $("ram-total"),
    ramProgress: $("ram-progress"),
    refresh: $("refresh-button"), disconnect: $("disconnect-button"), error: $("dashboard-error"),
    environmentWarning: $("environment-warning"), updated: $("charts-status"),
    dockerStatus: $("docker-status"),
    containerCount: $("container-count"), tableBody: $("containers-table-body"),
    chartCpuValue: $("chart-cpu-value"), chartRamValue: $("chart-ram-value"),
    chartNetworkValue: $("chart-network-value"), chartDiskValue: $("chart-disk-value"),
    storageList: $("storage-list"), vramActive: $("active-vram"), vramFreeable: $("freeable-vram"),
    vramContext: $("context-overhead"), vramProgress: $("vram-progress"), flushVram: $("flush-vram"),
    cancelDownload: $("cancel-download")
  };
  const refreshInstalledModels = async () => {
    try {
      const models = await window.api.getInstalledModels();
      installedModels = Array.isArray(models) ? models : [];
      installedModelsLoaded = true;
      populateChatModels();
      renderCatalogue();
    } catch (error) {
      console.warn("Unable to refresh installed Ollama models:", error.message);
    }
  };
  const history = { cpu: [], ram: [], network: [], disk: [] };
  let refreshInFlight = false;
  let refreshTimer;
  let dockerRepairTimer;
  let hardware = null;
  let catalogue = [];
  let installedModels = [];
  let installedModelsLoaded = false;
  let chatModel = null;
  let chatResponse = null;
  const taskTabs = new Map();
  let activeDownloadModel = "";
  let activeDownloadJobId = "";
  const cancelledDownloadJobs = new Set();
  let downloadProgressFrame = 0;

  const showError = (error) => { elements.error.textContent = error.message || "Unable to retrieve server telemetry."; elements.error.hidden = false; };
  const showToast = (message) => { const toast = $("dashboard-toast"); toast.textContent = message; toast.hidden = false; window.setTimeout(() => { toast.hidden = true; }, 2600); };
  const populateChatModels = () => {
    const select = $("chat-model-select");
    if (!select) return;
    const previous = chatModel;
    select.replaceChildren();
    if (!installedModels.length) {
      select.add(new Option(t("noModels", "No installed models found"), ""));
      setChatModel(null);
      return;
    }
    installedModels.forEach((model) => select.add(new Option(model.name, model.name)));
    const selected = installedModels.some((model) => model.name === previous) ? previous : installedModels[0].name;
    select.value = selected;
    setChatModel(selected);
  };
  const setChatModel = (model) => {
    chatModel = model || null;
    const select = $("chat-model-select");
    const send = $("chat-send");
    const empty = $("chat-empty-state");
    if (select && chatModel) select.value = chatModel;
    if (send) send.disabled = !chatModel;
    if (empty) empty.hidden = Boolean(chatModel);
  };
  const createTaskTab = (model) => {
    const taskId = `model-${model.ollama.replace(/[^a-zA-Z0-9_-]/g, "-")}-${Date.now()}`;
    const state = { taskId, model, jobId: null, requestId: null };
    taskTabs.set(taskId, state);
    setDashboardTab("marketplace");
    return state;
  };
  const updateTaskProgress = (payload) => {
    const state = [...taskTabs.values()].find((task) => task.jobId === payload.jobId);
    if (!state) return;
    updateModelProgress({ ...payload, model: state.model.name });
  };
  const updateTaskLog = (entry) => {
    if (entry.jobId && [...taskTabs.values()].some((task) => task.jobId === entry.jobId)) {
      updateModelProgress({ model: "active model", message: entry.data || "Receiving download status..." });
    }
  };
  const openTaskChat = (state) => {
    setChatModel(state.model.ollama);
    setDashboardTab("ai-chat");
  };
  const setDashboardTab = (name) => {
    document.querySelectorAll("[data-dashboard-tab]").forEach((tab) => { const active = tab.dataset.dashboardTab === name; tab.classList.toggle("is-active", active); tab.setAttribute("aria-selected", String(active)); });
    document.querySelectorAll("[data-dashboard-view]").forEach((view) => { const active = view.dataset.dashboardView === name; view.hidden = !active; view.classList.toggle("hidden", !active); });
    document.querySelector(".dashboard-layout").classList.toggle("is-chat-studio", name === "ai-chat");
    $("model-progress").hidden = name === "ai-chat" || $("model-progress").dataset.active !== "true";
    if (name === "overview") void ensureDockerAccess();
    if (name === "marketplace" || name === "ai-chat") void refreshInstalledModels();
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
    const gradientId = `${id}-gradient`;
    const areaPoints = `0,96 ${points} 320,96`;
    chart.innerHTML = `<defs><linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".32"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="M 0 96 H 320 M 0 57 H 320 M 0 18 H 320" stroke="#334155" stroke-width="1" fill="none"/><polygon points="${areaPoints}" fill="url(#${gradientId})"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`;
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
      row.innerHTML = `<th scope="row"><span class="service-name"></span><span class="service-id"></span></th><td class="container-image"></td><td><span class="status-badge"><span class="status-dot" aria-hidden="true"></span><span data-container-state></span></span></td><td class="last-action"></td><td><span data-container-actions></span></td>`;
      row.querySelector(".service-name").textContent = container.name; row.querySelector(".service-id").textContent = t("container", "Container"); row.querySelector(".container-image").textContent = container.ports || t("noPorts", "No published ports");
      row.querySelector("[data-container-state]").textContent = running ? t("running", "Running") : t("stopped", "Stopped"); row.querySelector(".last-action").textContent = t("synced", "Synced");
      const actions = row.querySelector("[data-container-actions]");
      [["start", t("start", "Start")], ["stop", t("stop", "Stop")], ["logs", t("logs", "Logs")]].filter(([action]) => action === "logs" || action === (running ? "stop" : "start")).forEach(([action, label]) => {
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
  const refreshVram = async () => {
    try {
      const status = await window.api.getOllamaVramStatus(4096);
      const active = Number(status.activeVramBytes);
      const total = Number(status.totalModelBytes);
      elements.vramActive.textContent = `${formatBytes(Number.isFinite(active) ? active : 0)} / ${formatBytes(Number.isFinite(total) ? total : 0)}`;
      elements.vramFreeable.textContent = formatBytes(Number.isFinite(Number(status.freeableVramBytes)) ? Number(status.freeableVramBytes) : 0);
      elements.vramContext.textContent = formatBytes(Number.isFinite(Number(status.estimatedContextOverheadBytes)) ? Number(status.estimatedContextOverheadBytes) : 0);
      elements.vramProgress.style.width = `${total > 0 ? Math.min(100, active / total * 100) : 0}%`;
      const warning = $("environment-warning");
      if (warning && Number.isFinite(total) && total > 0 && active > total) {
        warning.hidden = false;
        warning.textContent = "Active model memory exceeds available VRAM. Inference may fall back to system RAM or run slowly.";
      }
    } catch (error) {
      elements.vramActive.textContent = "N/A";
      elements.vramFreeable.textContent = "N/A";
      elements.vramContext.textContent = "N/A";
      elements.vramProgress.style.width = "0%";
      console.warn("Unable to retrieve Ollama VRAM status:", error.message);
    }
  };

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
    const task = createTaskTab(model);
    activeDownloadModel = model.name;
    updateModelProgress({ model: model.name, state: "preparing", percent: 0, message: "Starting Ollama pull..." });
    elements.cancelDownload.hidden = true;
    button.disabled = true; button.textContent = t("pulling", "Pulling...");
    try { const result = await window.api.deployService({ type: "model", model: model.ollama }); task.jobId = result.jobId; activeDownloadJobId = result.jobId; elements.cancelDownload.hidden = false; showToast(`Pull started for ${model.name}`); }
    catch (error) { showError(error); button.disabled = false; button.textContent = t("download", "Download"); }
  };
  const removeModel = async (model, button) => {
    button.disabled = true;
    try { await window.api.removeModel(model.ollama); await refreshInstalledModels(); showToast(`${model.name} removed`); }
    catch (error) { showError(error); button.disabled = false; }
  };
  const runModel = async (model, button) => {
    const task = createTaskTab(model);
    openTaskChat(task);
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
    try { const task = createTaskTab({ name: model, ollama: model }); activeDownloadModel = model; updateModelProgress({ model, state: "preparing", percent: 0, message: "Starting Ollama pull..." }); elements.cancelDownload.hidden = true; const result = await window.api.deployService({ type: "model", model }); task.jobId = result.jobId; activeDownloadJobId = result.jobId; elements.cancelDownload.hidden = false; input.value = ""; showToast(`Stahování modelu ${model} bylo zahájeno.`); }
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
        const performance = card.querySelector(".model-performance"); performance.textContent = model.vram || `~${model.minimum?.vram || "N/A"} VRAM`; performance.title = fit.reason; const run = card.querySelector(".model-run"); const download = card.querySelector(".model-download"); const remove = card.querySelector(".model-remove");
        card.querySelector(".model-status").textContent = installed ? t("installed", "Installed") : t("available", "Available");
        run.textContent = t("tryRun", "Try / Run"); download.textContent = t("download", "Download"); remove.textContent = t("remove", "Remove");
        download.disabled = Boolean(installed); remove.disabled = !installed; run.addEventListener("click", () => runModel(model, run)); download.addEventListener("click", () => deployModel(model, download)); remove.addEventListener("click", () => removeModel(model, remove)); card.querySelector(".model-card-main").addEventListener("click", () => openModelDetails(model)); grid.append(card);
      }); root.append(section);
    });
    $("catalogue-count").textContent = `${catalogue.length}`; $("installed-count").textContent = installedModelsLoaded ? `${installedModels.length} ${t("modelInstalled", "installed in Ollama")}` : t("checkingOllama", "Checking Ollama...");
  };
  const updateModelStatus = (models) => {
    const previous = installedModels.map((model) => model.name).sort().join("|");
    const next = models.map((model) => model.name).sort().join("|");
    installedModels = models;
    installedModelsLoaded = true;
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
    const percentValue = Number(payload.percent);
    const percent = Number.isFinite(percentValue) ? Math.max(0, Math.min(100, percentValue)) : 0;
    if (payload.model) activeDownloadModel = payload.model;
    const finished = payload.state === "complete" || payload.state === "error" || payload.state === "cancelled";
    panel.hidden = finished && payload.state !== "complete";
    panel.dataset.active = finished ? "false" : "true";
    if (elements.cancelDownload) {
      elements.cancelDownload.hidden = panel.hidden || panel.dataset.active !== "true";
      elements.cancelDownload.disabled = false;
    }
    $("download-model").textContent = activeDownloadModel || t("modelDownload", "Model download");
    document.getElementById("download-percent").textContent = `${percent}%`;
    document.getElementById("progress-bar-fill").style.width = `${percent}%`;
    const message = payload.message || "";
    const speedMbps = Number(payload.speedMbps);
    const speed = Number.isFinite(speedMbps) ? `${speedMbps.toFixed(2)} MB/s` : message.match(/(\d+(?:\.\d+)?\s*(?:KB|MB|GB)\/s)/i)?.[1];
    const size = message.match(/(\d+(?:\.\d+)?\s*(?:KB|MB|GB)\s*\/\s*\d+(?:\.\d+)?\s*(?:KB|MB|GB))/i);
    const etaSeconds = Number(payload.etaSeconds);
    const eta = Number.isFinite(etaSeconds) && etaSeconds > 0 ? ` · ETA ${Math.ceil(etaSeconds)}s` : "";
    $("download-speed").textContent = speed ? `${speed}${eta}` : (payload.state === "complete" ? t("downloadComplete", "Download complete") : t("transferring", "Transferring over SSH"));
    const total = Number(payload.total || payload.sizeBytes);
    const completed = Number(payload.completed);
    $("download-sizes").textContent = Number.isFinite(total) && total > 0 ? `${formatBytes(Number.isFinite(completed) ? completed : 0)} / ${formatBytes(total)}` : (size ? size[1] : (message || t("calculating", "Calculating transfer size...")));
    window.cancelAnimationFrame(downloadProgressFrame);
    downloadProgressFrame = window.requestAnimationFrame(() => {
      document.getElementById("progress-bar-fill").style.width = percent + "%";
      panel.querySelector(".progress-track").setAttribute("aria-valuenow", String(percent));
    });
    if (payload.state === "complete") {
      $("download-speed").textContent = t("downloadComplete", "Download complete");
      $("download-sizes").textContent = t("modelInstalledRemote", "Model installed on remote host");
    }
    if (payload.state === "error") $("download-speed").textContent = t("downloadFailed", "Download failed");
  };
  const refresh = async () => {
    if (refreshInFlight) return; refreshInFlight = true; elements.refresh.disabled = true;
    try {
      const telemetry = await window.api.getTelemetry(); elements.error.hidden = true; elements.temperature.textContent = telemetry.cpuTemperatureC === null ? "N/A" : telemetry.cpuTemperatureC.toFixed(1);
      await refreshVram();
      if (telemetry.cpuUsagePercent !== null) { addHistoryPoint("cpu", telemetry.cpuUsagePercent); elements.chartCpuValue.textContent = `${telemetry.cpuUsagePercent}%`; }
      if (telemetry.networkBytesPerSecond !== null) { addHistoryPoint("network", telemetry.networkBytesPerSecond); elements.chartNetworkValue.textContent = `${(telemetry.networkBytesPerSecond / 1024).toFixed(1)} KB/s`; }
      if (telemetry.memory) { elements.ramUsage.textContent = (telemetry.memory.usedMb / 1024).toFixed(1); elements.ramTotal.textContent = (telemetry.memory.totalMb / 1024).toFixed(1); elements.ramProgress.style.width = `${telemetry.memory.usagePercent}%`; addHistoryPoint("ram", telemetry.memory.usagePercent); elements.chartRamValue.textContent = `${telemetry.memory.usagePercent}%`; }
      if (telemetry.disk) { const diskRate = (telemetry.disk.readBytesPerSecond || 0) + (telemetry.disk.writeBytesPerSecond || 0); addHistoryPoint("disk", diskRate); elements.chartDiskValue.textContent = `${(diskRate / 1024 / 1024).toFixed(1)} MB/s`; renderStorage(telemetry.disk); }
      renderChart("cpu-chart", history.cpu, "#818cf8", 0, 100); renderChart("ram-chart", history.ram, "#2dd4bf", 0, 100); renderChart("network-chart", history.network, "#f59e0b"); renderChart("disk-chart", history.disk, "#f472b6"); elements.updated.textContent = `Updated ${new Date(telemetry.timestamp).toLocaleTimeString()}`;
    } catch (error) { showError(error); } finally { elements.refresh.disabled = false; refreshInFlight = false; }
  };

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character]));
  const markdownToHtml = (value, streaming = false) => {
    let html = escapeHtml(value);
    html = html.replace(/```([\w+-]*)\n?([\s\S]*?)(?:```|$)/g, (_match, language, code) => `<pre class="chat-code"><button type="button" class="copy-code" data-code="${encodeURIComponent(code)}">Copy Code</button><code class="language-${language || "text"}">${code}</code></pre>`);
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
    return streaming ? html : html;
  };
  const bindCopyButtons = (root) => root.querySelectorAll(".copy-code").forEach((button) => button.addEventListener("click", async () => {
    await navigator.clipboard.writeText(decodeURIComponent(button.dataset.code));
    button.textContent = t("copied", "Copied");
  }));

  const initializeChat = () => {
    $("chat-model-select").addEventListener("change", (event) => { setChatModel(event.target.value); $("chat-messages").replaceChildren(); });
    $("clear-chat").addEventListener("click", () => { $("chat-messages").replaceChildren(); chatResponse = null; });
    const input = $("chat-prompt");
    input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; });
    input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); $("chat-form").requestSubmit(); } });
    $("chat-stop").addEventListener("click", async () => {
      const response = chatResponse;
      if (!response?.requestId || !response.streaming) return;
      response.cancelled = true;
      response.streaming = false;
      $("chat-stop").hidden = true;
      $("chat-send").disabled = !chatModel;
      $("chat-memory").textContent = t("idle", "Idle");
      try { await window.api.cancelChat(response.requestId); }
      catch (error) { console.error("[Chat] Unable to cancel generation:", error); }
    });
    window.api.onChatChunk((payload) => {
      if (payload.requestId !== chatResponse?.requestId || chatResponse.cancelled) return;
      if (payload.type === "token") chatResponse.querySelector(".chat-markdown").insertAdjacentHTML("beforeend", markdownToHtml(payload.data, true));
      if (payload.type === "error") chatResponse.querySelector(".chat-markdown").insertAdjacentHTML("beforeend", `<p class="chat-error">${escapeHtml(payload.data)}</p>`);
      if (payload.type === "done" || payload.type === "error") { chatResponse.streaming = false; bindCopyButtons(chatResponse); $("chat-memory").textContent = t("idle", "Idle"); $("chat-stop").hidden = true; $("chat-send").disabled = !chatModel; }
      $("chat-messages").scrollTop = $("chat-messages").scrollHeight;
    });
    $("chat-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!chatModel || chatResponse?.streaming) return;
      const prompt = input.value.trim();
      if (!prompt) return;
      const messages = $("chat-messages");
      const user = document.createElement("article"); user.className = "chat-message chat-message--user"; user.textContent = prompt; messages.append(user);
      chatResponse = document.createElement("article"); chatResponse.className = "chat-message chat-message--assistant"; chatResponse.requestId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; chatResponse.streaming = true; chatResponse.cancelled = false; chatResponse.innerHTML = '<div class="chat-markdown"></div>'; messages.append(chatResponse);
      input.value = ""; input.style.height = "auto"; $("chat-send").disabled = true; $("chat-stop").hidden = false; $("chat-memory").textContent = t("responding", "Responding");
      try { await window.api.sendChatPrompt(chatModel, prompt, chatResponse.requestId); }
      catch (error) { if (!chatResponse.cancelled) chatResponse.querySelector(".chat-markdown").innerHTML = `<p class="chat-error">${escapeHtml(error.message)}</p>`; }
      finally { chatResponse.streaming = false; $("chat-send").disabled = !chatModel; $("chat-stop").hidden = true; $("chat-memory").textContent = t("idle", "Idle"); }
    });
  };
  $("dashboard-tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-dashboard-tab]");
    if (!tab || event.target.closest(".temporary-tab-close")) return;
    setDashboardTab(tab.dataset.dashboardTab);
  });
  $("dashboard-tabs").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const tab = event.target.closest("[data-dashboard-tab]");
    if (!tab || event.target.closest(".temporary-tab-close")) return;
    event.preventDefault();
    setDashboardTab(tab.dataset.dashboardTab);
  });
  $("model-search").addEventListener("input", renderCatalogue); $("model-category").addEventListener("change", renderCatalogue); $("custom-model-form").addEventListener("submit", downloadCustomModel); elements.refresh.addEventListener("click", refresh);
  elements.flushVram.addEventListener("click", async () => { elements.flushVram.disabled = true; try { await window.api.flushOllamaVram(); await refreshVram(); showToast("VRAM flushed."); } catch (error) { showError(error); } finally { elements.flushVram.disabled = false; } });
  const requestPowerAction = (action, label) => {
    if (!window.confirm(`Are you sure you want to ${label} the remote server?`)) return;
    window.api.powerAction(action).then(() => showToast(`${label[0].toUpperCase()}${label.slice(1)} requested.`)).catch(showError);
  };
  $("restart-server").addEventListener("click", () => requestPowerAction("restart", "reboot"));
  $("shutdown-server").addEventListener("click", () => requestPowerAction("shutdown", "shutdown"));
  $("start-chat")?.addEventListener("click", () => { $("chat-panel").hidden = false; $("chat-prompt").focus(); });
  window.addEventListener("shipai:language-changed", () => { populateChatModels(); if (catalogue.length) renderCatalogue(); });
  const onPullProgress = (data) => {
    const percent = Math.max(0, Math.min(100, Number(data.percent)));
    if (!Number.isFinite(percent)) return;
    document.getElementById("download-percent").textContent = `${percent}%`;
    document.getElementById("progress-bar-fill").style.width = `${percent}%`;
    const speedMbps = Number(data.speedMbps);
    if (Number.isFinite(speedMbps)) document.getElementById("download-speed").textContent = `${speedMbps.toFixed(2)} MB/s`;
    const total = Number(data.total || data.sizeBytes);
    const completed = Number(data.completed);
    if (Number.isFinite(total) && total > 0) {
      document.getElementById("download-sizes").textContent = `${formatBytes(Number.isFinite(completed) ? completed : 0)} / ${formatBytes(total)}`;
    }
    updateModelProgress({ ...data, state: data.status === "success" ? "complete" : "downloading" });
  };
  window.api.onOllamaPullProgress(onPullProgress); window.api.onDeploymentLog((entry) => { updateTaskLog(entry); }); window.api.onInstallProgress((entry) => { updateTaskLog(entry); }); window.api.onModelProgress((payload) => { const wasCancelled = cancelledDownloadJobs.has(payload.jobId); if (!wasCancelled) updateModelProgress(payload); updateTaskProgress(payload); if (payload.state === "complete" || payload.state === "error" || payload.state === "cancelled") { const task = [...taskTabs.values()].find((item) => item.jobId === payload.jobId); if (payload.jobId === activeDownloadJobId) activeDownloadJobId = ""; if ((payload.state === "error" || payload.state === "cancelled") && task) taskTabs.delete(task.taskId); if (task && payload.state === "complete" && !wasCancelled) openTaskChat(task); if (payload.state === "error" && !wasCancelled && payload.message !== "Model download cancelled.") showError(new Error(payload.message || "Model download failed.")); if (payload.state === "complete" && !wasCancelled) void refreshInstalledModels(); if (wasCancelled) cancelledDownloadJobs.delete(payload.jobId); } }); window.api.onConnectionState(() => { window.clearInterval(refreshTimer); const layout = document.querySelector(".dashboard-layout"); const lostView = $("connection-lost-view"); if (layout) layout.hidden = true; if (lostView) lostView.hidden = false; }); $("reconnect-button")?.addEventListener("click", async () => { $("reconnect-button").disabled = true; try { await window.api.disconnect(); } finally { window.location.assign("index.html"); } }); elements.cancelDownload?.addEventListener("click", async () => { const cancelledJobId = activeDownloadJobId; if (!cancelledJobId) return; cancelledDownloadJobs.add(cancelledJobId); const cancelledModel = activeDownloadModel; activeDownloadJobId = ""; const panel = $("model-progress"); panel.hidden = true; panel.dataset.active = "false"; elements.cancelDownload.hidden = true; elements.cancelDownload.disabled = true; const task = [...taskTabs.values()].find((item) => item.jobId === cancelledJobId); if (task) taskTabs.delete(task.taskId); try { await window.api.cancelOllamaPull(cancelledJobId); } catch { } showToast(`${cancelledModel || "Model"} download cancelled.`); }); setDashboardTab("overview"); initializeChat(); loadCatalogue(); updateHardwareStatus(); refresh(); refreshTimer = window.setInterval(refresh, 3000);
  elements.disconnect.addEventListener("click", async () => { window.clearInterval(refreshTimer); await window.api.disconnect(); window.location.assign("index.html"); });
})();
