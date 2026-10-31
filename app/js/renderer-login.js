(() => {
  "use strict";

  const form = document.getElementById("connection-form");
  if (!form || !window.api) return;

  const $ = (id) => document.getElementById(id);
  const button = $("connect-button");
  const message = $("connection-message");
  const profileSelect = $("profile-select");
  let profiles = [];
  let selectedProfile = null;
  const t = (key, fallback) => window.shipaiI18n ? window.shipaiI18n.translate(key) : fallback;

  const setError = (name, value = "") => {
    const field = $(name);
    const error = document.querySelector(`[data-error-for="${name}"]`);
    if (field) field.toggleAttribute("aria-invalid", Boolean(value));
    if (error) error.textContent = value;
  };

  const renderProfiles = () => {
    profileSelect.replaceChildren(new Option(t("newConnection", "New connection"), ""));
    profiles.forEach((profile) => profileSelect.append(new Option(`${profile.name} — ${profile.username}@${profile.host}`, profile.id)));
    $("delete-profile").disabled = !profileSelect.value;
  };

  const loadProfiles = async () => {
    try {
      profiles = await window.api.listProfiles();
      renderProfiles();
      if (profiles.length) {
        profileSelect.value = profiles[0].id;
        await selectProfile(profiles[0]);
      }
    } catch (error) {
      message.textContent = `Unable to load saved profiles: ${error.message}`;
      message.classList.add("is-error");
    }
  };

  const selectProfile = async (profile) => {
    selectedProfile = profile || null;
    $("delete-profile").disabled = !selectedProfile;
    if (!selectedProfile) {
      $("profile-name").value = "";
      $("host").value = "";
      $("port").value = "22";
      $("username").value = "";
      $("password").value = "";
    } else {
      $("profile-name").value = selectedProfile.name;
      $("host").value = selectedProfile.host;
      $("port").value = String(Number.parseInt(String(selectedProfile.port), 10));
      $("username").value = selectedProfile.username;
      $("password").value = "";
      try {
        const credentials = await window.api.getProfileCredentials(selectedProfile.id);
        if (selectedProfile.id === profileSelect.value) {
          $("password").value = typeof credentials.password === "string" ? credentials.password : "";
        }
      } catch (error) {
        console.warn("[Login] Unable to decrypt saved password:", error.message);
        message.textContent = t("savedCredentialUnavailable", "Saved password is unavailable. Enter it again.");
        message.classList.add("is-error");
      }
    }
  };

  profileSelect.addEventListener("change", () => {
    void selectProfile(profiles.find((profile) => profile.id === profileSelect.value) || null);
  });

  $("delete-profile").addEventListener("click", async () => {
    if (!selectedProfile || !window.confirm(`${t("deleteProfileConfirm", "Delete the saved profile?")} "${selectedProfile.name}"`)) return;
    try {
      await window.api.deleteProfile(selectedProfile.id);
      selectedProfile = null;
      profiles = profiles.filter((profile) => profile.id !== profileSelect.value);
      renderProfiles();
      profileSelect.dispatchEvent(new Event("change"));
    } catch (error) {
      message.textContent = error.message;
      message.classList.add("is-error");
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const host = $("host").value.trim();
    const port = Number($("port").value);
    const username = $("username").value.trim();
    const password = $("password").value;
    const profileName = $("profile-name").value.trim();
    let valid = true;
    [["host", host, t("enterHost", "Enter a host or IP address.")], ["username", username, t("enterUsername", "Enter a username.")]].forEach(([name, value, error]) => {
      setError(name, value ? "" : error);
      if (!value) valid = false;
    });
    const canUseSavedPassword = selectedProfile?.hasPassword;
    if (!password && !canUseSavedPassword) {
      setError("password", t("enterPassword", "Enter your SSH password or choose a saved profile."));
      valid = false;
    } else setError("password");
    setError("port", Number.isInteger(port) && port > 0 && port <= 65535 ? "" : t("validPort", "Use a port between 1 and 65535."));
    if (!Number.isInteger(port) || port < 1 || port > 65535) valid = false;
    if (!valid) return;

    button.disabled = true;
    button.classList.add("is-loading");
    message.textContent = t("connecting", "Connecting...");
    message.classList.remove("is-error");
    try {
      const activeCredentials = {
        profileId: selectedProfile?.id || "",
        host,
        port: Number.parseInt(String(port), 10),
        username,
        password,
        sudoPassword: $("sudo-password").value
      };
      console.log("[Login] connecting with profile", {
        profileId: activeCredentials.profileId || null,
        host: activeCredentials.host,
        port: activeCredentials.port,
        username: activeCredentials.username,
        passwordProvided: Boolean(activeCredentials.password),
      });
      await window.api.connectSSH(activeCredentials);
      if ($("save-profile").checked) {
        const savedName = profileName || selectedProfile?.name || `${username}@${host}`;
        await window.api.saveProfile({ id: selectedProfile?.id, name: savedName, host, port, username, password });
      }
      window.location.assign("dashboard.html");
    } catch (error) {
      message.textContent = error.message || t("connectionFailed", "Unable to connect to the server.");
      message.setAttribute("role", "alert");
      message.classList.add("is-error");
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  });

  loadProfiles();
})();
