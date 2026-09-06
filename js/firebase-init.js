// Firebaseアプリの初期化(SDKはCDN経由で読み込み)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// オフライン時もアプリを使い続けられるよう、ローカルキャッシュを有効化する。
// 複数タブを同時に開いている場合など、有効化できないケースもあるため
// 失敗しても致命的ではなく、その場合はオフライン時に読み書きできないだけになる。
try {
  await enableIndexedDbPersistence(db);
} catch (err) {
  console.warn("オフラインキャッシュを有効化できませんでした:", err.code || err);
}
