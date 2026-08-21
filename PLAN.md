# YaKyoLife iPhone 遠端版改造計畫

## 1. 目標與前提

本計畫把「iPhone 可以遠端運行」定義為：

- 遊戲部署在公開的 HTTPS 網址，iPhone 不需要連接開發用電腦即可開啟。
- 玩家可用 Safari 遊玩，也可透過「加入主畫面」以接近 App 的獨立視窗啟動。
- 第一次成功載入後，短暫離線或網路不穩時仍能啟動核心遊戲。
- iOS 回收分頁或玩家關閉 App 後，未結束的生涯能安全恢復。
- 直向與橫向操作皆不遮住選項，瀏海、Dynamic Island、Home Indicator 與軟體鍵盤不會蓋住內容。

這裡採用「遠端託管、在 iPhone 瀏覽器內執行」的 PWA 架構。現有遊戲是純前端模擬，不需要為了遠端開啟而新增後端。若需求其實是「遊戲邏輯必須在伺服器執行」或「iPhone、電腦共用同一份雲端存檔」，需另立後端、登入、資料庫與同步規格；不納入第一版。

## 2. 現況盤點

目前專案已具備不少 iPhone 基礎，不應重做：

- 無框架、無建置步驟的靜態 ES Modules，可直接放在 GitHub Pages 或其他靜態主機。
- `index.html` 已有 viewport、`viewport-fit=cover`、Apple Web App meta 與 touch icon。
- `css/style.css` 已採手機優先單欄、`100dvh`、safe-area inset、sticky 操作區及窄螢幕 container query。
- `src/main.js` 已處理部分 iOS 觸控行為，並在執行時產生 PWA manifest。
- `src/ui/share-image.js` 已優先使用 Web Share API 分享結算圖。
- `CNAME` 與頁面 canonical 指向 `www.yakyolife.com`。

主要缺口：

- manifest 是執行時建立的 Blob，沒有靜態 `manifest.webmanifest`。
- 沒有 Service Worker，因此無法保證離線啟動，也沒有明確的版本更新策略。
- 遊戲中的 `S`、RNG 游標與流程佇列只存在記憶體；iOS 結束分頁後會遺失生涯。
- `stepQ` 存的是函式，選項也大量使用 closure 綁定，不能直接 JSON 序列化後還原。
- 正式網址、GitHub Pages 發布來源與 README 中的舊網址沒有統一。
- 沒有自動化 smoke test，也沒有真機驗收清單。

## 3. 架構決策

### 第一版

- 保留純前端與無建置 runtime，不引入原生 iOS 專案。
- 使用 GitHub Pages（或等價的 HTTPS 靜態主機）發布。
- 使用靜態 Web App Manifest + Service Worker 組成可安裝 PWA。
- 存檔先放本機 IndexedDB，另提供 JSON 匯出／匯入作為備份。
- 所有遊戲資料留在裝置上，不上傳姓名、進度或偏好。

### 暫不採用

- 不先用 Capacitor／原生 WebView 包裝；只有在需要 App Store、推播、Game Center 或其他原生 API 時再評估。
- 不在第一版做帳號與雲端同步，避免為單機遊戲引入不必要的隱私、營運與衝突合併成本。
- 不改寫遊戲規則與機率；重構前後同一 seed、同一選擇應得到同一結果。

## 4. Codex 雲端實作準備

### 可行性結論與邊界

程式碼、測試、GitHub Pages workflow 與文件都可在 Codex 雲端的隔離環境內實作。雲端環境可用本機 HTTP server 與 Playwright WebKit 驗證大部分 PWA、離線、版面、存檔與 deterministic 行為，但不能取代真正的 iOS Safari、加入主畫面、VoiceOver、Share Sheet、DNS 或 GitHub Pages 帳號設定。因此每個階段分成「Codex 雲端完成條件」與「發布／真機閘門」；外部閘門未完成不應冒充已驗收，但也不阻擋下一個純程式碼任務開始。

