export interface CopatoolsConfig {
  apiBaseUrl: string;
}

export function getCopatoolsConfig(): CopatoolsConfig {
  const apiBaseUrl = (process.env.COPATOOLS_API_BASE_URL ?? "https://api.copatools.com").replace(/\/+$/, "");
  return { apiBaseUrl };
}
