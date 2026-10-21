// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ing. Punzenberger COPA-DATA GmbH

export type Product = "supervisor" | "com" | "addin";

export const PRODUCTS: Product[] = ["supervisor", "com", "addin"];

export interface ResolvedTarget {
  product: Product;
  version: string;
  lang: string;
}
