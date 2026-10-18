# YaKyoLife iOS Web App 與長時間離線遊玩計畫

核對日期：2026-10-18。本次程式基準：`dea1195`；`src/config.js` 的 `APP_VER` 與 `RULES_VERSION` 均為 `v2.0.11`。本次只更新計畫，未實作新功能或重跑既有瀏覽器測試；已完成項目依現有程式與 Phase 0／1 紀錄標示。

**目標：iPhone 加入主畫面後，完成一次連線準備，即可跨日離線開新局、存檔、關閉後續玩與完成生涯。** Phase 0／1 已有完整資源快取、離線冷啟動與安全更新；目前生涯仍只在記憶體，iOS 回收 App 後會失去進度。後續優先完成可恢復存檔、iOS 安裝引導與長期驗收，再宣稱支援長時間離線遊玩。實際發布與真機閘門尚待確認。

## 1. 目標與前提

本計畫以 iPhone Safari／加入主畫面為主要驗收環境，mobile App 採 PWA，定義為：

- 遊戲部署在公開的 HTTPS 網址，iPhone 不需要連接開發用電腦即可開啟。
- 玩家可用 Safari 遊玩，也可透過「加入主畫面」以接近 App 的獨立視窗啟動。
- 首次連線完成必要資源下載、Service Worker 啟用並顯示「可離線遊玩」後，可離線冷啟動與開新生涯；Phase 3 完成且顯示生涯「已儲存」後，才具備中斷續玩的條件，並能續玩至引退與產生結算圖。
- iOS 回收分頁或玩家關閉 App 後，能恢復到最後一個已完成寫入的操作；包含尚未選擇的事件與分配到一半的能力點數。
- 直向與橫向操作皆不遮住選項，瀏海、Dynamic Island、Home Indicator 與軟體鍵盤不會蓋住內容。

這裡採用「遠端託管、在 iPhone 瀏覽器內執行」的 PWA 架構。現有遊戲是純前端模擬，不需要為了遠端開啟而新增後端。若需求其實是「遊戲邏輯必須在伺服器執行」或「iPhone、電腦共用同一份雲端存檔」，需另立後端、登入、資料庫與同步規格；不納入第一版。

