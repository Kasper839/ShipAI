"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", Object.freeze({
  connectSSH: (credentials) => ipcRenderer.invoke("ssh-connect", credentials),
  getTelemetry: () => ipcRenderer.invoke("ssh:telemetry"),
  getTelemetrySafe: () => ipcRenderer.invoke("ssh:get-telemetry"),
  checkHardware: () => ipcRenderer.invoke("ssh:check-hardware"),
  initializeEnvironment: () => ipcRenderer.invoke("ssh:initialize-environment"),
  authenticateSudo: (password) => ipcRenderer.invoke("ssh:auth-sudo", password),
  verifySudoPassword: (password) => ipcRenderer.invoke("ssh:auth-sudo", password),
  deployService: (configuration) => ipcRenderer.invoke("ssh:deploy-service", configuration),
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
  disconnect: () => ipcRenderer.invoke("ssh:disconnect")
}));
