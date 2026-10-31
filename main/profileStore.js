"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { app, safeStorage } = require("electron");

const storeVersion = 1;

const getStorePath = () => path.join(app.getPath("userData"), "profiles.json");

const emptyStore = () => ({ version: storeVersion, profiles: [] });

const readStore = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(getStorePath(), "utf8"));
    if (!parsed || !Array.isArray(parsed.profiles)) return emptyStore();
    return { version: storeVersion, profiles: parsed.profiles };
  } catch (error) {
    if (error.code !== "ENOENT") console.warn("Unable to read saved SSH profiles:", error.message);
    return emptyStore();
  }
};

const writeStore = (store) => {
  fs.mkdirSync(path.dirname(getStorePath()), { recursive: true });
  const temporaryPath = `${getStorePath()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryPath, getStorePath());
};

const profileForRenderer = (profile) => ({
  id: profile.id,
  name: profile.name,
  host: profile.host,
  port: profile.port,
  username: profile.username,
  authType: profile.authType,
  keyPath: profile.keyPath || "",
  hasPassword: Boolean(profile.encryptedPassword),
  updatedAt: profile.updatedAt
});

const validateProfile = (profile) => {
  if (!profile || typeof profile !== "object") throw new Error("A server profile is required.");
  const name = typeof profile.name === "string" ? profile.name.trim() : "";
  const host = typeof profile.host === "string" ? profile.host.trim() : "";
  const username = typeof profile.username === "string" ? profile.username.trim() : "";
  const port = Number(profile.port);
  const authType = profile.authType === "key" ? "key" : "password";
  if (!name || name.length > 80) throw new Error("Profile name must be between 1 and 80 characters.");
  if (!host || host.length > 253) throw new Error("Enter a valid host or IP address.");
  if (!username || username.length > 128) throw new Error("Enter a valid username.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SSH port must be between 1 and 65535.");
  if (authType === "key" && (!profile.keyPath || typeof profile.keyPath !== "string")) throw new Error("A private key path is required.");
  if (authType === "password" && !profile.password && !profile.id) throw new Error("A password is required for a new profile.");
  return { name, host, username, port, authType, keyPath: authType === "key" ? profile.keyPath.trim() : "" };
};

const listProfiles = () => readStore().profiles.map(profileForRenderer);

const saveProfile = (rawProfile) => {
  const input = validateProfile(rawProfile);
  const store = readStore();
  const existingIndex = store.profiles.findIndex((profile) => profile.id === rawProfile.id);
  const existing = existingIndex >= 0 ? store.profiles[existingIndex] : null;
  const password = typeof rawProfile.password === "string" && rawProfile.password.length > 0
    ? rawProfile.password
    : null;
  if (input.authType === "password" && !password && !existing?.encryptedPassword) {
    throw new Error("A password is required for this profile.");
  }
  if (password && !safeStorage.isEncryptionAvailable()) {
    throw new Error("OS credential encryption is unavailable; the profile was not saved.");
  }
  const profile = {
    id: existing?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    ...input,
    encryptedPassword: password
      ? safeStorage.encryptString(password).toString("base64")
      : (input.authType === "password" ? existing?.encryptedPassword : ""),
    updatedAt: new Date().toISOString()
  };
  if (existingIndex >= 0) store.profiles[existingIndex] = profile;
  else store.profiles.push(profile);
  writeStore(store);
  return profileForRenderer(profile);
};

const getProfileCredentials = (id) => {
  const profile = readStore().profiles.find((item) => item.id === id);
  if (!profile) throw new Error("Saved server profile was not found.");
  const credentials = {
    host: profile.host,
    port: profile.port,
    username: profile.username,
    privateKeyPath: profile.authType === "key" ? profile.keyPath : ""
  };
  if (profile.authType === "password") {
    if (!profile.encryptedPassword || !safeStorage.isEncryptionAvailable()) throw new Error("The saved password cannot be decrypted on this computer.");
    try {
      const encryptedPassword = typeof profile.encryptedPassword === "string"
        ? Buffer.from(profile.encryptedPassword, "base64")
        : Buffer.from(profile.encryptedPassword.data || []);
      credentials.password = safeStorage.decryptString(encryptedPassword);
    } catch (error) {
      throw new Error(`The saved password could not be decrypted: ${error.message}`);
    }
  }
  return credentials;
};

const deleteProfile = (id) => {
  const store = readStore();
  const profiles = store.profiles.filter((profile) => profile.id !== id);
  if (profiles.length === store.profiles.length) throw new Error("Saved server profile was not found.");
  writeStore({ ...store, profiles });
  return true;
};

module.exports = { listProfiles, saveProfile, getProfileCredentials, deleteProfile };
