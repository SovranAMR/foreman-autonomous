/**
 * Parça B — OAuth / oturum keşfi özeti (salt okuma, makine envanteri).
 *
 * Resmi programatik yol: Dashboard API anahtarı + Basic auth (api.cursor.com)
 * ve @cursor/february SDK — bkz. cursor-api.ts, cursor-february-provider.ts.
 *
 * IDE oturumu: Cursor, MCP için OAuth 2.1 + PKCE kullanır; bu token'ların
 * Cloud Agents / SDK ile aynı Authorization şemasına indirgenip indirgenmediği
 * dokümante değildir. Bu repoda PKCE ile "Antigravity klonu" yalnızca Cursor
 * tarafında resmi client_id/redirect ile mümkünse yapılmalıdır.
 *
 * Örnek ~/.cursor düzeni (Linux, 2026-04): argv.json, ide_state.json, projects/,
 * extensions/, plugins/, ai-tracking/ — oturum anahtarları çoğunlukla Electron
 * / credential store içinde; düz metin token aramak güvenilir değildir.
 *
 * Sonuç (no-go / resmi yol): Harici CLI için Bearer üretmek üzere IDE'yi
 * tersine mühendislik yerine CURSOR_API_KEY + February SDK kullanılmalıdır.
 */
export const CURSOR_OAUTH_RECON_SUMMARY =
  "Official path: CURSOR_API_KEY + @cursor/february. IDE OAuth (MCP) is separate; " +
  "no documented PKCE-to-LLM pipeline equivalent to Google Cloud Code Assist.";
