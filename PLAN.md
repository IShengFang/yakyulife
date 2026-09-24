# YaKyoLife mobile 離線 App 實作計畫（v2.0.11 基準）

核對日期：2026-09-24。程式基準：`b19310f`（合併後 HEAD），版本提交：`9b17859`，`src/config.js` 的 `APP_VER='v2.0.11'`。

**結論：升級到 v2.0.11 後，可用 GitHub Pages 部署，並在完成 PWA 快取與本機存檔後支援 mobile 離線遊玩。** 遊戲運算與資料都在本機，沒有新增必須連線的遊戲 API；Phase 1 已補上 Service Worker、完整離線資源與安全更新，但仍沒有生涯存檔，尚不支援中斷續玩。Phase 0／1 的程式碼與本機自動化驗證已完成；實際發布與真機閘門仍待維護者確認。

## 1. 目標與前提

本計畫以 iPhone Safari／加入主畫面為主要驗收環境，mobile App 採 PWA，定義為：

- 遊戲部署在公開的 HTTPS 網址，iPhone 不需要連接開發用電腦即可開啟。
- 玩家可用 Safari 遊玩，也可透過「加入主畫面」以接近 App 的獨立視窗啟動。
- 首次連線完成必要資源下載、Service Worker 啟用並顯示「可離線使用」後，在該使用環境中可離線冷啟動、開新生涯、續玩直到引退與產生結算圖。
- iOS 回收分頁或玩家關閉 App 後，能恢復到最後一個已完成寫入的操作；包含尚未選擇的事件與分配到一半的能力點數。
- 直向與橫向操作皆不遮住選項，瀏海、Dynamic Island、Home Indicator 與軟體鍵盤不會蓋住內容。

這裡採用「遠端託管、在 iPhone 瀏覽器內執行」的 PWA 架構。現有遊戲是純前端模擬，不需要為了遠端開啟而新增後端。若需求其實是「遊戲邏輯必須在伺服器執行」或「iPhone、電腦共用同一份雲端存檔」，需另立後端、登入、資料庫與同步規格；不納入第一版。

