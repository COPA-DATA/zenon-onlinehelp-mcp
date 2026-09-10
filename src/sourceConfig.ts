import type { DocSource } from "./docSource.js";
import { createZenonDocSource } from "./sources/zenon/index.js";
import { createCopatoolsDocSource } from "./sources/copatools/index.js";

export function getActiveDocSource(): DocSource {
  const raw = (process.env.DOC_SOURCE ?? "zenon").trim().toLowerCase();
  switch (raw) {
    case "zenon":
      return createZenonDocSource();
    case "copatools":
      return createCopatoolsDocSource();
    default:
      throw new Error(`Unknown DOC_SOURCE "${raw}". Valid values: "zenon" (default), "copatools".`);
  }
}
