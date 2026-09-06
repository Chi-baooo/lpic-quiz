// Firestoreへの進捗の読み書き。
// 1ユーザーにつき users/{uid} ドキュメント1つに、stats/flags/dailyをまとめて保存する。
import { db } from "./firebase-init.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export async function loadProgress(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const d = snap.data();
    return {
      stats: d.stats || {},
      flags: d.flags || [],
      daily: d.daily || {},
    };
  }
  return { stats: {}, flags: [], daily: {} };
}

export async function saveProgress(uid, { stats, flags, daily }) {
  const ref = doc(db, "users", uid);
  await setDoc(
    ref,
    { stats, flags, daily, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// 問題データ本体(433問)をFirestoreから取得する。
// ログインしていないと読み取れない(firestore.rulesで制御)ため、
// GitHub上の公開ファイルとして問題データを置く必要がなくなる。
export async function loadQuestionBank() {
  const ref = doc(db, "content", "questions");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error(
      "問題データがFirestoreに見つかりません。scripts/migrate_questions.js を実行してデータを投入してください。"
    );
  }
  return snap.data().list;
}