離線承諾有明確前提：首次安裝與版本下載需要網路；外部贊助／社群連結與把內容傳到分享目的地仍可能需要網路。本機儲存被使用者清除或被系統回收後，需要重新下載，生涯只能由先前匯出的備份救回，不能承諾永久保存。持久儲存請求只是降低回收風險的措施。[WebKit 儲存政策](https://webkit.org/blog/14403/updates-to-storage-policy/)

Safari 分頁與主畫面 App 必須各自完成首次連線準備，不假設 Cache Storage／IndexedDB 自動共用；既有 Safari 生涯移往主畫面版以 JSON 匯出／匯入處理。[WebKit Web Apps 資料隔離說明](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/)

### 長時間離線的可驗收定義

以下時長是本專案的驗收目標，不是已完成結果，也不是作業系統提供的保留保證。主要交付環境為一般模式下的 iOS 主畫面 Web App；Safari 分頁仍測離線與續玩，但不將閒置保留結果直接等同主畫面版。

| 情境 | 驗收目標 | 通過條件 |
| --- | --- | --- |
| 單次長時間遊玩 | 飛航模式連續操作至少 2 小時，含多次完整生涯與結算產圖 | 無阻斷錯誤、無持續累積的舊生涯 DOM／事件監聽／圖片資源；每個已儲存操作可恢復 |
| 跨日持續使用 | 連續 30 天不連線，每日啟動與操作；第 1、7、30 天留驗收紀錄 | 關閉、鎖屏、切背景與裝置重啟後仍可冷啟動、讀檔及續玩，不要求定期連網 |
| 長期閒置 | 獨立測試組分別 7 天、30 天完全不開 App，再離線冷啟動 | 同一安裝的資源及 checkpoint 可讀，接續結果與不中斷路徑一致；7 天組的啟動不得重設 30 天組的閒置期間 |
| 本機備份復原 | 離線匯出 JSON 到「我的 iPhone」等確定已落地的位置，再離線匯入 | 在已有完整離線資源的安裝中恢復同一生涯；不可把尚未下載的 iCloud 檔案當作離線備份 |

- 不為資源快取或生涯存檔設定依日期失效的 TTL，不因超過 7／30 天、更新檢查失敗或版本落後而封鎖既有版本遊玩。`savedAt` 僅作顯示／診斷，不能用來丟棄存檔。
- 不以常駐分頁、背景計時器、定期喚醒 Service Worker、推播或 Background Sync 維持可用性；背景期間允許完全停機，正確性依賴已提交資料與完整快取。
- WebKit 對 Safari 未互動網站的七天政策與主畫面 Web App 的使用計數不同，不能寫成「所有 iOS PWA 七天一定刪除」或「加到主畫面就永久保留」。主畫面版仍須測儲存壓力與資料遺失的處理。[WebKit 七天政策與主畫面說明](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)
- 真實 7／30 天保留必須經過實際時間；修改 `Date.now()` 或系統日期只能檢查應用程式沒有日期到期邏輯，不能證明 iOS 不會回收。未跑完的長期測試維持未勾選，發布說明只列已通過範圍。

## 2. 目前狀態與待補缺口

### 已完成、應沿用的基礎

| 範圍 | 目前程式事實 | 後續工作 |
| --- | --- | --- |
| 安裝外觀 | `manifest.webmanifest` 已有相對 `id/start_url/scope` 與 `display: standalone`；`index.html` 已有 Apple meta、180 touch icon 及 viewport fit | 補安裝引導、獨立視窗辨識與真機驗收 |
| 離線資源 | `sw.js`、`src/pwa.js` 已驗證完整資源及 build ID，支援多頁面協調更新；`scripts/build-site.mjs` 產生 `_site` | 補損壞資源修復與長期離線驗收，沿用現有協定 |
| 本機依賴 | Phosphor CSS／WOFF2 已在 `assets/phosphor/`，文字採系統字型；核心遊戲不需要外部 API／CDN | 新增的安裝說明、存檔 UI、備份功能也須可完全離線使用 |
| 手機介面 | `css/style.css`、`src/ui/prefs.js` 已有四主題、大字、`100dvh`、safe area 與 sticky 操作區 | 補鍵盤、旋轉、觸控、縮放及分享的真機檢查 |
| 測試環境 | Node 22.16.0、Playwright 1.56.1、lockfile、`AGENTS.md` 與統一 npm 指令已落地 | 增加存檔與耐久情境，保留既有 fixture |
| PWA 自動化 | `tests/pwa/lifecycle.mjs` 已在清 HTTP cache、關閉 persistent Chromium、停止 server 後，重開相同 profile 跑 TW／轉入生涯並產圖 | 尚未測中斷續玩、iPhone standalone 或真實跨日保留 |
| 發布 | `.github/workflows/pages.yml` 執行 `npm run check`，部署同一份 `_site`；README／canonical／`OFFICIAL_URL` 指向 `https://ishengfang.github.io/yakyulife/` | 確認 Pages 後台與實際發布結果；`CNAME` 不代表此 fork 已綁定原作者網域 |

### v2.0.11 存檔重構的約束

| 程式事實 | 實作要求 |
| --- | --- |
| `index.html` 的 CSS／main 入口為 `?v=2.0.11-ui-complete`，module import 為 `?v=2.0.11` | 版本檢查需定義入口 token 與核心版本的映射；預快取須保留完整 URL，不能要求所有 query 字串完全相同 |
| 發布產物會為資源附加 build query，原始碼 `src/pwa-build.js` 的 `BUILD_ID=null` | 必須以 `_site` 驗收 PWA；直接 serve 原始碼不會註冊 worker |
| `src/flow/phases.js` 新增／擴充二刀流轉入、升級緩衝與成績／頭銜豁免 | 存檔須保留兩側歷史及判定欄位，回歸範圍由 `P/C/IF/OF` 擴為含 `TW` 與轉職路線 |
| `src/core/state.js` 已拆開投／打累積欄位與球季數 | 不可用舊版單刀格式重建或只按目前 `S.pos` 篩掉另一側資料 |
| UI 與結算圖已支援多主題、大小字及多種輸出模式 | 離線字型降級與恢復後也須可排版、產圖；沿用現有 UI，無須重新設計 |

### 目前仍未實作的缺口

- 遊戲中的 `S`、RNG 私有游標 `_s` 與流程佇列只存在記憶體；localStorage 目前保存偏好與玩家輸入，不是生涯存檔。
- `stepQ` 存函式，`choose()`、配點 `done`、合約／受傷等延續流程均使用 closure；`ALLOC`、`TL[].el` 混有 DOM 參照，不能直接 JSON 序列化。
- `S.log` 是球季紀錄，不是完整事件卡歷史；`endGame()` 同時結算、抽取隨機結局與建立分享 callback，恢復時重跑會改變結果。
- 尚無 IndexedDB 存檔、儲存持久性請求、匯出／匯入及恢復入口；`beforeunload` 提示與 `visibilitychange` 的快取檢查都不會保存生涯。
- 尚無 iOS 安裝流程 UI、長期離線紀錄與耐久測試；「可離線遊玩」目前只代表資源就緒，`index.html` 仍明示關閉／重新整理會失去生涯。

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
| 根目錄部署（僅於實際設定自訂網域後採用） | `/` | `/sw.js` |
| 此 fork 文件指定的 project site：`https://ishengfang.github.io/yakyulife/` | `/yakyulife/` | `/yakyulife/sw.js` |

- [x] `sw.js` 與 `index.html` 同放發布目錄根層，scope 限於該 App base；manifest、資源與註冊 URL 依相同 base 解析。不能把 worker 放在 `src/` 再要求控制整站，也不以額外的 `Service-Worker-Allowed` 回應標頭作部署前提。[Service Worker 註冊與 scope](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register)
- [ ] Pages 的 Source 設為 GitHub Actions，確認部署工作成功及正式網址的 HTTPS。若採自訂網域，須在此 repository 的 Pages 後台設定並有正確 DNS／憑證；Actions 發布時，GitHub 不用 `CNAME` 檔案決定網域。現有 workflow 已正確註明此限制。[GitHub 自訂網域設定](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [ ] 確認實際部署 origin 與已同步的 project site URL 一致。若日後換網域或 App base，須視為不同安裝範圍，先提供備份及重新準備指引；不能假設舊 Cache Storage／IndexedDB 自動搬移。根目錄與子路徑測試均保留。
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
- [x] Phase 0 已新增 package／lockfile、`AGENTS.md`、setup script 與 smoke test；後續任務沿用，不重建另一套入口。雲端環境的 setup／maintenance 設定仍需依實際任務確認。
- [x] Node 固定 22.16.0，Playwright 固定 1.56.1；以 lockfile 與 `npm ci` 安裝，不依賴 global package。
- [x] `scripts/codex-setup.sh` 已負責可重跑安裝與 Chromium／WebKit；預設使用 Playwright 管理的 browser binary，`CHROME_PATH` 僅作明確覆寫。lockfile 或 setup script 改變後須重建環境 cache。
- [ ] bootstrap 或升級依賴的任務若需在 agent 階段下載新套件，只暫時開放最小必要的 npm 與 Playwright 下載網域；lockfile 落地後的一般實作與測試應可在 agent 無網路下完成。
- [ ] 不把 production credential、DNS token 或個人 GitHub token 當作測試前提。Codex 修改既有 Pages workflow；部署由合併後的 GitHub Actions 權限執行。需要在 agent 階段使用的非敏感設定放 environment variables；不得假設 setup-only secret 在 agent 階段仍存在。
- [x] `AGENTS.md` 已明列 setup、serve、static、unit、E2E、PWA 與 `npm run check`，後續任務沿用。

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

### Phase 1b — 長期離線的資源保護與修復

沿用 Phase 1 的整版快取與多頁面協定，預計異動 `sw.js`、`src/pwa.js`、`tests/pwa/lifecycle.mjs`。

- [ ] 現役完整快取不因時間、離線、更新伺服器無回應或候選版失敗而刪除；不把「連線中」當作資源就緒。所有必要遊戲分支與新增存檔 UI 都納入發布清單，禁止離線時才下載遊戲必需資料。
- [ ] 回前景／離線檢查發現缺檔時撤銷資源就緒狀態，但保留可用的當前畫面與生涯，提供先匯出備份及連線修復的入口，不自動 reload 或清除整個 origin。
- [ ] 修復先下載並驗證候選資源；只有雜湊吻合才接受相同 build 的內容。舊資源已無法從主機取得時，改走完整新版本及存檔相容性檢查，不能把新 bytes 填進舊 build。修復失敗保留原存檔與仍可用的 cache。
- [ ] Cache Storage／IndexedDB 個別或一起遺失都設測試。若 shell、worker 也被清除，離線時無法保證顯示修復 UI，須在安裝與備份文件說明必須先重新連線下載；沒有外部備份就不能找回已刪除生涯。

完成條件：真實 server 故障、缺失 cache entry、修復失敗及安全切換均有測試；既有離線生涯、更新協調與不混版測試持續通過。

### Phase 2 — iOS 安裝引導、介面與操作強化

預計異動：`index.html`、`css/style.css`、`src/main.js`、`src/pwa.js`、`src/ui/dom.js`、`src/ui/alloc.js`、`src/ui/share-image.js`；視需要新增安裝說明模組。

- [ ] 首頁提供可關閉、可再次開啟的 iPhone 安裝說明：Safari 分享選單 →「加入主畫面」→ 若有「作為 Web App 打開」選項則開啟 → 從新圖示啟動。引導圖文隨 App 本機化，不依賴遠端教學；內嵌瀏覽器提供改用 Safari 的指引。[Apple iPhone Web App 安裝說明](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios)
- [ ] 使用 `matchMedia('(display-mode: standalone)')` 與 `navigator.standalone` 辨識目前執行模式；主畫面啟動後不重複顯示安裝提示。iOS 不以 `beforeinstallprompt` 或程式自動安裝作必要前提，實際是否完成安裝以從圖示啟動驗收。
- [ ] 安裝引導串起「加入主畫面 → 在主畫面 App 保持連線直到資源就緒 → 開局且確認已儲存 → 匯出備份 → 飛航模式關閉重開」。Phase 3 未完成前維持現有無存檔提醒，不提前顯示可續玩承諾。
- [ ] 保留目前相對 manifest 與 Apple 圖示設定；在最低支援版及最新穩定版確認名稱、圖示、standalone 啟動與子路徑，最低 iOS 支援版本依實測記錄後才對外承諾。
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
- [ ] 自動保存採序列化寫入及 revision 檢查，保留目前與上一份有效 checkpoint；額外的 migration 備份明列保留上限。不因每次配點／重開生涯累積無上限快照，清理不得先刪唯一可讀存檔。
- [ ] 「資源可離線」與「生涯儲存中／已儲存／儲存失敗」分開顯示；後者只在 transaction 完成後更新時間與 revision。回前景時核對資料庫狀態及寫入權，不依賴 `pagehide`／`visibilitychange` 最後一刻才開始存檔；BFCache 恢復亦不可重播已完成 action。
- [ ] 首次離線準備或首次存檔成功後，能力偵測並請求持久儲存，記錄 granted／denied／unsupported；拒絕時仍能玩與備份。容量估計僅供診斷，不能取代實際寫入成功；安裝至主畫面與 `persist()` 都不能當作不會遺失資料的保證。[WebKit Storage API 與儲存回收](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [ ] 匯出／匯入完全在本機進行；支援 Files 選檔、JSON 下載，並依能力提供檔案分享。玩家可隨時備份，首次存檔及重大版本遷移前提供不阻斷操作的提醒；取消分享不宣稱備份成功。同 origin 的第二份 IndexedDB 記錄不是防清除備份。
- [ ] 存檔啟用後擴充 `src/pwa.js` 的安全判定：寫入完成、下一待選點穩定、候選版支援目前 schema／rules 且所有頁面確認後才切版；寫入失敗、記憶體模式或無法判定相容性時延後，舊版可繼續離線遊玩。

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
- [ ] 新增 `tests/pwa/resume.mjs`（待建立）並接入統一 runner：同 persistent profile 完成至少 30 次「操作 → transaction 完成 → 關閉瀏覽器 → 停止 server → 冷啟動 → 續玩」，覆蓋事件、配點／復原、合約、二刀流轉換與引退。比較每個 checkpoint 的 RNG、待選狀態及年度／最終 digest；不能只比最後一張畫面。
- [ ] 在寫入前、transaction 中與完成後分別注入中斷；恢復只能得到完整舊版或新版 checkpoint，不能得到混合欄位。新增儲存拒絕、quota、壞檔、未知 schema、IDB blocked、重複 action 與多頁衝突案例；故障注入不能取代真實離線資源測試。
- [ ] 新增多生涯／多次產圖壓力情境：記錄 DOM、監聽器、待處理 timer、canvas／Blob URL 及儲存用量；重新開始後釋放上一局的暫存與圖片，歷史資料仍可由 model 還原。以固定工作量重複回合確認數量回到合理基準，不依賴一次不穩定的記憶體讀值作結論。
- [ ] 一般 CI 跑有限次耐久／恢復測試；真機執行第 1 節的 2 小時、30 天每日使用、7／30 天閒置情境，結果寫入 `docs/ios-offline-validation.md`（待建立）。沒有真機資料的欄位標示「未驗收」，不由 Chromium／WebKit 模擬結果補勾。

真機紀錄每列至少包含：測試者、裝置、完整 iOS 版本、Safari／standalone、安裝 origin／scope、APP_VER／build ID／schema／rules、開始及結束時間、斷網方式、持久儲存請求結果、操作序列、checkpoint revision／digest、預期／實際結果與截圖。飛航模式須確認 Wi-Fi 與行動網路均未恢復；長期組期間不得更新、重裝或重新連線下載。使用獨立裝置／資料容器區分每日使用與閒置組；不要為讀診斷而打開閒置組 App。

首次準備後分別測鎖屏、切背景、從 App 切換器強制關閉、裝置重新開機，再從同一主畫面圖示離線啟動。清除網站資料、儲存不足與重新連線修復使用另外的破壞性測試組，不污染長期保留組；清除後驗收的是誠實提示及備份復原，不是原檔仍存在。

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
| 2 小時連續遊玩 | 是 | 是 | 是 | 多生涯、重複產圖、偏好切換後可操作，舊資源不無界累積 |
| 30 天每日使用 | 對照記錄 | 主要閘門 | 是 | 每日冷啟動與提交；第 1／7／30 天記錄，不要求定期連網 |
| 7／30 天完全閒置 | 對照記錄 | 主要閘門 | 是 | 分組、真實經過時間後冷啟動及恢復；不以改時鐘代替 |
| 鎖屏／強制關閉／裝置重啟 | 是 | 是 | 是 | 從最後完整 transaction 恢復，未提交操作不假裝已保存 |
| 版本更新 | 是 | 是 | 下載需連線 | 完整新版本與相容存檔就緒、多頁面安全後才切換；下載中斷保留舊版 |
| 回退／未知存檔版本 | 是 | 是 | 是 | 保留原檔，可匯出；只在相容時續玩 |
| 結算產圖／分享 | 是 | 是 | 產圖可離線 | 本機產圖、Share Sheet／下載備援；外部分享是否成功依目的地連線能力 |
| 分頁轉主畫面 | 是 | 是 | 先各自連線準備 | 不假設共用存檔，匯出／匯入後同生涯可續玩 |
| Files 備份／恢復 | 是 | 是 | 是 | 備份已在本機；匯入驗證失敗不覆蓋原檔，恢復結果一致 |
| 資源部分損壞／主機中斷 | 是 | 是 | 修復需連線 | 已完整的舊版本不失效；缺檔撤銷資源就緒，修復不清除生涯 |
| 儲存拒絕／被清除 | 是 | 是 | 視資源是否仍在 | 不虛報保存；提示備份、重新下載或匯入 |
| 旋轉與鍵盤 | 是 | 是 | 任意 | 必要操作不被工具列、鍵盤或 safe area 遮住 |

## 7. 建議交付順序

1. 已完成的 PR 0／1：固定環境、fixture、manifest、本機資產、Service Worker、整版快取與更新協定；後續沿用，發布／真機結果另外補齊。
2. PR 3a → 3b → 3c：優先打通流程資料化、RNG、配點／歷史／結算 round-trip，再接 IndexedDB、備份、持久儲存與安全更新。可靠續玩依賴此順序，不可跳過 model 直接序列化 `S`。
3. PR 2：可與 Phase 3 平行補 iOS 安裝引導、safe area、鍵盤、觸控與分享；「已儲存／可續玩」引導須等 Phase 3 合併後接入。
4. PR 1b：補快取損壞修復、長期不失效策略與離線狀態整合；需要存檔相容性與備份的部分依賴 Phase 3c。
5. PR 4／5：串接存檔與 PWA 耐久測試、CI、文件與真機紀錄。候選 artifact 固定後立即開始各組實際 7／30 天驗收；中途更換 artifact 的組別須重新計時。

合併時須跑完整回歸，保留原本的 v2.0.11 規則 fixture。Phase 1／2 通過真機閘門後可稱「可安裝、可離線開新局」；Phase 3 與恢復驗收完成後才稱「可離線續玩」；真實 30 天使用及閒置組完成後，才標示「已通過 30 天離線驗收」，並附裝置／iOS／build 範圍。若未來需要原生 App 上架或跨裝置同步，再另立提案。

實作驗證沿用 `AGENTS.md`：`bash scripts/codex-setup.sh` 建立環境；`npm run build` 後以 `SITE_ROOT=_site npm run serve` 試玩發布版。PWA 測試自行管理 server／profile；完整檢查用 `npm run check`，若已固定候選產物則用 `SITE_ROOT=_site npm run check`，不可驗一份後再建置另一份發布。這些命令是後續實作的要求，本次文件修訂不代表已執行。

## 8. 最終 Definition of Done

- [ ] `[Codex cloud]` 全新 checkout 能依 `AGENTS.md` 與 `scripts/codex-setup.sh` 建置測試環境，無需開發者電腦上的隱含 global dependency。
- [ ] `[Codex cloud]` `npm run check` 一次完成 static、unit、既有 Chromium regression、Chromium／WebKit E2E、Chromium PWA、存檔與 v2.0.11 deterministic 檢查。
- [ ] `[Codex cloud]` 更新、回退與壞存檔均有安全且可理解的處理；測試不依賴 production credential 或未宣告外網。
- [ ] `[Release/manual]` iPhone 不連開發電腦即可由正式 HTTPS 網址開始遊戲，並可加入主畫面以 standalone 模式啟動。
- [ ] `[Release/manual]` Safari 與 standalone 各自完成首次連線準備後，可斷網冷啟動、開新生涯／續玩至引退，圖示完整且結算圖可產生。
- [ ] `[Release/manual]` 已提交 checkpoint 在強制關閉後可恢復，涵蓋事件、配點／復原、二刀流轉換與引退；同規則版本 deterministic 結果不變。
- [ ] `[Release/manual]` 主畫面版通過 2 小時離線遊玩、30 天每日使用及獨立 7／30 天閒置後冷啟動；包含裝置重啟，日期／版本／結果紀錄完整，不靠改時鐘或中途連網。
- [ ] `[Release/manual]` 離線 JSON 匯出至本機 Files 並匯入成功；Safari 到主畫面搬移與資料清除後重新下載／還原有實測紀錄。
- [ ] `[Codex cloud]` 資源就緒與生涯保存狀態分開；中斷寫入只恢復完整 checkpoint，持久儲存拒絕與 quota 失敗不虛報保存，多局遊玩不無界增加暫存。
- [ ] `[Release/manual]` 更新不丟未存進度、不混用資源；儲存清除、未知版本與回退限制有可操作的備份／匯入說明。
- [ ] `[Release/manual]` 目標直向／橫向尺寸無阻斷操作的 overflow 或遮擋。
- [ ] `[Release/manual]` 真機驗收、安裝文件、Pages／DNS 驗證及發布／回退文件齊全。
