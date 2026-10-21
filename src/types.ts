// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ing. Punzenberger COPA-DATA GmbH

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
