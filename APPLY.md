# YaKyoLife iPhone 離線模式修補包

適用專案：https://github.com/IShengFang/yakyulife
基準 commit：3c13bbb4e2133e51172fc5b1f0c7c1d45ecb3857（main，v2.0.12）

## 內容

- 靜態 Web App manifest、既有 iPhone 主畫面圖示與 standalone 模式。
- 完整遊戲程式／資料／圖片／操作圖示的 Cache Storage 離線下載，約 4.1 MB。
- 每個檔案 SHA-256 驗證；更新下載失敗保留舊版，關閉舊視窗後才套用新版。
- 下載狀態、缺檔重試、持久儲存申請、iPhone 安裝說明。
- GitHub Pages 根目錄與子目錄支援。
- Chromium / WebKit 自動測試與 GitHub Actions 的離線清單檢查。

## 套用

在上述專案的乾淨工作目錄執行（將 patch 路徑換成解壓縮後的位置）：

```sh
git switch -c iphone-offline
git apply --check /path/to/yakyulife-offline.patch
git apply /path/to/yakyulife-offline.patch
node tools/build-offline.mjs --check
```

patch 內含二進位字型，不必另外下載圖示資源。套用後的維護與 iPhone 實機驗收說明在 `docs/offline.md`。

## 驗證狀態

已完成：JS 語法檢查、離線資源清單一致性檢查、差異格式檢查、在乾淨基準版本套用 patch 的驗證。

尚未完成：瀏覽器端對端測試、iPhone 實機飛航模式與重開機驗收。本次執行環境禁止瀏覽器所需的系統通訊；GitHub 連線的寫入也被拒絕（403 Resource not accessible by integration），所以尚未推送、建立 PR 或部署。測試腳本已提供，不能把「已加入測試」視為「測試已通過」。

可在有瀏覽器執行權限的環境執行：

```sh
npm install --no-save playwright
npx playwright install --with-deps chromium webkit
node tests/offline_pwa.mjs
PWA_BROWSER=webkit node tests/offline_pwa.mjs
```

建立 PR 後，隨附 workflow 會執行既有回歸測試及新離線測試。部署仍在 main 的測試通過後進行。

## 使用方式與限制

Safari 開啟部署此版本的網址 → 分享 → 加入主畫面 → 從新圖示開啟並連網等到「可離線遊玩」。正常關閉或重開機使用的是裝置上的遊戲檔案。iOS 回收儲存空間、清除網站資料或移除 App 後，仍可能需要重新下載；持久儲存是否核准由系統決定。

此功能沒有新增生涯自動存檔，重開後回到開始畫面。網路字型為可選項，離線使用系統字型；操作圖示會完整離線保存。
