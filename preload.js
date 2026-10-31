"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", Object.freeze({
  connectSSH: (credentials) => ipcRenderer.invoke("ssh-connect", credentials),
  listProfiles: () => ipcRenderer.invoke("profiles:list"),
  getProfileCredentials: (id) => ipcRenderer.invoke("profiles:credentials", id),
  saveProfile: (profile) => ipcRenderer.invoke("profiles:save", profile),
  deleteProfile: (id) => ipcRenderer.invoke("profiles:delete", id),
  getTelemetry: () => ipcRenderer.invoke("ssh:telemetry"),
  getTelemetrySafe: () => ipcRenderer.invoke("ssh:get-telemetry"),
  checkHardware: () => ipcRenderer.invoke("ssh:check-hardware"),
  getInstalledModels: () => ipcRenderer.invoke("ssh:installed-models"),
  ensureDocker: () => ipcRenderer.invoke("ssh:ensure-docker"),
  initializeEnvironment: () => ipcRenderer.invoke("ssh:initialize-environment"),
  deployService: (configuration) => ipcRenderer.invoke("ssh:deploy-service", configuration),
  removeModel: (model) => ipcRenderer.invoke("ssh:remove-model", model),
  runModel: (model) => ipcRenderer.invoke("ssh:run-model", model),
  powerAction: (action) => ipcRenderer.invoke("ssh:power-action", action),
  sendChatPrompt: (model, prompt, requestId) => ipcRenderer.invoke("ssh:chat", { model, prompt, requestId }),
  cancelChat: (requestId) => ipcRenderer.invoke("ssh:cancel-chat", requestId),
  onChatChunk: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("ssh:chat-chunk", handler);
    return () => ipcRenderer.removeListener("ssh:chat-chunk", handler);
  },
  onDeploymentLog: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("ssh:deployment-log", handler);
    return () => ipcRenderer.removeListener("ssh:deployment-log", handler);
  },
  onInstallProgress: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("ssh:install-progress", handler);
    return () => ipcRenderer.removeListener("ssh:install-progress", handler);
  },
  onModelProgress: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("ssh:model-progress", handler);
    return () => ipcRenderer.removeListener("ssh:model-progress", handler);
  },
  onConnectionState: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("ssh:connection-state", handler);
    return () => ipcRenderer.removeListener("ssh:connection-state", handler);
  },
  restartContainer: (name) => ipcRenderer.invoke("ssh:restart-container", name),
  dockerAction: (action, name) => ipcRenderer.invoke("ssh:docker-action", { action, name }),
  disconnect: () => ipcRenderer.invoke("ssh:disconnect")
}));
