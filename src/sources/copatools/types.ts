// Response shapes confirmed live against api.copatools.com (the public REST
// API backing the docs.copatools.com "COPA-DATA Docs" site) during
// investigation — not guessed.

export interface VersionInfo {
  _id: string;
  code: string;
  displayName: string;
  languages: string[];
  oem: string;
  products: string[];
  public: boolean;
}

export interface TocNode {
  _id: string;
  basedOn: string;
  children: TocNode[];
  language: string;
  parent_id: string;
  title: string;
  topic_id: string;
}

export interface Article {
  _id: string;
  basedOn: string;
  body: string;
  language: string;
  metadata: { keywords: string[] };
  parent_id: string;
  resources: unknown[];
  title: string;
  topic_id: string;
}

export interface SearchHit {
  _id: string;
  body: string;
  metadata: { keywords: string[] };
  score: number;
  term_suggestion: string | null;
  title: string;
  topic_id: string;
}

export interface ResolvedTarget {
  product: string;
  version: string;
  lang: string;
}
