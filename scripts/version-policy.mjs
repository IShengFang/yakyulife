// Explicit compatibility mapping checked in source, browser-test imports and the
// generated graph. APP_VER alone is never used as a cache identity.
export const CORE_TOKEN='2.0.11';
export const ENTRY_TOKEN='2.0.11-ui-complete';
export function expectedToken(file){
  return file==='src/main.js'||file==='css/style.css'?ENTRY_TOKEN:CORE_TOKEN;
}
