import { z } from "zod";
import { SearchResult, FetchResult } from "./types.js";

export interface DocSourceToolInfo {
  title: string;
  description: string;
}

export interface DocSourceTools {
  searchTool: DocSourceToolInfo;
  fetchTool: DocSourceToolInfo & { urlParamDescription: string };
}

export interface DocSourceSearchResponse {
  results: SearchResult[];
  /** Optional context fragment (no trailing punctuation) appended to the
   *  "no results found" message, e.g. "in supervisor v1600". */
  emptyResultContext?: string;
}

export interface DocSource {
  readonly id: string;
  readonly tools: DocSourceTools;
  /**
   * Extra zod fields (beyond `query`) merged into zenon_docs_search's input
   * schema. Typed as a raw shape (not literal per-source keys) so any
   * DocSource can plug in here — as a result, TS inference over the merged
   * schema in mcpServer.ts types these extra fields loosely. Zod still
   * validates/coerces them correctly at runtime; this is an accepted static-
   * typing cost of genuine pluggability, not a bug.
   */
  readonly searchParamsSchema: z.ZodRawShape;
  search(query: string, extra: Record<string, unknown>): Promise<DocSourceSearchResponse>;
  fetch(url: string): Promise<FetchResult>;
  /** Releases held resources (browser processes, etc.) on shutdown. */
  close(): Promise<void>;
}
