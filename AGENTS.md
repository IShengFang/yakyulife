# YaKyoLife 開發入口

本專案的瀏覽器 runtime 是靜態 ES Modules。CI 與本機使用 Node 22.16.0、`package-lock.json` 固定的 Playwright 1.56.1。

| 工作 | 命令 |
| --- | --- |
| 首次安裝／重建環境 | `bash scripts/codex-setup.sh` |
| 本機站台 | `npm run serve`（預設 `http://127.0.0.1:8124/`） |
| 靜態檢查 | `npm run test:static` |
| 單元測試 | `npm run test:unit` |
| 既有 Chromium 回歸 | `npm run test:regression` |
| Chromium／WebKit E2E 與生涯 fixture | `npm run test:e2e` |
| PWA 測試入口 | `npm run test:pwa`（Phase 1 才會加入 Service Worker 測試） |
| 完整驗證 | `npm run check` |

瀏覽器測試命令會自動啟動本機 HTTP server；如需測既有 server，可設 `YAKYOLIFE_URL`。`npm run serve` 可用 `PORT` 與 `APP_BASE` 設定連接埠及子路徑。既有測試預設使用 Playwright 管理的 Chromium；只有明確指定 `CHROME_PATH` 才覆寫。

測試應以本機 server 執行；勿把正式站、Google Fonts、圖示 CDN、GitHub token 或 DNS 當成成功前提。Phase 0 的 fixture 位於 `tests/fixtures/`，只在有意修改規則與預期結果時重錄並審查年度／最終摘要。`tools/build-headless.mjs` 的 UI 掛鉤不等於真實瀏覽器配點驗收。
