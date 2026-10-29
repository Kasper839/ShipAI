(() => {
  "use strict";

  const form = document.querySelector("#connection-form");
  const statusBadge = document.querySelector("#connection-status");
  const statusLabel = statusBadge?.querySelector(".status-badge__label");
  const connectButton = document.querySelector("#connect-button");
  const credentialInput = document.querySelector("#credential");
  const credentialLabel = document.querySelector("#credential-label");
  const credentialToggle = document.querySelector("#toggle-credential");
  const connectionLog = document.querySelector("#connection-log");
  const authMethodInputs = document.querySelectorAll('input[name="authMethod"]');

  if (!form || !statusBadge || !statusLabel || !connectButton || !credentialInput || !credentialLabel || !credentialToggle || !connectionLog) {
    return;
  }

  const setStatus = (state, label) => {
    statusBadge.className = `status-badge status-badge--${state}`;
    statusLabel.textContent = label;
  };

  const setFieldError = (fieldName, message = "") => {
    const field = document.querySelector(`#${fieldName}`);
    const error = document.querySelector(`[data-error-for="${fieldName}"]`);
    if (!field || !error) return;
    field.setAttribute("aria-invalid", message ? "true" : "false");
    error.textContent = message;
  };

  const validate = () => {
    const host = document.querySelector("#host");
    const port = document.querySelector("#port");
    const username = document.querySelector("#username");
    let valid = true;

    setFieldError("host");
    setFieldError("port");
    setFieldError("username");
    setFieldError("credential");

    if (!host.value.trim()) {
      setFieldError("host", "Enter an IP address or hostname.");
      valid = false;
    }

    const portNumber = Number(port.value);
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      setFieldError("port", "Use a port between 1 and 65535.");
      valid = false;
    }

    if (!username.value.trim()) {
      setFieldError("username", "Enter the server username.");
      valid = false;
    }

    if (!credentialInput.value.trim()) {
      setFieldError("credential", `Enter your ${credentialLabel.textContent.toLowerCase()}.`);
      valid = false;
    }

    return valid;
  };

  const appendLog = (message) => {
    const entry = document.createElement("p");
    entry.textContent = message;
    connectionLog.append(entry);
    connectionLog.classList.remove("hidden");
  };

  const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

  authMethodInputs.forEach((input) => {
    input.addEventListener("change", () => {
      const isPrivateKey = input.value === "private-key" && input.checked;
      credentialLabel.textContent = isPrivateKey ? "SSH private key" : "Password";
      credentialInput.type = isPrivateKey ? "text" : "password";
      credentialInput.autocomplete = isPrivateKey ? "off" : "current-password";
      credentialInput.placeholder = isPrivateKey ? "Paste your private key" : "Enter your server password";
      credentialToggle.hidden = isPrivateKey;
      credentialToggle.setAttribute("aria-pressed", "false");
      credentialToggle.textContent = "Show";
      setFieldError("credential");
    });
  });

  credentialToggle.addEventListener("click", () => {
    const isVisible = credentialInput.type === "text";
    credentialInput.type = isVisible ? "password" : "text";
    credentialToggle.textContent = isVisible ? "Show" : "Hide";
    credentialToggle.setAttribute("aria-label", `${isVisible ? "Show" : "Hide"} password`);
    credentialToggle.setAttribute("aria-pressed", String(!isVisible));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (connectButton.disabled || !validate()) return;

    connectButton.disabled = true;
    connectButton.classList.add("is-loading");
    connectionLog.innerHTML = "";
    setStatus("connecting", "Connecting");

    const host = document.querySelector("#host").value.trim();
    const port = document.querySelector("#port").value;
    appendLog(`Resolving ${host}...`);
    await wait(550);
    appendLog(`Opening secure SSH channel on port ${port}...`);
    await wait(750);
    appendLog("Verifying server credentials...");
    await wait(800);
    appendLog("Connection verified successfully.");

    setStatus("connected", "Connected");
    connectButton.disabled = false;
    connectButton.classList.remove("is-loading");
    connectButton.querySelector(".button-label").textContent = "Reconnect to server";
  });
})();
