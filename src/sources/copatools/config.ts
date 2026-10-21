// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ing. Punzenberger COPA-DATA GmbH

export interface CopatoolsConfig {
  apiBaseUrl: string;
}

export function getCopatoolsConfig(): CopatoolsConfig {
  const apiBaseUrl = (process.env.COPATOOLS_API_BASE_URL ?? "https://docs-api-cd.copatools.com").replace(/\/+$/, "");
  return { apiBaseUrl };
}
