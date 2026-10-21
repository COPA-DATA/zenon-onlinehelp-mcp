// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ing. Punzenberger COPA-DATA GmbH

import { getCopatoolsConfig } from "./config.js";
import { VersionInfo, TocNode, Article, SearchHit } from "./types.js";

async function getJson<T>(path: string, params?: Record<string, string>): Promise<T> {
  const { apiBaseUrl } = getCopatoolsConfig();
  const url = new URL(`${apiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Request to ${url.toString()} failed with status ${res.status}.`);
  }
  return (await res.json()) as T;
}

export async function getVersions(): Promise<VersionInfo[]> {
  return getJson<VersionInfo[]>("/admin/versions");
}

export async function getToc(product: string, ver: string, lang: string): Promise<TocNode[]> {
  return getJson<TocNode[]>("/toc", { product, ver, lang });
}

export async function getArticle(id: string, product: string, ver: string, lang: string): Promise<Article> {
  return getJson<Article>(`/article/${encodeURIComponent(id)}`, { product, ver, lang });
}

export async function search(q: string, product: string, ver: string, lang: string): Promise<SearchHit[]> {
  return getJson<SearchHit[]>("/search", { q, product, ver, lang });
}
