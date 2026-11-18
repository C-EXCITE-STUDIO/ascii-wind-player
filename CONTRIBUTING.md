---
type: reference
title: 字符風場維護與貢獻
status: stable
line: 探激
author: ai
compile_layer: wiki
created: 2026-11-18
updated: 2026-11-18
---

# 維護與貢獻

## 修改前

1. 建立功能分支，保留已發行版本。
2. 先寫能重現問題的測試，確認失敗，再修改程式。
3. 不因效能調整破壞「同源字符、全幅均勻、預設半密度」三個視覺原則。

## 最低驗證

```bash
node --test tests/core.test.cjs tests/package.test.cjs
node --check core.js
node --check renderer.js
node --check app.js
node --check demo-image.js
```

另外在真實瀏覽器驗證：選圖、拖放、暫停與繼續、0/50/100% 密度、風速、三檔精細度、換圖、無效檔案、全螢幕及縮小視窗。

只通過 Node 測試不代表瀏覽器畫面已驗證；CI 的綠燈也不代表 GPU 效能已量測。

## 發版

1. 更新 `package.json` 版本及 `CHANGELOG.md`。
2. 跑完整測試與瀏覽器手動驗證，記錄測試環境及限制。
3. 檢查待提交檔案；圖片、base64、截圖與報告同樣要做隱私檢查。
4. 提交描述性 commit，建立對應的 annotated tag。
5. 經維護者明確批准後才推送與發布 Release，不自動發版。
6. 從已追蹤檔案建立 ZIP；禁止直接壓縮整個工作目錄。
7. 發布後讀回遠端倉庫、tag、Release 與下載檔案雜湊。

## 不應提交

- `.local/`：私人範例、舊測試、原始圖像及絕對路徑。
- `reports/`、`.test-tmp/`、`dist/`：機器特定報告、測試暫存及封裝。
- `.env`、帳號憑證、API 金鑰、cookie、個人檔案或私有 Vault 內容。

## 授權提醒

公開存取不等於開源授權。提交外部素材或第三方程式前，必須先確認其來源與使用權；本倉庫目前沒有指定開源授權。
