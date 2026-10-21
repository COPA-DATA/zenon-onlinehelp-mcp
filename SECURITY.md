# Security Policy

## Reporting a vulnerability

Please do **not** report security vulnerabilities in public issues or pull requests.

Use GitHub's private vulnerability reporting: go to the **Security** tab of this repository and choose **Report a vulnerability**.

Please include the affected version or commit, steps to reproduce, and the impact you expect. We aim to acknowledge reports within 10 working days and will keep you informed. This project is maintained on a best-effort basis, so we cannot promise fix timelines.

## Supported versions

Only the latest release on `main` receives security fixes.

## Scope

In scope: the MCP server code in this repository and the container and Azure deployment files in `Dockerfile`, `azure.yaml` and `infra/`.

Out of scope: vulnerabilities in the zenon documentation websites themselves, in zenon products (report these to COPA-DATA support), and in third-party dependencies (report them to the upstream project, though we welcome a heads-up).

## Known design limits

- The HTTP mode has no built-in authentication or CORS. Run it on localhost or behind a network control.
- Content fetched from websites is untrusted and may contain prompt-injection text.
- The Docker image runs Chromium with `--no-sandbox`, relying on container isolation.
