export type Product = "supervisor" | "com" | "addin";

export const PRODUCTS: Product[] = ["supervisor", "com", "addin"];

export interface SearchResult {
  title: string;
  breadcrumb: string;
  snippet: string;
  url: string;
}

export interface FetchResult {
  title: string;
  breadcrumb: string;
  markdown: string;
  sourceUrl: string;
}

export interface ResolvedTarget {
  product: Product;
  version: string;
  lang: string;
}
