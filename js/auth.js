// メールアドレス/パスワード認証まわりの薄いラッパー
import { auth } from "./firebase-init.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

// ブラウザを閉じても(明示的にログアウトするまで)ログイン状態を保持する
await setPersistence(auth, browserLocalPersistence);

export function signUp(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function logIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function logOut() {
  return signOut(auth);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

// ログイン状態が変化するたびに callback(user) が呼ばれる。
// userはログイン中ならUserオブジェクト、未ログインならnull。
export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

// Firebase Authenticationのエラーコードを、日本語の分かりやすいメッセージに変換する
export function authErrorMessage(err) {
  const code = err && err.code ? err.code : "";
  const map = {
    "auth/invalid-email": "メールアドレスの形式が正しくありません。",
    "auth/user-disabled": "このアカウントは無効化されています。",
    "auth/user-not-found": "アカウントが見つかりません。メールアドレスをご確認ください。",
    "auth/wrong-password": "パスワードが正しくありません。",
    "auth/invalid-credential": "メールアドレスまたはパスワードが正しくありません。",
    "auth/email-already-in-use": "このメールアドレスは既に登録されています。ログインをお試しください。",
    "auth/weak-password": "パスワードは6文字以上で設定してください。",
    "auth/too-many-requests": "試行回数が多すぎます。しばらく待ってから再度お試しください。",
    "auth/network-request-failed": "通信エラーが発生しました。ネットワーク接続をご確認ください。",
  };
  return map[code] || `エラーが発生しました(${code || err.message}）`;
}