| 工作 | Codex 雲端 | 外部操作 |
| --- | --- | --- |
| 修改程式、測試、workflow、README | 可完成 | PR 合併由維護者決定 |
| 本機 HTTP、WebKit、離線、IndexedDB、自動 accessibility 檢查 | 可完成 | 真機結果另記 |
| GitHub／GitLab repository 授權、Pages 設定與 production deployment | 僅能產生設定檔並檢查 diff | 維護者授權、合併並確認部署 |
| custom domain、DNS、HTTPS 強制轉址 | 可檢查 repo 內 `CNAME` 與文件 | 維護者在 DNS／Pages 後台確認 |
| iPhone Safari、加入主畫面、VoiceOver、Dynamic Island、鍵盤、Share Sheet | 不能真實驗證 | 維護者依真機 checklist 驗收 |

### Repository 與環境前置條件

- [ ] 先把本計畫 commit 到可供雲端選取的 branch；未追蹤或只存在本機的 `PLAN.md` 不會出現在雲端 checkout。
- [ ] 在 Codex cloud 連接正確 repository（目前為 `IShengFang/yakyulife`），並在每個任務明確指定基準 branch／commit；不得假設本機未推送的修改存在。
- [ ] 第一個 bootstrap 任務先使用預設 universal image；建立 `package.json`、`package-lock.json`、`.gitignore`、`AGENTS.md`、`scripts/codex-setup.sh` 與最小 smoke test 後，再把 cloud environment 的 setup script 設為 `bash scripts/codex-setup.sh`。
- [ ] 在 cloud environment 與 repo 檔案中固定同一個受 Playwright 支援的 Node.js LTS 版本。安裝一律使用 lockfile 與 `npm ci`，不可依賴開發者電腦既有的 global package。
- [ ] `scripts/codex-setup.sh` 必須可重跑，負責 `npm ci` 與安裝指定版本的 Playwright WebKit／所需系統套件；maintenance script 也呼叫同一支腳本。lockfile 或 setup script 改變後重建／重設環境 cache。
- [ ] bootstrap 或升級依賴的任務若需在 agent 階段下載新套件，只暫時開放最小必要的 npm 與 Playwright 下載網域；lockfile 落地後的一般實作與測試應可在 agent 無網路下完成。
- [ ] 不把 production credential、DNS token 或個人 GitHub token 當作測試前提。Codex 只提交 Pages workflow；部署由合併後的 GitHub Actions 權限執行。需要在 agent 階段使用的非敏感設定放 environment variables；不得假設 setup-only secret 在 agent 階段仍存在。
- [ ] `AGENTS.md` 明列 setup、serve、lint／static check、unit、E2E 與總驗證命令，讓每個雲端任務使用同一套入口，例如 `npm run check`，而非依賴對話中的臨時指令。

### 雲端任務切分規則

- 一個 Codex cloud 任務只處理下方一個 PR 交付單位；Phase 3 必須拆成「可序列化流程」與「IndexedDB／恢復 UI」兩個任務，避免大型重構無法獨立驗證或回退。
- 每個任務開始先跑既有 `npm run check`，結束再跑受影響的測試與完整 `npm run check`；若基準本來就失敗，需在摘要中列出原有失敗，不能把它算成此次完成。
- 測試預設只連本機 server，封鎖未宣告的外部請求；Google Fonts、正式站、GitHub API、DNS 與分析服務不可成為測試成功條件。
- 每個任務的交付摘要必須列出：異動檔案、執行過的命令及結果、未完成的發布／真機閘門。Codex 雲端完成不等於 production 已發布。

## 5. 執行階段

### Phase 0 — 建立可重現的基準

- [ ] 先建立最小雲端測試骨架：`package.json`、`package-lock.json`、`.gitignore`、`AGENTS.md`、`scripts/codex-setup.sh`、本機靜態 server 與 `tests/`；runtime 仍維持無建置的靜態 ES Modules。
- [ ] 提供固定且非互動的命令：`npm run serve`、`npm run test:static`、`npm run test:unit`、`npm run test:e2e`、`npm run check`；CI 與 Codex cloud 必須呼叫相同腳本。
- [ ] 記錄目前可完成一輪生涯的基準 seed、守位、球員資料與選擇序列，將輸入與預期年份、球隊、能力、統計、結局 digest 保存成 versioned fixture，不只寫在人工筆記。
- [ ] 最小 WebKit smoke test 由 `http://127.0.0.1` 啟動遊戲、完成第一個穩定互動並檢查 console/page error；禁止以 `file://` 當作 PWA 基準。
- [ ] 確認正式唯一網址，以 `https://www.yakyolife.com/` 為預設；更新 `README.md` 的舊 GitHub Pages 連結。
- [ ] 在 repo 文件中記錄預期的 GitHub Pages 發布 branch／workflow、custom domain、DNS 與 HTTPS 強制轉址；實際後台狀態由維護者確認。
- [ ] 維護者在 Safari responsive mode 與至少一台實機記錄現有問題，附上 iOS／裝置／顯示模式，避免只憑模擬器改版。

