# YaKyoLife 開發入口

本專案的瀏覽器 runtime 是靜態 ES Modules。CI 與本機使用 Node 22.16.0、`package-lock.json` 固定的 Playwright 1.56.1。

| 工作 | 命令 |
| --- | --- |
| 首次安裝／重建環境 | `bash scripts/codex-setup.sh` |
| 本機站台 | `npm run serve`（預設 `http://127.0.0.1:8124/`） |
| 發布產物／資源驗證 | `npm run build`／`npm run check:site` |
| 靜態檢查 | `npm run test:static` |
| 單元測試 | `npm run test:unit` |
| 既有 Chromium 回歸 | `npm run test:regression` |
| Chromium／WebKit E2E 與生涯 fixture | `npm run test:e2e` |
| PWA 生命週期與離線冷啟動 | `npm run test:pwa`（先 `npm run build`） |
| 完整驗證 | `npm run check` |

瀏覽器測試命令會自動啟動本機 HTTP server；如需測既有 server，可設 `YAKYOLIFE_URL`。`npm run serve` 可用 `PORT` 與 `APP_BASE` 設定連接埠及子路徑。既有測試預設使用 Playwright 管理的 Chromium；只有明確指定 `CHROME_PATH` 才覆寫。

`npm run check` 會建立一次 `_site` 並驗證該產物。若指定 `SITE_ROOT`，則驗證既有產物而不重建。PWA 測試自行管理 A／B 本機站台與 persistent profile，不使用 `YAKYOLIFE_URL`；不可 mock Service Worker 或以 HTTP cache 代替離線驗收。以 `SITE_ROOT=_site npm run serve` 試玩發布版；直接 serve 原始碼不註冊 worker。

測試應以本機 server 執行；勿把正式站、Google Fonts、圖示 CDN、GitHub token 或 DNS 當成成功前提。Phase 0 的 fixture 位於 `tests/fixtures/`，只在有意修改規則與預期結果時重錄並審查年度／最終摘要。`tools/build-headless.mjs` 的 UI 掛鉤不等於真實瀏覽器配點驗收。
