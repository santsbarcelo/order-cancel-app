/**
 * アプリの公開ベース URL（末尾スラッシュなし）。
 *
 * `shopify app dev` 実行中、拡張ビルドに `SHOPIFY_APP_URL` が埋め込まれることがあります。
 * バンドル後の `dist/order-cancel.js` を開き、期待 URL が入っているか確認してください。
 * 埋まっていない場合は `FALLBACK_DEV_URL` を dev のトンネル表示に合わせて更新する運用になります。
 */
/* global globalThis */

function trimTrailingSlash(url) {
  return String(url).replace(/\/$/, "");
}

/**
 * @param {unknown} globalObj
 * @returns {string}
 */
function readShopifyAppUrlFromProcess(globalObj) {
  if (!globalObj || typeof globalObj !== "object") return "";
  const g = /** @type {Record<string, unknown>} */ (globalObj);
  const proc = g.process;
  if (!proc || typeof proc !== "object") return "";
  const procEnv = /** @type {{ env?: { SHOPIFY_APP_URL?: string } }} */ (
    proc
  );
  const url = procEnv.env?.SHOPIFY_APP_URL;
  return typeof url === "string" && url ? trimTrailingSlash(url) : "";
}

const fromProcess = readShopifyAppUrlFromProcess(
  typeof globalThis !== "undefined" ? globalThis : undefined,
);

/** 環境変数が効かないときの手動フォールバック（トンネル再起動後はここを更新） */
const FALLBACK_DEV_URL =
  "https://theories-zshops-jonathan-liver.trycloudflare.com";

export const APP_BASE_URL = fromProcess || trimTrailingSlash(FALLBACK_DEV_URL);

/** Menu item と modal の2モジュール間でキャンセル完了を通知する（利用可能な環境のみ） */
export const ORDER_CANCEL_BROADCAST_CHANNEL = "order-cancel-extension-sync";
