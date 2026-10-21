# Contributing

Thanks for your interest in improving the zenon Docs MCP Server. This is a best-effort project, so please be patient with response times.

## Before you start

- For anything beyond a small fix, open an issue first to discuss the change.
- Security problems: see [SECURITY.md](SECURITY.md), not a public issue.
- Please read the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development

```bash
npm install
npm run build
npm test            # unit and integration tests, no network or browser needed
npm run test:live   # hits the real documentation sites; run sparingly, never in CI
```

Keep requests to the documentation sites to a minimum while developing and testing.

## Pull requests

- Keep each pull request focused, and add or update tests.
- Make sure `npm run build` and `npm test` pass.
- Do not commit secrets, `.env` files, `.azure/` contents or copied documentation content.
- Add the SPDX header to new source files:

  ```
  // SPDX-License-Identifier: MIT
  // Copyright (c) 2026 Ing. Punzenberger COPA-DATA GmbH
  ```

## Sign-off (Developer Certificate of Origin)

Sign off every commit with `git commit -s`. This certifies that you wrote the contribution or have the right to submit it under the project's MIT license, as described in the [DCO](https://developercertificate.org/).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
