# Phase 1：PWA 與發布產物

此階段保留 v2.0.11 遊戲規則；尚未提供生涯存檔。發布／iPhone 真機閘門獨立於自動化驗證，未完成前不宣稱正式站或 iOS 已驗收。

## 建置及版本

- `npm run build` 只將 `index.html`、`manifest.webmanifest`、`CNAME`、`og.png`、`assets/`、`css/`、`src/` 複製至 `_site`，再產生 `sw.js`、`precache.json`。不發布 repository 的 tools、tests、scripts、計畫與依賴。
- 每次建置產生新的 UUID build ID，包含同 APP_VER 修補、重新建置與回退。`APP_VER` 是顯示版本，`RULES_VERSION` 是規則版本；存檔 schema 尚未建立，未以 build ID 代替 schema。
- `scripts/version-policy.mjs` 明列核心 token `2.0.11` 與入口 token `2.0.11-ui-complete` 的映射，靜態檢查同時核對 runtime、HTML 與測試的動態 import。發布時在入口、每個 module、CSS、manifest、圖示與字型 URL 附加同一 `build` query；因此等待更新期間，舊文件的延遲載入仍能找到舊版 bytes，state／RNG import 保持單一實例。
- 資源清單涵蓋全部 runtime 檔案與完整引用 URL，包括靜態／字面動態 import、HTML、DOM 資產、CSS、manifest 圖示、Phosphor WOFF2。非字面動態 import 會中止建置，須先擴充清單規則。清單逐項記錄 MIME、大小與 SHA-256。
- `npm run check:site` 比較清單、worker 與實際 artifact、版本鍵、圖示尺寸及發布白名單。安裝時 worker 再驗證實際 HTTP 回應，拒絕缺檔、錯誤 MIME、長度與雜湊不符；失敗只刪該次未完成的 cache；若瀏覽器被終止而留下殘缺 candidate，下次安裝先重新核驗並清理，再重新下載。
- 192／512 圖示沿用 `purpose: any`，180 圖示保留給 Apple；未宣告未經裁切驗證的 maskable 圖示。Phosphor 2.1.1 的三種字型與 MIT 授權均已附入。文字使用既有系統 fallback，不需要 Google Fonts；分享產圖原有的 2.5 秒字型等待上限保留。

## 離線與更新協定

1. 原始碼 server 不註冊 worker；使用 `SITE_ROOT=_site npm run serve` 驗收產物。靜態 manifest、worker URL 與 scope 均相對部署目錄，支援 `/` 與 `/yakyulife/`。
2. 初裝不執行 `clients.claim()`，不接管已在玩的未受控頁面。完整快取就緒後，玩家在首頁或引退後按「啟用離線模式」重新載入。只有 controller 的 build ID 與目前頁面相同、且快取重新核驗成功，狀態按鈕才顯示「可離線遊玩」。按鈕在首頁與遊戲中持續顯示，展開說明時重新檢查快取；連線／斷線和回到分頁時也更新判定。更新通知與現役版本的離線狀態分開顯示，原始碼模式或不支援時明確顯示尚未就緒。
3. 受控根目錄／`index.html` 導覽固定回傳 active shell，瀏覽器保留 `?seed=`；其他導覽不作 shell fallback。JS／CSS 嚴格匹配完整 query，缺檔回 404，從不將新版網路 bytes 填回現役 cache。
4. 新版本安裝完成進入 waiting，玩家按更新才開始協調。worker 詢問 scope 內所有 client，包含未受控頁面；首頁／引退頁暫時鎖住操作後回覆安全，進行中、未知或無回覆頁面都延後更新。再次核對 client 集合與有效期限後才 `skipWaiting()`。
5. 通過協調的頁面在啟用後各重新載入一次。協調失敗會解除鎖定；頁面鎖有期限，避免 initiating tab／worker 中斷後無法操作。競態中仍存在的舊文件可使用帶 build ID 的舊模組快取；不會因控制者切換取得新版模組。
6. 只有目前 scope 內全部 client 確認已執行新 build，且沒有 installing／waiting candidate，才刪除該 scope 的舊 cache。未知／暫停頁面會保留舊 cache，後續載入重試清理。不觸碰 IndexedDB、其他 scope 或其他專案 cache。
7. 註冊失敗仍可一般網頁遊玩，明確顯示「離線尚未就緒」。下載失敗保留現役版本，可按重試或重新連線觸發下載。

