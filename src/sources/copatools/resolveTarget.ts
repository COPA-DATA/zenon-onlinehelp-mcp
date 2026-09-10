import { getVersions } from "./api.js";
import { ResolvedTarget } from "./types.js";

const OEM = "copadata";

/**
 * Mirrors zenon/siteApi.ts's resolveTarget: validates the requested
 * product/version/lang against the live /admin/versions manifest, filling
 * in sensible defaults (newest public version, English) when omitted.
 * Throws a descriptive error listing valid values on mismatch.
 */
export async function resolveTarget(
  productInput: string | undefined,
  versionInput: string | undefined,
  langInput: string | undefined
): Promise<ResolvedTarget> {
  const allVersions = await getVersions();
  const versions = allVersions.filter((v) => v.oem === OEM && v.public);
  if (versions.length === 0) {
    throw new Error(`No public "${OEM}" versions were returned by the docs.copatools.com API.`);
  }

  const product = productInput ?? "supervisor";
  const matchingProduct = versions.filter((v) => v.products.includes(product));
  if (matchingProduct.length === 0) {
    const validProducts = [...new Set(versions.flatMap((v) => v.products))];
    throw new Error(`Unknown or unavailable product "${productInput}". Valid products: ${validProducts.join(", ")}.`);
  }

  const sorted = [...matchingProduct].sort((a, b) => Number(b.code) - Number(a.code));
  const version = versionInput ?? sorted[0].code;
  const versionInfo = sorted.find((v) => v.code === version);
  if (!versionInfo) {
    throw new Error(
      `Unknown version "${versionInput}" for product "${product}". Valid versions: ${sorted.map((v) => v.code).join(", ")}.`
    );
  }

  const lang = langInput ?? (versionInfo.languages.includes("en") ? "en" : versionInfo.languages[0]);
  if (!lang || !versionInfo.languages.includes(lang)) {
    throw new Error(
      `Unknown language "${langInput}" for product "${product}" version "${version}". Valid languages: ${versionInfo.languages.join(", ")}.`
    );
  }

  return { product, version, lang };
}
