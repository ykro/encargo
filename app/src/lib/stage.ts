// Stage access: the token an enrolled device presents to start an errand or
// cancel a payment. It arrives through the setup link (/configurar?clave=…)
// and lives only in this browser.
const KEY = "encargo.stage";

export function stageToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveStageToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* private mode: the device simply stays unenrolled */
  }
}

export function stageHeaders(): Record<string, string> {
  const t = stageToken();
  return t ? { authorization: `Bearer ${t}` } : {};
}
