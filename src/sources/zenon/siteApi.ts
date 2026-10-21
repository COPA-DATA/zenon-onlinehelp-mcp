// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ing. Punzenberger COPA-DATA GmbH

import { PRODUCTS, Product, ResolvedTarget } from "./types.js";

export const BASE_URL = "https://onlinehelp.copadata.com";

type ContentManifest = Partial<Record<Product, string[]>>;

let manifestCache: { value: ContentManifest; fetchedAt: number } | null = null;
const MANIFEST_TTL_MS = 5 * 60 * 1000;

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`Request to ${path} failed with status ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function getContentManifest(): Promise<ContentManifest> {
  if (manifestCache && Date.now() - manifestCache.fetchedAt < MANIFEST_TTL_MS) {
    return manifestCache.value;
  }
  const raw = await fetchJson<Record<string, string[]>>("/api/v1/Content");
  const manifest: ContentManifest = {};
  for (const product of PRODUCTS) {
    if (Array.isArray(raw[product]) && raw[product].length > 0) {
      manifest[product] = [...raw[product]].sort((a, b) => Number(b) - Number(a));
    }
  }
  manifestCache = { value: manifest, fetchedAt: Date.now() };
  return manifest;
}

export async function getLanguages(product: Product, version: string): Promise<string[]> {
  return fetchJson<string[]>(`/api/v1/languages/${product}/${version}`);
}

/**
 * Validates the requested product/version/lang against the live site
 * manifest, filling in sensible defaults (newest version, English) when
 * omitted. Throws a descriptive error listing valid values on mismatch.
 */
export async function resolveTarget(
  productInput: string | undefined,
  versionInput: string | undefined,
  langInput: string | undefined
): Promise<ResolvedTarget> {
  const manifest = await getContentManifest();

  const product = (productInput ?? "supervisor") as Product;
  if (!PRODUCTS.includes(product) || !manifest[product]) {
    throw new Error(
      `Unknown or unavailable product "${productInput}". Valid products: ${PRODUCTS.filter(
        (p) => manifest[p]
      ).join(", ")}.`
    );
  }

  const versions = manifest[product]!;
  const version = versionInput ?? versions[0];
  if (!versions.includes(version)) {
    throw new Error(
      `Unknown version "${versionInput}" for product "${product}". Valid versions: ${versions.join(", ")}.`
    );
  }

  const languages = await getLanguages(product, version);
  const lang = langInput ?? (languages.includes("en") ? "en" : languages[0]);
  if (!lang || !languages.includes(lang)) {
    throw new Error(
      `Unknown language "${langInput}" for product "${product}" version "${version}". Valid languages: ${languages.join(
        ", "
      )}.`
    );
  }

  return { product, version, lang };
}
