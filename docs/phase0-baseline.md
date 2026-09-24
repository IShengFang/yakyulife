# Phase 0 基準紀錄

日期：2026-09-24。工作分支：`main`；開始實作時的本機 HEAD：`875b448a4e1b6bda639db3974b15e13e411ce1da`。遊戲規則版本：`v2.0.11`。本文件描述本機變更，尚未代表已推送或發布。

## 可重現測試

- Node 固定為 22.16.0；`package-lock.json` 固定 Playwright 1.56.1。
- 全新 checkout 執行 `bash scripts/codex-setup.sh`，重跑同一腳本仍使用 `npm ci`。Linux 同時安裝 Chromium／WebKit 的系統依賴。
- `npm run check` 依序執行 static、unit、24 支既有 Chromium regression、Chromium／WebKit E2E、fixture 回放、headless 比對及 Phase 1 預留的 PWA 命令。`test:pwa` 在 Phase 0 明確回報尚未有 Service Worker 測試，不代表 PWA 已驗收。
- `npm run serve` 預設 `http://127.0.0.1:8124/`；測試命令自動啟動臨時連接埠。可用 `YAKYOLIFE_URL` 指向既有 server；`CHROME_PATH` 僅在明確指定時覆寫 Playwright Chromium。
- E2E 封鎖外部字型／圖示 CSS 依賴，測試結果不依賴正式站或 CDN。Phase 1 必須補本機圖示與真正的 Service Worker 離線測試。

## v2.0.11 生涯 fixture

`tests/fixtures/` 記錄 `P/C/IF/OF/TW` 五種開局及 `convert`（投手在高中自然觸發天才邀請，選擇轉入二刀流）。每筆有 seed、明確姓名／背號、每次選項與配點、一次復原、各年度 SHA-256、最終狀態摘要與 digest。年度摘要含年份、球隊、能力、投打統計、薪資與榮譽；最終摘要含結局。重錄指令是 `node scripts/record-fixtures.mjs`，只在有意修改規則且審查差異時使用。

錄製與回放都在真實 Chromium 的 UI 點擊；它不借用 `tools/sim-twoway.mjs` 的選擇策略，避免策略額外消耗遊戲 RNG。獨立的 headless 比對將同一操作序列餵入 `tools/build-headless.mjs` 掛鉤，六條生涯的最終 model 一致。headless 仍不能代替瀏覽器配點、時間軸或結算 UI 驗收。視覺骰子動畫使用 `Math.random()`，不在 digest 內。

## GitHub Pages 與網址

- 此 fork 的預期發布來源是 `main` push／`workflow_dispatch` 觸發的 `.github/workflows/pages.yml`，Pages 後台 Source 須選 **GitHub Actions**。測試通過後才部署。
- 2026-09-24 公開 GitHub Pages API 對 `IShengFang/yakyulife` 回傳 404；`https://ishengfang.github.io/yakyulife/` 也回傳 404。此 fork 目前無法確認有已啟用的 Pages 站台。現有 `https://www.yakyolife.com/` 可開啟 v2.0.11，但不能從這點推論此 fork 已綁定該網域。
- 因此本 fork 以 `https://ishengfang.github.io/yakyulife/` 為預期 App base；`OFFICIAL_URL`、canonical、社群圖片及 README 已對齊。瀏覽器測試覆蓋 `/`、`/index.html`、`/yakyulife/`、`/yakyulife/index.html` 的 `?seed=` 入口。seed 僅是重玩輸入，並非存檔。
- 目前根層 `CNAME` 記錄 `www.yakyolife.com`，但 GitHub Actions Pages 的實際自訂網域由 Pages 後台決定。若維護者要改以自訂網域發布此 fork，須先確認該網域所有權、DNS 指向、Pages 設定與 HTTPS 憑證，再同步 App base、分享連結與測試。
- 啟用 project site 後，維護者須檢查 DNS 解析與 `https://ishengfang.github.io/yakyulife/` 的憑證、HTTPS 強制轉址和部署紀錄。Phase 1 再驗證根層與子路徑的 `?seed=` 離線導覽。

## 尚待維護者記錄的真機基準

請在 `docs/phase0-device-baseline.md` 填寫 Safari responsive mode 與至少一台 iPhone 的現況。這項手動發布閘門尚未完成，不能以 WebKit smoke 代替。
