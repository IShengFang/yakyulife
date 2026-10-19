# 離線 App 維護與驗證

## 靜態部署

只需要 HTTPS 靜態主機（本機測試可用 localhost），不需要後端、帳號或 npm 建置。
`manifest.webmanifest` 的 `id`、`scope` 與 `start_url` 均為相對路徑，可部署在 `/`
或 GitHub Pages 的 `/yakyulife/`。保留根目錄的 `sw.js`、manifest、`index.html`、
`src/`、`css/`、`assets/`。這個 fork 不會自動改變上游官網，請使用實際部署此 commit 的網址。

修改任何發布檔案後，執行並一併提交產物：

```sh
node tools/build-offline.mjs
node tools/build-offline.mjs --check
```

`tools/build-offline.mjs` 自動收集全部本機 JS、CSS、圖片、manifest 及 WOFF2 字型，
為每個檔案記錄 SHA-256。`tools/service-worker.js` 是 worker 的來源；`sw.js` 是
可以直接部署的產物。PR 與 main 部署前會檢查清單，避免之後新增模組卻漏掉離線下載。

## 快取與更新

- Cache Storage 使用「路徑 scope + 內容版本」命名，不依賴 worker 的記憶體、sessionStorage
  或 HTTP cache；相同版本重新啟動會直接讀裝置資料，沒有到期自刪或每次重抓整包。
- 安裝時最多同時下載四個檔案，每個檔案驗證實際位元組、大小與 SHA-256。
  URL 帶內容雜湊避開 CDN 舊快取；回應錯誤、內容不符、逾時或配額錯誤都不能通過安裝。
- 更新可重用舊版本中雜湊相同的檔案；新版本未完整下載成功前不刪舊版。
  不呼叫 `skipWaiting()`，也不自動 reload；全部舊視窗關閉後再啟用新版。
- 啟用新版只清理此路徑 scope 的舊版本，不碰其他 App 的快取。
- 首頁、`index.html`、`?seed=...` 都以快取首頁啟動。版本參數只對已列入清單的
  本機資源正規化；不攔截其他網站、其他路徑或非 GET 請求。
- UI 透過目前 worker 檢查所有預期檔案是否存在、頁面是否受控制，才顯示可離線。
  不用 localStorage 的「已下載」旗標假裝可用；返回 App 時會重新檢查。
  「重試離線下載」可修復缺檔，並驗證全部內容。快取完全遭系統清除時，仍須連網重新安裝。
- Phosphor 圖示 CSS 與 WOFF2 已附 MIT 授權存進專案，避免 CDN 斷線時按鈕圖示消失。
  Google 字型只做非阻塞的線上美化，離線使用既有的系統字型備援。

## 自動測試

既有 CI 安裝的 Playwright / Chromium 即可執行：

```sh
node tests/offline_pwa.mjs
```

測試自行啟動隔離的 HTTP server，不需要正式部署。涵蓋安裝失敗與重試、快取缺檔修復、
斷網啟動、關閉整個瀏覽器程序後使用相同 profile 重新啟動、種子網址、根目錄與子目錄、
離線開始生涯及訓練、更新中斷保留舊版、完整下載後等待視窗關閉才啟用，以及不同 scope
的快取隔離。`CHROME_PATH` 可指定 Chromium；`PWA_BROWSER=webkit` 可選用已安裝的
Playwright WebKit（其持久 profile 能力與真實 Safari 不完全相同）。

## iPhone 實機驗收

桌面瀏覽器測試不能等同 iOS 實機重開機。發布後請在目標 iPhone 做以下驗證：

1. Safari 開啟部署網址 → 分享 → 加入主畫面，從新圖示啟動。
2. 等待「可離線遊玩」，開啟安裝說明確認持久儲存結果。未核准不代表無法離線。
3. 開啟飛航模式並關閉 Wi-Fi，強制關閉 App，再從圖示開啟；可開始新生涯、選守位、
   分配訓練骰、推進賽季並在不同主題間切換，操作圖示仍正常顯示。
4. 保持飛航模式，將 iPhone 關機再開機，解鎖後從圖示開啟，重複步驟 3。
5. 恢復連線，在有新版本時檢查更新；當前生涯不會被打斷。結束後關閉全部視窗，再開啟新版。

生涯本身仍沿用原專案的行為：沒有跨重開存檔。iOS 清除資料、移除 App、私密模式及
系統回收儲存空間不在「正常重開機免重下載」的保證範圍內。

參考：[WebKit Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
與 [Home Screen 的 ITP 儲存例外](https://webkit.org/tracking-prevention/)。
