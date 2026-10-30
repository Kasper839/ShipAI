"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", Object.freeze({
  connectSSH: (credentials) => ipcRenderer.invoke("ssh-connect", credentials),
  getTelemetry: () => ipcRenderer.invoke("ssh:telemetry"),
  getTelemetrySafe: () => ipcRenderer.invoke("ssh:get-telemetry"),
  checkHardware: () => ipcRenderer.invoke("ssh:check-hardware"),
  initializeEnvironment: () => ipcRenderer.invoke("ssh:initialize-environment"),
  deployService: (configuration) => ipcRenderer.invoke("ssh:deploy-service", configuration),
  removeModel: (model) => ipcRenderer.invoke("ssh:remove-model", model),
  sendChatPrompt: (model, prompt) => ipcRenderer.invoke("ssh:chat", { model, prompt }),
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
  restartContainer: (name) => ipcRenderer.invoke("ssh:restart-container", name),
  dockerAction: (action, name) => ipcRenderer.invoke("ssh:docker-action", { action, name }),
  disconnect: () => ipcRenderer.invoke("ssh:disconnect")
}));
