# 玄樞三垣 PWA v2

## 啟動
1. `npm install`
2. 建立 `.env` 並設定 `GEMINI_API_KEY`、`GEMINI_MODEL=gemini-3.8-flash`
3. `node --env-file=.env server.mjs`
4. 開啟 `http://localhost:3000`

## 已修正
- Gemini 金鑰只在 Node.js 後端。
- 模型名稱由環境變數控制，前端不寫死。
- 逾時 60 秒；只重試 429、500、502、503、504 與網路錯誤。
- 國曆天數會依月份及閏年更新，年份與近五年範圍動態產生。
- 正規化五行、四元素、分數及色碼。
- 手機排版可手動切換並記住設定。
- PWA Manifest 與 Service Worker 已加入，API 不快取。

## 確定性排盤
`lunar-javascript`、`iztro`、`astronomy-engine` 已列入依賴，應在下一階段封裝 `/api/chart/calculate`。目前版本已完成安全後端代理，但原始大型 Prompt 的排盤內容仍由模型產生，因此不應標示為科學或可驗證的精密排盤。

## 上線前
請加入 `public/icons/icon-192.png` 與 `public/icons/icon-512.png`，並將 Tailwind CDN 改為本地建置 CSS。