Codex 雲端完成條件：全新 checkout 可由 `scripts/codex-setup.sh` 建好環境，`npm run check` 通過，且至少有一組能驗證「遊戲結果未變」的 fixture。發布／真機閘門：維護者確認正式網址、Pages／DNS 設定與 iPhone 基準紀錄。

### Phase 1 — 正式 PWA 與遠端發布

預計異動：`index.html`、`src/main.js`、`src/config.js`、新增 `manifest.webmanifest`、`sw.js`、`src/pwa.js`，視發布方式新增 `.github/workflows/pages.yml`。

- [ ] 把執行時 Blob manifest 移成靜態 `manifest.webmanifest`，使用相對 `start_url`／`scope`，填入現有 180、192、512 圖示、名稱、主題色及 `display: standalone`。
- [ ] 在 `index.html` 直接連結 manifest，保留 Apple touch icon 與 standalone meta。
- [ ] 新增 Service Worker 註冊模組；註冊失敗只能降級成一般網頁，不得阻止遊戲開始。
- [ ] 預快取同源 app shell：HTML、CSS、所有 JS module、圖示與必要圖片。
- [ ] 導覽請求採 network-first 並回退快取；帶版本的同源靜態資源採 cache-first。
- [ ] Google Fonts 不得成為啟動必要條件。離線時允許使用系統字型；若要求離線外觀完全一致，再把授權允許的字型資產自託管。
- [ ] cache 名稱綁定 `APP_VER`，activate 時只刪除舊版 app-shell cache，不碰 IndexedDB 存檔。
- [ ] 偵測到新 Service Worker 時顯示「新版本可用」，由玩家確認後更新；不可在遊戲選擇途中強制 reload。
- [ ] 建立明確的 Pages 發布流程：每次主分支發布都先做檔案、module import、manifest 與版本一致性檢查，再部署同一份 artifact。
- [ ] 將目前散落在 `index.html` 與各 module import 的 `v=1.5.6` 更新工作自動化，或至少用 CI 阻止版本 token 不一致的發布。

Codex 雲端完成條件：在本機 HTTP server 的 WebKit 測試中，manifest／圖示／module MIME 正確，Service Worker 能完成安裝、離線冷啟動、可控更新與舊 cache 清理，且 `npm run check` 通過。發布／真機閘門：iPhone Safari 可由正式 HTTPS 網址開啟、加入主畫面、以 standalone 啟動；成功載入一次後切到飛航模式仍能進入首頁並開始遊戲；更新版本時不會混用新舊 JS。

### Phase 2 — iPhone 介面與操作強化

預計異動：`index.html`、`css/style.css`、`src/main.js`、`src/ui/dom.js`、`src/ui/alloc.js`、`src/ui/share-image.js`。

- [ ] 驗證 375、390、430 CSS px 直向，以及常見橫向尺寸；任何畫面不得出現整頁水平捲動。
- [ ] 檢查首頁、記分板、詳情面板、能力分配、所有 modal、底部選項與引退結算的 safe area。
- [ ] 所有主要觸控目標至少 44 × 44 CSS px；相鄰選項保留足夠間隔，連點不應誤觸隔壁按鈕。
- [ ] 輸入框維持至少 16px，避免 iOS 聚焦時自動放大；鍵盤出現後姓名、背號與開始按鈕仍可捲到可見區。
- [ ] 檢查 `100vh`／`100dvh`、Safari 上下工具列展開收合及橫向旋轉時的 sticky 區塊高度。
- [ ] 重新評估目前全頁禁止縮放及攔截 double-tap 的做法。優先只在真正需要的遊戲控制上抑制誤觸，讓一般文字保留系統縮放與輔助使用能力。
- [ ] 支援 `prefers-reduced-motion`、鍵盤焦點與 VoiceOver 可理解的按鈕名稱；展開元件同步維護 `aria-expanded`。
- [ ] 實機測試結算圖的 Web Share、取消分享、下載備援及長按儲存；Safari 不支援某條路徑時不得無反應。

