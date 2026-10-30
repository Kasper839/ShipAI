(() => {
  "use strict";

  const form = document.getElementById("connection-form");
  if (!form || !window.api) return;

  const button = document.getElementById("connect-button");
  const message = document.getElementById("connection-message");
  const t = (key, fallback) => window.shipaiI18n ? window.shipaiI18n.translate(key) : fallback;
  const setError = (name, value = "") => {
    const field = document.getElementById(name);
    const error = document.querySelector(`[data-error-for="${name}"]`);
    if (field) field.toggleAttribute("aria-invalid", Boolean(value));
    if (error) error.textContent = value;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const host = document.getElementById("host").value.trim();
    const port = Number(document.getElementById("port").value);
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const sudoPassword = document.getElementById("sudo-password").value;
    let valid = true;
    [["host", host, "Enter a host or IP address."], ["username", username, "Enter a username."], ["password", password, "Enter your SSH password."]].forEach(([name, value, error]) => {
      setError(name, value ? "" : error);
      if (!value) valid = false;
    });
    setError("port", Number.isInteger(port) && port > 0 && port <= 65535 ? "" : "Use a port between 1 and 65535.");
    if (!Number.isInteger(port) || port < 1 || port > 65535) valid = false;
    if (!valid) return;

    button.disabled = true;
    button.classList.add("is-loading");
    message.textContent = t("connecting", "Connecting...");
    message.classList.remove("is-error");
    try {
      await window.api.connectSSH({ host, port, username, password, sudoPassword: sudoPassword || password });
      window.location.assign("dashboard.html");
    } catch (error) {
      message.textContent = error.message || t("connectionFailed", "Unable to connect to the server.");
      message.setAttribute("role", "alert");
      message.classList.add("is-error");
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  });
})();
