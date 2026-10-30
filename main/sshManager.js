"use strict";

class SshManager {
  constructor(getClient) {
    this.getClient = getClient;
    this.sudoPassword = null;
  }

  clearSession() {
    this.sudoPassword = null;
  }

  getCachedSudoPassword() {
    return this.sudoPassword;
  }

  setCachedSudoPassword(password) {
    this.sudoPassword = password;
  }

  execute(command, { timeoutMs = 10000, input = "", onStdout, onStderr } = {}) {
    return new Promise((resolve, reject) => {
      const client = this.getClient();
      if (!client) {
        reject(new Error("No SSH connection is active."));
        return;
      }

      let timer;
      let settled = false;
      let stdout = "";
      let stderr = "";
      let activeStream = null;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (settled && activeStream && typeof activeStream.destroy === "function" && callback === reject) activeStream.destroy();
        callback(value);
      };
      const fail = (error) => finish(reject, error instanceof Error ? error : new Error(String(error)));

      try {
        client.exec(command, (error, stream) => {
          if (error) {
            fail(error);
            return;
          }
          activeStream = stream;
          const output = (chunk, target, listener) => {
            const text = chunk.toString();
            target === "stdout" ? stdout += text : stderr += text;
            if (listener) listener(text);
          };
          stream.on("data", (chunk) => output(chunk, "stdout", onStdout));
          stream.stderr.on("data", (chunk) => output(chunk, "stderr", onStderr));
          stream.once("error", fail);
          stream.once("close", (code) => finish(resolve, {
            code: Number.isInteger(code) ? code : 1,
            stdout: stdout.trim(),
            stderr: stderr.trim()
          }));
          if (input) stream.write(input);
        });
      } catch (error) {
        fail(error);
      }

      timer = setTimeout(() => {
        if (settled) return;
        fail(new Error(`Remote command timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`));
      }, timeoutMs);
    });
  }

}

module.exports = { SshManager };