Codex 雲端完成條件：Playwright WebKit 以目標 viewport 覆蓋主要流程，沒有水平 overflow、自動 accessibility 違規或必要按鈕不可見，分享不支援／取消路徑有明確 fallback，且 `npm run check` 通過。發布／真機閘門：目標尺寸直向／橫向都能完成整輪主要操作；Home Indicator、瀏海、鍵盤及 Safari 工具列不遮住必要按鈕；VoiceOver 能辨識開始、選項、選單與分享操作。

### Phase 3 — 可恢復的本機生涯存檔

預計異動：`src/core/state.js`、`src/core/rng.js`、`src/flow/phases.js`、`src/ui/dom.js`、`src/main.js`，新增 `src/core/save.js`；其他 flow／engine 檔案依重構結果調整。

- [ ] 定義版本化存檔格式，例如 `{schemaVersion, appVersion, savedAt, seed, rngState, gameState, checkpoint, history}`。
- [ ] `S.teamName` 這類可推導函式不寫入存檔，恢復後由共用初始化函式重新掛載。
- [ ] 為 `src/core/rng.js` 增加讀取／恢復內部 RNG 游標的介面，確保續玩不會從 seed 起點重新抽數。
- [ ] 把不可序列化的 `stepQ: Function[]` 改成明確的 phase／checkpoint ID；執行時再由 ID 對應 handler。
- [ ] 把等待玩家選擇的 closure 改成可序列化的 action descriptor，至少包含事件 ID、合法選項與目前流程位置。
- [ ] 將恢復 UI 所需的歷史資料保存為資料模型，而非依賴現存 DOM；重新開啟時用資料重建時間軸、卡片與當前選項。
- [ ] 在「新的一年開始、擲骰或事件結果落地、顯示新選項、能力分配完成、引退」等穩定 checkpoint 原子化自動存檔。
- [ ] 首頁加入「繼續生涯」「開始新生涯」「匯出存檔」「匯入存檔」；覆蓋或刪除存檔前要求確認。
- [ ] schema migration 必須可逐版升級；無法升級時保留原資料並顯示可理解的錯誤，不可靜默清空。
- [ ] 加入損壞資料、容量不足、Safari private mode／儲存拒絕時的降級處理。
- [ ] 測試同一 checkpoint 直接玩與關閉後恢復再玩，後續 RNG、統計與結局完全相同。

Codex 雲端完成條件：unit 與 WebKit 測試覆蓋 checkpoint round-trip、RNG continuity、重複恢復、schema migration、壞檔、儲存拒絕及匯出／匯入，且 `npm run check` 通過。發布／真機閘門：在任一等待玩家操作的畫面強制關閉 standalone PWA，再開啟後可回到同一生涯與同一待選項；連續恢復不會重複發獎、重擲或跳過事件。

### Phase 4 — 擴充自動化驗證與發布護欄

預計擴充：Phase 0 建立的 `package.json`、`tests/`、fixture 與 CI 檢查；runtime 仍維持靜態檔案。

- [ ] 用 Playwright WebKit 覆蓋：開場、四守位至少各一條路徑、選項、能力分配、詳情、重新開始、結算分享 fallback。
- [ ] 加入固定 seed regression test，驗證核心模擬結果未因 UI／PWA 重構改變。
- [ ] 加入存檔 round-trip、舊 schema migration、壞檔與 RNG continuity 測試。
- [ ] 驗證 manifest 每個圖示可取得、Service Worker precache 不缺檔、所有 ES module import 回傳正確 MIME type。
- [ ] CI 做基本 accessibility 與窄螢幕 overflow 檢查。
- [ ] 發布候選版在目前與前一個主要 iOS 版本各做一次 Safari 與加入主畫面真機測試；WebKit 自動化不能取代實機。

Codex 雲端完成條件：PR workflow 與本機 `npm run check` 使用同一組命令，所有自動檢查通過且能保留失敗 artifact。發布／真機閘門：保護規則要求 CI 成功，真機 checklist 有版本、裝置、測試者與結果紀錄。