離線承諾有明確前提：首次安裝與版本下載需要網路；外部贊助／社群連結與把內容傳到分享目的地仍可能需要網路。本機儲存被使用者清除或被系統回收後，需要重新下載，生涯只能由先前匯出的備份救回，不能承諾永久保存。持久儲存請求只是降低回收風險的措施。[WebKit 儲存政策](https://webkit.org/blog/14403/updates-to-storage-policy/)

Safari 分頁與主畫面 App 必須各自完成首次連線準備，不假設 Cache Storage／IndexedDB 自動共用；既有 Safari 生涯移往主畫面版以 JSON 匯出／匯入處理。[WebKit Web Apps 資料隔離說明](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/)

## 2. Phase 0 開始前的現況盤點

### 已存在、應沿用的基礎

- 無框架、無建置步驟的靜態 ES Modules，可直接放在 GitHub Pages 或其他靜態主機。
- `index.html` 已有 viewport、`viewport-fit=cover`、Apple Web App meta 與 touch icon。
- `css/style.css`、`src/ui/prefs.js` 已有四主題、大字、手機／桌面版面、`100dvh`、safe-area inset 與 sticky 操作區；`src/ui/alloc.js` 會依版面搬移配點面板。
- `src/main.js` 已處理部分 iOS 觸控行為，並在執行時產生 PWA manifest。
- `src/ui/share-image.js` 已優先使用 Web Share API 分享結算圖。
- `CNAME`、頁面 canonical、`OFFICIAL_URL` 與 README 遊玩網址已統一為 `www.yakyolife.com`，不用再修正不存在的舊 README 網址。
- `.github/workflows/pages.yml` 已在 `main` push／手動執行時，以 Node 22、Chromium 跑 `tests/*.mjs`，成功後才部署 Pages。Pages 後台是否已切到 GitHub Actions 仍需確認。
- `tests/` 已有 24 支 Playwright Chromium 回歸測試；`tools/build-headless.mjs`、`tools/sim-twoway.mjs` 可輔助批次模擬。不是從零建立測試。

### v2.0.11 對離線實作的新增影響

| 程式事實 | 實作要求 |
| --- | --- |
| `index.html` 的 CSS／main 入口為 `?v=2.0.11-ui-complete`，module import 為 `?v=2.0.11` | 版本檢查需定義入口 token 與核心版本的映射；預快取須保留完整 URL，不能要求所有 query 字串完全相同 |
| `index.html` 從 jsDelivr 載入 Phosphor 2.1.1 的 regular／bold／fill CSS 與圖示字型，另有 Google Fonts | 必要圖示必須本機化；只讓文字字型 fallback 不足以保證離線選單可操作 |
| `src/flow/phases.js` 新增／擴充二刀流轉入、升級緩衝與成績／頭銜豁免 | 存檔須保留兩側歷史及判定欄位，回歸範圍由 `P/C/IF/OF` 擴為含 `TW` 與轉職路線 |
| `src/core/state.js` 已拆開投／打累積欄位與球季數 | 不可用舊版單刀格式重建或只按目前 `S.pos` 篩掉另一側資料 |
| UI 與結算圖已支援多主題、大小字及多種輸出模式 | 離線字型降級與恢復後也須可排版、產圖；沿用現有 UI，無須重新設計 |

### 當時尚未實作的缺口

- manifest 是執行時建立的 Blob，沒有靜態 `manifest.webmanifest`。
- 沒有 Service Worker，因此無法保證離線啟動，也沒有明確的版本更新策略。
- 遊戲中的 `S`、RNG 私有游標 `_s` 與流程佇列只存在記憶體；localStorage 目前保存偏好與玩家輸入，不是生涯存檔。
- `stepQ` 存函式，`choose()`、配點 `done`、合約／受傷等延續流程均使用 closure；`ALLOC`、`TL[].el` 混有 DOM 參照，不能直接 JSON 序列化。
- `S.log` 是球季紀錄，不是完整事件卡歷史；`endGame()` 同時結算、抽取隨機結局與建立分享 callback，恢復時重跑會改變結果。
- 雖已有測試與發布 workflow，仍缺 `package.json`／lockfile、統一驗證命令、WebKit、PWA／續玩測試與真機清單；CI 每次安裝未固定版本的 Playwright，測試預設 Chrome 路徑仍是 Windows 路徑。

## 3. 架構決策

### 第一版

- 保留純前端 ES Modules runtime，不引入原生 iOS 專案；允許發布時產生資源清單、雜湊與 Service Worker 的輕量打包步驟，瀏覽器不需 Node.js。
- 使用 GitHub Pages 作為第一版部署平台，沿用 GitHub Actions 發布。
- 使用靜態 Web App Manifest + Service Worker 組成可安裝 PWA。
- 存檔先放本機 IndexedDB，另提供 JSON 匯出／匯入作為備份。
- 所有遊戲資料留在裝置上，不上傳姓名、進度或偏好。

### GitHub Pages 部署與離線契約

GitHub Pages 可提供本案的 HTML、CSS、JavaScript 與其他靜態資源，並支援 HTTPS；因此不需要額外的常駐伺服器。Node／Playwright 僅在開發與 CI 執行，Service Worker、遊戲運算、Cache Storage 與 IndexedDB 則在玩家裝置執行。[GitHub Pages 介紹](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[GitHub Pages HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)

| 部署方式 | App base／Service Worker scope | Worker 的公開位置 |
| --- | --- | --- |
| 此 repository 已設定的自訂網域，例如 `https://www.yakyolife.com/` | `/` | `/sw.js` |
| 無自訂網域的 project site，例如 `https://ishengfang.github.io/yakyulife/` | `/yakyulife/` | `/yakyulife/sw.js` |

- [x] `sw.js` 與 `index.html` 同放發布目錄根層，scope 限於該 App base；manifest、資源與註冊 URL 依相同 base 解析。不能把 worker 放在 `src/` 再要求控制整站，也不以額外的 `Service-Worker-Allowed` 回應標頭作部署前提。[Service Worker 註冊與 scope](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register)
- [ ] Pages 的 Source 設為 GitHub Actions，確認部署工作成功及正式網址的 HTTPS。自訂網域須在此 repository 的 Pages 後台設定並有正確 DNS／憑證；Actions 發布時，GitHub 不用 `CNAME` 檔案決定網域。保留該檔可作專案紀錄，但須修正現有 workflow 中「CNAME 決定網域」的註解。[GitHub 自訂網域設定](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [ ] 部署 origin 以此 repository 實際 Pages 設定為準；repo 內寫著 `www.yakyolife.com` 不代表此 fork 已綁定該網域。沒有自訂網域時使用 project site，同步 `OFFICIAL_URL`、canonical、分享連結與 README，不能讓重播連結跳到另一個部署。兩種部署路徑均須通過測試。
- [ ] 首次連線下載完整資源並確認可離線使用後，關閉 App、開啟飛航模式、重新啟動，驗證可開新生涯及遊玩至引退；Phase 3 完成後再驗證中斷續玩。離線期間不需要連回 GitHub Pages，更新版本時才重新下載。[Service Worker 離線快取](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)

這是架構與部署相容性的確認；真正的「已部署且可離線遊玩」仍以 Phase 1／3 的實作、成功部署紀錄與斷網驗收結果為準。

### 暫不採用

- 不先用 Capacitor／原生 WebView 包裝；需要 App Store、Game Center 或 PWA 無法滿足的原生整合時再評估。
- 不在第一版做帳號與雲端同步，避免為單機遊戲引入不必要的隱私、營運與衝突合併成本。
- 不改寫 v2.0.11 遊戲規則與機率；同一規則版本、seed、明確球員輸入與選擇序列，在重構前後及中斷恢復後都應得到同一結果。不同規則版本間不承諾相同 seed 產生相同生涯。

## 4. Codex 雲端實作準備

### 可行性結論與邊界

程式碼、測試、GitHub Pages workflow 與文件都可在 Codex 雲端的隔離環境內實作。使用本機 HTTP server，保留 Chromium 回歸並新增 WebKit 版面／IndexedDB 驗證。**Service Worker、離線冷啟動與版本生命週期自動化以 Chromium 為必要基準**：Playwright 官方目前將 Service Worker 支援限定於 Chromium，不能把「WebKit 跑完全部 PWA 測試」寫成雲端交付前提。[Playwright Service Workers](https://playwright.dev/docs/service-workers)

自動化不能取代真正的 iOS Safari、加入主畫面、VoiceOver、Share Sheet、DNS 或 GitHub Pages 帳號設定。每個階段分成「Codex 雲端完成條件」與「發布／真機閘門」；外部閘門未完成不應冒充已驗收，但也不阻擋下一個純程式碼任務開始。

| 工作 | Codex 雲端 | 外部操作 |
| --- | --- | --- |
| 修改程式、測試、workflow、README | 可完成 | PR 合併由維護者決定 |
| 本機 HTTP、Chromium PWA／離線、Chromium／WebKit UI 與 IndexedDB、自動 accessibility 檢查 | 可完成 | iOS PWA 真機結果另記 |
| GitHub／GitLab repository 授權、Pages 設定與 production deployment | 僅能產生設定檔並檢查 diff | 維護者授權、合併並確認部署 |
| custom domain、DNS、HTTPS 強制轉址 | 可檢查 repo 內 `CNAME` 與文件 | 維護者在 DNS／Pages 後台確認 |
| iPhone Safari、加入主畫面、VoiceOver、Dynamic Island、鍵盤、Share Sheet | 不能真實驗證 | 維護者依真機 checklist 驗收 |

### Repository 與環境前置條件

- [ ] `PLAN.md` 已受版本控制；本次修訂仍需 commit／push 到雲端任務選用的 branch，並記錄實際 SHA。
- [ ] 在 Codex cloud 連接正確 repository（目前為 `IShengFang/yakyulife`），並在每個任務明確指定基準 branch／commit；不得假設本機未推送的修改存在。
- [ ] 第一個 bootstrap 任務沿用 `tests/`、`.gitignore` 與 `.github/workflows/pages.yml`；新增 `package.json`、`package-lock.json`、`AGENTS.md`、`scripts/codex-setup.sh`，補足忽略規則與 smoke test，再設定 cloud setup／maintenance 使用同一支腳本。
- [ ] 以現有 CI 的 Node 22 為起點，確認所選 Playwright 版本支援後固定 Node／Playwright 版本。安裝一律使用 lockfile 與 `npm ci`，不可依賴開發者電腦既有的 global package。
- [ ] `scripts/codex-setup.sh` 必須可重跑，負責 `npm ci` 與安裝鎖定版本的 Chromium、WebKit 及所需系統套件。測試預設使用 Playwright 管理的 browser binary，保留 `CHROME_PATH` 作明確覆寫；lockfile 或 setup script 改變後重建／重設環境 cache。
- [ ] bootstrap 或升級依賴的任務若需在 agent 階段下載新套件，只暫時開放最小必要的 npm 與 Playwright 下載網域；lockfile 落地後的一般實作與測試應可在 agent 無網路下完成。
- [ ] 不把 production credential、DNS token 或個人 GitHub token 當作測試前提。Codex 修改既有 Pages workflow；部署由合併後的 GitHub Actions 權限執行。需要在 agent 階段使用的非敏感設定放 environment variables；不得假設 setup-only secret 在 agent 階段仍存在。
- [ ] `AGENTS.md` 明列 setup、serve、lint／static check、unit、E2E 與總驗證命令，讓每個雲端任務使用同一套入口，例如 `npm run check`，而非依賴對話中的臨時指令。

### 雲端任務切分規則

- 一個 Codex cloud 任務只處理下方一個 PR 交付單位；Phase 3 拆成「流程／action model」「配點／歷史／結算 model」「IndexedDB／恢復 UI」三個可獨立驗證的任務。
- bootstrap 先跑現有 Chromium 測試並記錄基準；建立 `npm run check` 後，每個任務開始與結束皆使用它。基準本來就失敗時列出原有失敗，不以刪除測試或重錄預期值掩蓋差異。
- 測試預設只連本機 server；Google Fonts、圖示 CDN、正式站、GitHub API、DNS 與分析服務不可成為成功條件。一般 UI 測試可封鎖外部請求；PWA 測試須允許真正的 Service Worker，另驗證 worker 的請求也不依賴外網，不能用攔截或 mock 取代快取生命週期。
- 每個任務的交付摘要必須列出：異動檔案、執行過的命令及結果、未完成的發布／真機閘門。Codex 雲端完成不等於 production 已發布。

## 5. 執行階段

### Phase 0 — 建立可重現的基準

- [x] 將現有 24 支 `tests/*.mjs` 納入固定版本的測試環境；補上 package／lockfile、`AGENTS.md`、setup script 與跨平台 server 啟動入口，保留既有 `YAKYOLIFE_URL` 與預設 `http://127.0.0.1:8124/`。
- [x] 提供固定且非互動的命令：`npm run serve`、`npm run test:static`、`npm run test:unit`、`npm run test:regression`（現有 Chromium 測試）、`npm run test:e2e`（Chromium／WebKit）、`npm run test:pwa`（Phase 1 加入）、`npm run check`；CI 與 Codex cloud 必須呼叫相同腳本。
- [x] 以 v2.0.11 建立 versioned fixture，記錄規則版本、seed、`P/C/IF/OF/TW`、明確姓名／背號、每次事件選擇與配點／復原序列，以及年份、球隊、能力、投打統計、薪資、榮譽、結局 digest。固定輸入以避開預設姓名使用 `Math.random()` 的差異；視覺骰子動畫不納入遊戲 RNG 比較。
- [x] `tools/build-headless.mjs` 可供大量模擬，但它用文字掛鉤取代 `choose()`／`allocUI()`，也略過部分 UI；先核對同一輸入在真實瀏覽器與 headless 的結果。`tools/sim-twoway.mjs` 的自動選擇策略也可能消耗遊戲 RNG，fixture 回放須改用已記錄的輸入，不直接套用校準策略。掛鉤隨流程重構同步更新，不得把 headless 模擬當成離線／配點 UI 驗收。
- [x] 最小 WebKit smoke test 由 `http://127.0.0.1` 啟動遊戲、完成第一個穩定互動並檢查 console/page error；禁止以 `file://` 當作 PWA 基準。
- [x] 核對此 repository 的 Pages 實際網址；若已綁定則保留 `https://www.yakyolife.com/`，否則依部署契約使用 project site 並同步各網址設定。記錄根目錄及子路徑入口，在 Phase 1 驗證 `?seed=...` 可離線導向同一 app shell。seed 只代表重玩輸入，不是存檔或選擇紀錄。
- [x] 在 repo 文件中記錄預期的 GitHub Pages 發布 branch／workflow、custom domain、DNS 與 HTTPS 強制轉址；實際後台狀態由維護者確認。
- [ ] 維護者在 Safari responsive mode 與至少一台實機記錄現有問題，附上 iOS／裝置／顯示模式，避免只憑模擬器改版。

Codex 雲端完成條件：全新 checkout 可由 setup script 建好環境，既有 Chromium 回歸與 WebKit smoke 通過，v2.0.11 fixture 已涵蓋五種開局與二刀流轉換路線，`npm run check` 有實際斷言且通過。發布／真機閘門：維護者確認 Pages／DNS 設定與 iPhone 基準紀錄。

### Phase 1 — 正式 PWA 與遠端發布

實作與驗證紀錄見 [`docs/phase1-pwa.md`](docs/phase1-pwa.md)。程式碼／自動化完成；正式發布與 iPhone 閘門尚未完成。

異動：`index.html`、`src/main.js`、`src/config.js`、既有 `.github/workflows/pages.yml`；新增 `manifest.webmanifest`、`sw.js`、`src/pwa.js`、發布資源清單產生器與本機圖示資產。

- [x] 把 Blob manifest 移成靜態 `manifest.webmanifest`，以部署目錄為基準設定穩定 `id`、相對 `start_url`／`scope`、192／512 圖示、名稱、主題色及 `display: standalone`。180 圖示保留為 Apple touch icon；maskable 必須確認裁切安全區，不能只宣告用途。
- [x] 在 `index.html` 直接連結 manifest，保留 Apple touch icon 與 standalone meta。
- [x] 新增 Service Worker 註冊模組，URL 固定為部署目錄下的 `sw.js`；註冊失敗降級成一般網頁並顯示離線尚未就緒。只有必要資源全數驗證、worker 啟用且頁面由同版本控制後才顯示「可離線使用」，不以首頁出現或 `ready` 單一事件作判準。
- [x] 由發布 artifact 產生完整 precache 清單：HTML、CSS、靜態／動態 import 的 JS、manifest、圖示、字型、logo／wordmark 等 CSS／DOM 引用資產。保留完整 query 與相對路徑，從清單檢查缺檔、MIME、大小及內容雜湊。
- [x] 將必要的 Phosphor CSS 與實際引用字型自託管並保留授權；也可沿用現有圖示設計轉成本機 SVG。Google Fonts 可用系統字型降級，圖示不可變空白。保留結算圖 `ensureFonts()` 現有 2.5 秒逾時／fallback，驗證離線不阻塞產圖。
- [x] 受控導覽固定回傳 active worker 的完整 shell；只對 app 根目錄／`index.html` 導覽映射到該 shell，保留瀏覽器的 `?seed=`。JS／CSS 缺檔不得回 HTML，也不得全域 `ignoreSearch` 抹掉版本鍵。這裡取代原計畫的 HTML network-first，避免 waiting 期間先載入新版入口。
- [x] cache 名稱含專案／scope 前綴及唯一 `buildId`；`APP_VER`、資源 build ID、存檔 `schemaVersion` 與 `rulesVersion` 分開管理。同 APP_VER 的修補或回退也要有可辨識的資源版本。
- [x] `?v=` 只是請求鍵，不保證靜態主機保留舊內容。安裝時以發布清單的雜湊驗證每份回應，全部成功才允許新 worker 進入待用狀態；失敗刪除該次不完整 cache、保留現役版本並允許重試。同一 active cache 不可被背景更新覆寫成新版本 bytes。
- [x] 版本 token 由單一來源產生，或以 CI 驗證明確映射：目前允許入口 `2.0.11-ui-complete` → 核心 `2.0.11`。涵蓋 HTML、所有 import、測試中動態 import 與 precache；避免同一 state／RNG module 因不同 URL 被載入為兩份實例。
- [x] 新 worker 完整安裝後顯示「新版本可用」，由玩家選擇更新。Phase 3 前，進行中的生涯延後至首頁／結束後更新；Phase 3 後須先完成 checkpoint transaction 與存檔相容性檢查。不得在 install 無條件 `skipWaiting()`／強制 reload。
- [x] 啟用更新前協調同一 registration 的所有開啟頁面；仍有未存操作或無法確認狀態的 client 就延後，成功後各頁只 reload 一次。確認舊 client 已退出才清理不再需要的專案 cache，不碰 IndexedDB／其他站點 cache。首次安裝也不得把已在玩的未受控頁面直接切換版本。
- [x] 延伸既有 Pages workflow：產出一次 `_site`、對該 artifact 跑資源檢查與 PWA 測試，再部署同一份。使用 runtime 檔案白名單（含 `CNAME`、manifest、worker、本機字型），避免現有整個 repo 複製方式把 `tools/`、計畫、測試工具或 setup script 一起上線。

上述更新策略採整份版本切換；`skipWaiting()` 可能讓新 worker 控制仍載有舊程式的頁面，因此須另測多分頁與中斷更新。[Service Worker 生命週期](https://web.dev/articles/service-worker-lifecycle)

Codex 雲端完成條件：Chromium 以真實 server 切換 A／B artifact，驗證初裝、同 seed 導覽、完整預快取、斷網冷啟動至引退、更新延後、下載失敗、多頁面切換與 cache 清理；WebKit 驗證正常網頁與註冊失敗降級。冷啟動使用保留 profile 的瀏覽器重啟並停掉 server，不能只測仍在記憶體中的分頁。發布／真機閘門：Safari 與 standalone 各自連線至「可離線使用」後，飛航模式關閉重開仍能開新局、完成生涯與產圖；更新不混用新舊 JS。此階段尚不承諾中斷生涯可續玩。

### Phase 2 — iPhone 介面與操作強化

預計異動：`index.html`、`css/style.css`、`src/main.js`、`src/ui/dom.js`、`src/ui/alloc.js`、`src/ui/share-image.js`。

- [ ] 驗證 375、390、430 CSS px 直向，以及常見橫向尺寸；任何畫面不得出現整頁水平捲動。
- [ ] 檢查首頁、記分板、詳情面板、`#act-side`／`#act`、`#alloc-full`、所有 modal、底部選項與引退結算的 safe area；沿用現有 DOM ID 與事件綁定，不重做 v2 UI。
- [ ] 覆蓋四主題 × 標準／大字 × 手機／桌面偏好在窄螢幕下的必要操作；二刀流八項配點、投打雙表與長合約金額也須可讀，切換偏好時不能遺失配點進度。
- [ ] 所有主要觸控目標至少 44 × 44 CSS px；相鄰選項保留足夠間隔，連點不應誤觸隔壁按鈕。
- [ ] 修正結算分享 sheet 的已知檢查點：手機全螢幕的 `.sh-head/.sh-foot` 補足 safe area，`.sh-x` 目前 32 × 32，擴大點擊範圍至上述標準。
- [ ] 輸入框維持至少 16px，避免 iOS 聚焦時自動放大；鍵盤出現後姓名、背號與開始按鈕仍可捲到可見區。
- [ ] 檢查 `100vh`／`100dvh`、Safari 上下工具列展開收合及橫向旋轉時的 sticky 區塊高度。
- [ ] viewport 已解除縮放限制；處理 `src/main.js` 尚存的全域 gesture 攔截與快速 touchend 合成 click。優先只在需要的遊戲控制上抑制誤觸，保留一般文字縮放，驗證快速配點不會重複提交。
- [ ] 沿用現有 `prefers-reduced-motion` CSS，再驗證骰子動畫、鍵盤焦點與 VoiceOver 按鈕名稱；展開元件同步維護 `aria-expanded`。
- [ ] 三種結算圖 `stats/salary/ending` 在四主題與離線字型 fallback 下皆可產生。實機測試 Web Share、下載及長按儲存；不支援分享或實際分享失敗才提供備援，使用者取消（`AbortError`）保留現有直接返回行為，不自動下載。

Codex 雲端完成條件：Playwright WebKit 以目標 viewport 覆蓋主要流程，沒有水平 overflow、自動 accessibility 違規或必要按鈕不可見；分享失敗有備援、取消不觸發額外動作，`npm run check` 通過。發布／真機閘門：目標尺寸直向／橫向都能完成整輪主要操作；Home Indicator、瀏海、鍵盤及 Safari 工具列不遮住必要按鈕；VoiceOver 能辨識開始、選項、選單與分享操作。

### Phase 3 — 可恢復的本機生涯存檔

這是最大重構範圍，不能只替 `S` 加上 `JSON.stringify()`。預計異動：`src/core/state.js`、`rng.js`、`src/flow/*`、有互動 continuation 的 `src/engine/*`、`src/ui/dom.js`、`alloc.js`、`timeline.js`、`retire.js`、`share-image.js`、`src/main.js`；新增 `src/core/save.js` 與流程／歷史 model（檔名由實作決定）。

#### 3a — 流程與版本化資料

- [ ] 定義存檔 envelope，例如 `{schemaVersion, rulesVersion, appVersion, buildId, savedAt, saveId, revision, seed, rngState, gameState, flow, pendingAction, allocation, history, retirement}`。區分持久資料、可推導值、暫時 DOM／動畫；序列化檢查須涵蓋動態新增欄位，不能只抄 `newState()` 的初始鍵。
- [ ] `S.teamName` 不寫入存檔，恢復後由不抽 RNG 的共用函式掛回；恢復不呼叫 `newState()`、`seedInit()`、`startYear()` 重走已完成流程。缺省欄位由純資料 migration 補齊。
- [ ] 為 `src/core/rng.js` 增加讀取／恢復 `_s` 的介面與演算法識別。restore 保留 `SEED` 及游標，載入／重畫不耗用遊戲 RNG；維持 v2.0.11 原本抽數順序。
- [ ] 把 `stepQ: Function[]` 及巢狀 continuation 改成 `{handlerId, payload}` 的資料佇列；每個等待點保存 phase、子步驟、已抽取結果、報價／候選與尚未執行的後續流程。只存季前／季中／季末三種 ID 不夠。
- [ ] 選項改成 action descriptor，包含事件實例 ID、合法選項 ID、payload 與 expected revision；handler registry 僅能執行已知 action。盤點事件、戀愛、選秀、傷病、國際賽、升降級、談約、旅外、引退與二刀流轉入／收斂的所有待選點；恢復時不得重抽候選或報價。
- [ ] 建立 v2.0.11 狀態覆蓋表：至少包含 `twOrigin/twDeclined/twSeasons/twAuditLv/twFell/twFellAge/twFellLv`、`lastLv/lastSt/honors`、`rehabPitchOnly/pitchOut`、`ab/pot/carry`、`samePick/samePickKey/comboKey/removed`、合約、戀愛及各聯盟歷史；轉單刀後不可刪另一側能力／歷史。
- [ ] 保留累積 `stats` 的 `GP/pH/pBB/pHR/yrP/yrB`、打擊欄位及 `intlLog`；`S.log` 職業年表列使用 `lv/p/role`，並保留 `st/inj/line`。單季 `lastSt`／`log[].st` 的純投手仍用 `G/H/BB`，二刀流逐季才另有 `GP/pH/pBB`，不能與累積統計一律補零成同形；缺欄位與零各有意義，全年傷缺紀錄也必須保存。
- [ ] 以現有 `twoway_audit_grace.mjs`、`converted_ability_targets.mjs`、`career_totals_two_sides.mjs`、`twoway_phase*.mjs` 等測試為護欄；重構後仍保留升級緩衝、上一季成績／同側頭銜豁免、特質移除與雙側統計。歷史設計文件不能覆蓋 v2.0.11 程式與測試的實際規則。

#### 3b — 配點、歷史與結算恢復

- [ ] 將 `allocUI()` closure 的 `dice/pool/idx/hist/touchedKeys`、label、合法能力鍵與 `done` continuation 搬到資料 model，`ALLOC` 只做 view。每次加點／復原／確認都是可提交 action，保存能力、carry 與配點 model；恢復不重新擲骰、不重加點，仍能復原且確認只執行一次。
- [ ] 保存事件卡、年度分界與時間軸資料；`TL` 去掉 `el` 改用穩定 ID，載入後重建 DOM 參照。`S.log` 不足以還原戀愛、抽卡與傷病敘事，需獨立 history model；重畫不得執行遊戲 handler。
- [ ] 把 `endGame()` 拆成一次性的結算資料產生與純 render。保存名人堂判定、`hofInfo`、榮譽／特質、球迷留言、結局及分享參數；重開已引退生涯、重畫 UI、重產結算圖均不得再次抽 RNG／發獎或改薪資。
- [ ] 先在無 IndexedDB 的序列化 round-trip 測試中證明：任一待選／配點／引退畫面可以資料重建，後續選擇與 RNG digest 和不中斷完全相同，再接儲存層。

#### 3c — IndexedDB、相容性與恢復 UI

- [ ] 每次操作執行至下一待選點後，以同一 IndexedDB transaction 寫入完整 envelope，包含 gameState、RNG、flow、pendingAction、allocation、history、retirement 與 revision；transaction 完成後才顯示「已儲存」並開放下一個操作。抽數結果與對應待選狀態一起提交，不能只存 state 而漏掉佇列；首次開局也須提交初始 checkpoint。
- [ ] 使用 saveId／revision 做重複 action 防護與多分頁寫入衝突檢查；同一生涯只允許一個寫入者，舊頁面不可覆蓋新進度。關頁事件只作補強，不能依賴 `beforeunload`／背景執行保證最後寫入；突然終止時回到最後完整 transaction。
- [ ] 首頁加入「繼續生涯」「開始新生涯」「匯出存檔」「匯入存檔」；重玩／新 seed 的現有按鈕接入存檔生命週期，覆蓋或刪除前確認。匯入先驗證格式、大小、數值、action ID 與版本，成功後才原子替換；輸入文字安全呈現，不執行檔內函式／任意 HTML。
- [ ] schema 與規則相容性分開檢查：同規則版本的讀寫必須保持 deterministic；升級規則時需要明列相容／遷移政策及 fixture，不能因 JSON 可讀就宣稱續玩結果相同。v2.0.11 尚無持久生涯可遷移，第一版不承諾找回更新前已丟失的記憶體進度。
- [ ] migration 在副本驗證成功後才提交，保留遷移前備份。新版 schema／未知 rulesVersion 在舊程式中須保留原檔、允許匯出並提示使用相容版本，不得重設為新生涯；處理 IDB `versionchange`／blocked，避免舊分頁阻塞升級。
- [ ] 壞檔、transaction 失敗、容量不足、private mode／儲存拒絕時明確提示未保存，保留上一份有效存檔，提供重試、匯出或由玩家選擇暫以記憶體繼續的出口。記憶體模式維持「未儲存」、延後版本切換，不永久鎖住遊戲或虛報成功。對 `navigator.storage.persist()`／`persisted()`／`estimate()` 做能力偵測，拒絕或不支援都不得阻止一般遊玩。

Codex 雲端完成條件：unit、Chromium／WebKit IndexedDB 測試涵蓋各待選點、配點中途／復原、引退、重複恢復、multi-tab revision 衝突、migration、未知版本、壞檔、儲存拒絕與匯出／匯入；Chromium 再覆蓋完全離線續玩。連續與恢復兩路的 RNG、投打統計、薪資、榮譽、結局一致，`npm run check` 通過。發布／真機閘門：Safari 與 standalone 在已儲存的事件、配點中途與引退畫面強制關閉再開，可回到同一狀態；無重擲、重複發獎或跳過事件。

### Phase 4 — 擴充自動化驗證與發布護欄

預計擴充：Phase 0 統一的 `package.json`、既有 `tests/`、fixture 與 CI；runtime 仍維持靜態檔案。

- [ ] 用 Playwright Chromium／WebKit 覆蓋：`P/C/IF/OF/TW` 至少各一條路徑、標題七連點二刀流入口、高中天才轉入、留投／留打與持續二刀流、選項、配點／復原、詳情、重新開始、結算分享 fallback。
- [ ] 加入固定 seed regression test，驗證核心模擬結果未因 UI／PWA 重構改變。
- [ ] 加入存檔 round-trip、舊 schema migration、壞檔與 RNG continuity 測試。
- [ ] 以 `twoway_audit_grace.mjs`、`twoway_year_table_gaps.mjs`、`career_totals_two_sides.mjs`、`retirement_ending.mjs` 等案例擴充恢復測試：升級緩衝、上季頭銜豁免、TJ 停投不停打、全年報銷與引退重開皆維持資料和結果。
- [ ] 驗證 manifest 每個圖示可取得、Service Worker precache 不缺檔、所有 ES module import 回傳正確 MIME type。
- [ ] Chromium PWA 使用實際 A／B server artifact 測試安裝下載中斷、同 APP_VER 不同 build、跨版更新、回退、存檔不相容、多分頁及根目錄／子路徑；同 profile 關閉重開後斷網，跑未曾在線上玩過的分支，排除只靠 HTTP cache 偶然成功。
- [ ] CI 做基本 accessibility 與窄螢幕 overflow 檢查。
- [ ] 發布候選版記錄實際支援的最低 iOS 版本，至少在最低支援版與當時最新穩定版各做 Safari／加入主畫面真機測試；版本相同則增加另一代表裝置。Playwright WebKit 自動化不能取代 iOS PWA 實機。

Codex 雲端完成條件：PR workflow 與本機 `npm run check` 使用同一組命令，所有自動檢查通過且能保留失敗 artifact。發布／真機閘門：保護規則要求 CI 成功，真機 checklist 有版本、裝置、測試者與結果紀錄。

### Phase 5 — 文件、監控與回復方案

- [ ] `README.md` 保留正式網址，補上 iPhone「加入主畫面」、各環境首次連線至「可離線使用」、支援範圍、備份／匯入與儲存被清除後的處理。
- [ ] 新增簡短的發布 checklist：調版號、跑測試、部署、驗證 custom domain、驗證更新提示與離線啟動。
- [ ] 以不收集玩家姓名／存檔內容為原則，只監控首頁與靜態資源可用性；若加入分析工具，需先寫隱私說明與 opt-out。
- [ ] 每版保留可重新部署的 artifact／tag、資源雜湊及 schema／rules 相容表。回退視為一次受控版本切換，不能只改 HTML；舊 shell 不一定能讀新 schema，遇到不支援的存檔保留原資料與匯出入口，等待相容修復版，禁止破壞性降版或覆蓋。
- [ ] 在 UI 顯示版本與可複製的診斷資訊，方便回報 iOS 版本、standalone 狀態、app 版本與存檔 schema，不包含個資。

完成條件：非開發者能依文件安裝、更新、備份與恢復；維護者能回退程式且保留玩家存檔。不能讀取的版本必須清楚說明限制，不能承諾任意跨版立即續玩。

## 6. 驗收矩陣

| 情境 | Safari 分頁 | 加入主畫面 | 離線 | 驗收重點 |
| --- | --- | --- | --- | --- |
| 首次開啟 | 是 | 不適用 | 否 | HTTPS、資源完整、無 console error |
| 安裝／啟動 | 是 | 是 | 否 | 圖示、名稱、standalone、safe area 正確 |
| 再次啟動 | 是 | 是 | 是 | 該環境已顯示可離線使用；關閉重開仍有完整 shell、可辨識圖示與字型 fallback |
| 離線完整生涯 | 是 | 是 | 是 | 含未在線上玩過的二刀流分支，可玩到引退並產生結算圖 |
| 生涯中斷恢復 | 是 | 是 | 是 | 同一已提交 checkpoint，包含半完成配點／復原；沒有重擲或重複事件 |
| 版本更新 | 是 | 是 | 下載需連線 | 完整新版本與相容存檔就緒、多頁面安全後才切換；下載中斷保留舊版 |
| 回退／未知存檔版本 | 是 | 是 | 是 | 保留原檔，可匯出；只在相容時續玩 |
| 結算產圖／分享 | 是 | 是 | 產圖可離線 | 本機產圖、Share Sheet／下載備援；外部分享是否成功依目的地連線能力 |
| 分頁轉主畫面 | 是 | 是 | 先各自連線準備 | 不假設共用存檔，匯出／匯入後同生涯可續玩 |
| 儲存拒絕／被清除 | 是 | 是 | 視資源是否仍在 | 不虛報保存；提示備份、重新下載或匯入 |
| 旋轉與鍵盤 | 是 | 是 | 任意 | 必要操作不被工具列、鍵盤或 safe area 遮住 |

## 7. 建議交付順序

1. PR 0：沿用現有 Chromium 回歸與 Pages CI，固定依賴、`AGENTS.md`、WebKit smoke、v2.0.11 fixture 與一致的 `npm run check`。
2. PR 1：本機圖示依賴、靜態 manifest、Service Worker、資源清單／build ID、離線與更新 UI，測試後部署同一 artifact。
3. PR 2：iPhone 尺寸、safe area、鍵盤、觸控、縮放與分享 fallback；真機修正依 checklist 回饋追加小 PR。
4. PR 3a：可序列化 phase／action／continuation、RNG state API、完整二刀流狀態與 deterministic regression，不先接 IndexedDB。
5. PR 3b：配點／復原、卡片／時間軸、一次性結算 model 與完整 checkpoint round-trip。
6. PR 3c：IndexedDB transaction、schema／rules 相容性、匯出／匯入與恢復 UI；補上儲存後安全更新。
7. PR 4：擴充 Chromium PWA、Chromium／WebKit E2E、accessibility／overflow、CI、文件與發布／真機 checklist。

Phase 0 是後續重構前提；Phase 1／2 與 Phase 3 可在共用基準上分開開發，合併時仍須跑完整回歸。Phase 1 通過真機閘門後可稱「可安裝、可離線開新局」；Phase 3 與最終驗收全部完成後才稱「可可靠續玩的 mobile 離線版」。若未來需要原生 App 上架或跨裝置同步，再另立提案。

## 8. 最終 Definition of Done

- [ ] `[Codex cloud]` 全新 checkout 能依 `AGENTS.md` 與 `scripts/codex-setup.sh` 建置測試環境，無需開發者電腦上的隱含 global dependency。
- [ ] `[Codex cloud]` `npm run check` 一次完成 static、unit、既有 Chromium regression、Chromium／WebKit E2E、Chromium PWA、存檔與 v2.0.11 deterministic 檢查。
- [ ] `[Codex cloud]` 更新、回退與壞存檔均有安全且可理解的處理；測試不依賴 production credential 或未宣告外網。
- [ ] `[Release/manual]` iPhone 不連開發電腦即可由正式 HTTPS 網址開始遊戲，並可加入主畫面以 standalone 模式啟動。
- [ ] `[Release/manual]` Safari 與 standalone 各自完成首次連線準備後，可斷網冷啟動、開新生涯／續玩至引退，圖示完整且結算圖可產生。
- [ ] `[Release/manual]` 已提交 checkpoint 在強制關閉後可恢復，涵蓋事件、配點／復原、二刀流轉換與引退；同規則版本 deterministic 結果不變。
- [ ] `[Release/manual]` 更新不丟未存進度、不混用資源；儲存清除、未知版本與回退限制有可操作的備份／匯入說明。
- [ ] `[Release/manual]` 目標直向／橫向尺寸無阻斷操作的 overflow 或遮擋。
- [ ] `[Release/manual]` 真機驗收、安裝文件、Pages／DNS 驗證及發布／回退文件齊全。
