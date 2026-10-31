# Contributing to ShipAI

Thanks for helping improve ShipAI. Contributions should keep the project focused on secure remote Linux operations and local AI infrastructure management.

## Report a bug

1. Search [existing issues](https://github.com/Kasper839/ShipAI/issues) to avoid duplicates.
2. Open a new issue with a concise title and the relevant version, operating system, remote distribution, and reproduction steps.
3. Include safe logs or screenshots where useful. **Do not include passwords, private keys, hostnames, IP addresses, or other secrets.**

## Submit a pull request

1. Fork the repository and create a focused branch:

   ```bash
   git checkout -b feature/short-description
   ```

2. Install dependencies and make the smallest complete change:

   ```bash
   npm install
   ```

3. Validate JavaScript syntax and run the relevant application checks before pushing.
4. Update documentation or model metadata when behavior changes.
5. Push the branch and open a pull request describing the problem, solution, and validation performed.

Keep pull requests focused, follow the existing code style, preserve context-isolated IPC boundaries, and never commit credentials or environment-specific configuration.