### Phase 5 — 文件、監控與回復方案

- [ ] `README.md` 補上正式遊玩網址、iPhone「加入主畫面」步驟、支援範圍與本機存檔說明。
- [ ] 新增簡短的發布 checklist：調版號、跑測試、部署、驗證 custom domain、驗證更新提示與離線啟動。
- [ ] 以不收集玩家姓名／存檔內容為原則，只監控首頁與靜態資源可用性；若加入分析工具，需先寫隱私說明與 opt-out。
- [ ] 每版保留可重新部署的 artifact 或 tag。發生嚴重問題時回退上一版 app shell；存檔 migration 必須向前相容，回退不得刪除新存檔。
- [ ] 在 UI 顯示版本與可複製的診斷資訊，方便回報 iOS 版本、standalone 狀態、app 版本與存檔 schema，不包含個資。

完成條件：非開發者能依文件安裝與更新；維護者能在一次發布內回退程式，且不破壞玩家存檔。

## 6. 驗收矩陣

| 情境 | Safari 分頁 | 加入主畫面 | 離線 | 驗收重點 |
| --- | --- | --- | --- | --- |
| 首次開啟 | 是 | 不適用 | 否 | HTTPS、資源完整、無 console error |
| 安裝／啟動 | 是 | 是 | 否 | 圖示、名稱、standalone、safe area 正確 |
| 再次啟動 | 是 | 是 | 是 | app shell 可載入、系統字型 fallback 可接受 |
| 生涯中斷恢復 | 是 | 是 | 是 | 回到同一 checkpoint，沒有重擲或重複事件 |
| 版本更新 | 是 | 是 | 否 | 玩家確認後才 reload，新舊資源不混用 |
| 結算分享 | 是 | 是 | 是 | Share Sheet 或可理解的下載／長按備援 |
| 旋轉與鍵盤 | 是 | 是 | 任意 | 必要操作不被工具列、鍵盤或 safe area 遮住 |

## 7. 建議交付順序

1. PR 0：Codex cloud bootstrap、lockfile、`AGENTS.md`、最小 WebKit smoke、固定 seed fixture 與一致的 `npm run check`。
2. PR 1：正式網址與發布流程、靜態 manifest、Service Worker、離線與更新 UI。
3. PR 2：iPhone 尺寸、safe area、鍵盤、觸控、縮放與分享 fallback；真機修正依 checklist 回饋追加小 PR。
4. PR 3a：可序列化 phase／action descriptor、RNG state API 與 deterministic regression test，不先接 IndexedDB。
5. PR 3b：IndexedDB transaction、schema migration、checkpoint、匯出／匯入與恢復 UI。
6. PR 4：完整 WebKit E2E、accessibility／overflow、CI、文件與發布 checklist。

Phase 1 完成後即可稱為「iPhone 可遠端開啟／安裝版」；Phase 3 完成後才算能承受 iOS 分頁回收的可靠版本。若未來確認需要跨裝置同步，再以獨立提案決定登入方式、API、加密、衝突處理、資料刪除與營運成本。

## 8. 最終 Definition of Done

- [ ] `[Codex cloud]` 全新 checkout 能依 `AGENTS.md` 與 `scripts/codex-setup.sh` 建置測試環境，無需開發者電腦上的隱含 global dependency。
- [ ] `[Codex cloud]` `npm run check` 一次完成 static、unit、WebKit E2E、manifest／Service Worker、存檔與 deterministic regression 檢查。
- [ ] `[Codex cloud]` 更新、回退與壞存檔均有安全且可理解的處理；測試不依賴 production credential 或未宣告外網。
- [ ] `[Release/manual]` iPhone 不連開發電腦即可由正式 HTTPS 網址開始遊戲，並可加入主畫面以 standalone 模式啟動。
- [ ] `[Release/manual]` 成功載入一次後可離線啟動與遊玩既有本機內容。
- [ ] `[Release/manual]` 強制關閉後能恢復未完成生涯，且 deterministic 結果不變。
- [ ] `[Release/manual]` 目標直向／橫向尺寸無阻斷操作的 overflow 或遮擋。
- [ ] `[Release/manual]` 真機驗收、安裝文件、Pages／DNS 驗證及發布／回退文件齊全。