生命週期依據：[clients.claim](https://developer.mozilla.org/en-US/docs/Web/API/Clients/claim)、[skipWaiting](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting)。

## 驗證命令

`npm run check` 執行 static、unit、24 支既有 Chromium 回歸、Chromium／WebKit smoke、生涯 fixture 與 headless 比對，再建置 `_site`、執行 artifact 檢查與 PWA 測試。指定 `SITE_ROOT` 時使用既有 artifact。Pages workflow 上傳並部署這份通過驗證的 `_site`，部署 job 不重新 checkout 或建置。

`tests/pwa/lifecycle.mjs` 使用真實本機 server 切換 A／B artifact，兩種 App base 均驗證初裝中遊玩、完整 cache、同 seed 導覽、缺檔、下載中斷／MIME／雜湊錯誤、殘缺 candidate 重試、waiting 舊 shell、忙碌／未知 client 延後、多分頁各 reload 一次、cache 清理與回退。清除 HTTP cache、關閉整個 persistent Chromium 並停掉 server 後，重開相同 profile，回放尚未在線上跑過的 TW 與高中轉入 fixture 至引退，核對年度／最終 digest 並產生 PNG。WebKit 驗證一般遊玩與註冊失敗降級。

## 本次交付與執行紀錄

- Runtime：`index.html`、`css/style.css`、`src/main.js`、`src/config.js`、新增 `manifest.webmanifest`、`sw.js`、`src/pwa.js`、`src/pwa-build.js` 與 `assets/phosphor/`（三種 CSS／WOFF2、來源說明及 MIT 授權）。
- 建置／CI：新增 `scripts/build-site.mjs`、`check-site.mjs`、`release-lib.mjs`、`version-policy.mjs`；更新 `serve.mjs`、`test-static.mjs`、`run-tests.mjs`、`check.mjs`、`package.json` 與 `.github/workflows/pages.yml`。
- 測試：新增 `tests/pwa/lifecycle.mjs`、`tests/unit/release.test.mjs`；擴充 `tests/e2e/career-fixture.mjs` 以同一套 UI 回放驗證發布產物，未重錄任何 fixture。
- 文件：更新 `PLAN.md`、`AGENTS.md`、`README.md`，新增本紀錄。
- 基準與完成後均執行 `npm run check`：static、4 個 unit、24 個既有回歸、4 個 E2E 入口、98 個完整 URL 的產物檢查及 PWA 測試通過。另執行 `npm run build`、`npm run check:site`、`npm run test:unit`、`npm run test:pwa` 與 `git diff --check`，皆通過。初次瀏覽器基準因沙箱不能 listen 而中止，使用允許本機 server／瀏覽器的執行環境後通過。
- 最後補上註冊失敗時「重試」也不得重載進行中生涯的保護，重建產物後再次通過 `check:site` 與完整 PWA 測試。真實外部下載僅用於取得固定 Phosphor 2.1.1 資產；驗證不依賴正式站或 CDN。

## 發布與真機閘門（待維護者）

2026-09-24 正式站檢查：`https://ishengfang.github.io/yakyulife/` 可連線開啟，但當時部署的是原始碼（`src/pwa-build.js` 的 `BUILD_ID = null`、`sw.js` 的 `RELEASE = null`），無 build meta、Service Worker 註冊或 Cache Storage。以乾淨 persistent Chromium profile 連線開啟後清除 HTTP cache，關閉整個瀏覽器，再以相同 profile 斷網冷啟動，導覽失敗 `net::ERR_INTERNET_DISCONNECTED`。此結果表示該次正式部署尚不能離線遊玩，並非發布產物的本機離線驗證失敗。需確認 Pages Source 使用 GitHub Actions 並部署 workflow 產出的 `_site`，再驗收正式網址。

- [ ] 合併後記錄 Pages Actions 成功 run、artifact build ID、實際網址與 HTTPS。Source 使用 GitHub Actions；CNAME 是紀錄，實際自訂網域須在 Pages 後台設定。此 fork 仍以 `https://ishengfang.github.io/yakyulife/` 為預期網址。
- [ ] 記錄裝置、iOS 版本、測試者及日期。Safari 與主畫面 App 分別連線直到「可離線使用」。
- [ ] 兩種使用環境各自關閉 App，開飛航模式後重新啟動；可開新生涯、完成到引退，圖示完整且三種結算圖可產生。
- [ ] 實際發布新 build，生涯中顯示更新且不跳頁；完成生涯後由玩家更新，多分頁不失去進行中的操作、不混用模組。
- [ ] 記錄字型 fallback 與加入主畫面圖示是否正常。此階段不驗收中斷續玩，不把 Playwright WebKit 當作 iPhone PWA 真機結果。
