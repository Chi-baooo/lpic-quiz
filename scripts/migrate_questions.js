/**
 * 問題データ(questions.json)をFirestoreに1回だけ投入するスクリプト。
 *
 * 【重要】このスクリプトはあなたのPCでNode.jsから直接実行してください。
 * GitHub Actionsなど公開される環境では絶対に実行しないでください
 * (サービスアカウントキーが漏洩します)。
 *
 * 事前準備:
 *   1. このファイルと同じ scripts/ フォルダに questions.json を置く
 *      (問題データファイル。GitHubにはアップロードしないこと)
 *   2. Firebaseコンソール → 歯車アイコン → プロジェクトの設定 →
 *      「サービス アカウント」タブ → 「新しい秘密鍵の生成」でJSONをダウンロードし、
 *      C:\Users\<ユーザー名>\.secrets\lpic-quiz\serviceAccountKey.json に保存する
 *      (OneDriveなどクラウド同期されるフォルダには置かないこと。GitHubにもアップロードしないこと)
 *   3. ターミナルで scripts フォルダに移動し、以下を実行:
 *        npm install firebase-admin
 *        node migrate_questions.js
 *
 * 成功すると「アップロード完了: 433問」のように表示されます。
 * 問題データを更新した場合は、questions.jsonを差し替えてから再実行してください
 * (既存のドキュメントを上書きします)。
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const admin = require("firebase-admin");

// 秘密鍵はOneDrive(クラウド同期)の外に置く。環境変数 SERVICE_ACCOUNT_KEY_PATH で上書きも可能
const keyPath =
  process.env.SERVICE_ACCOUNT_KEY_PATH ||
  path.join(os.homedir(), ".secrets", "lpic-quiz", "serviceAccountKey.json");
const dataPath = path.join(__dirname, "questions.json");

if (!fs.existsSync(keyPath)) {
  console.error(
    `サービスアカウントキーが見つかりません: ${keyPath}\nFirebaseコンソールからダウンロードしたキーを、このパスに置いてください(OneDrive/scripts/フォルダには置かない)。`
  );
  process.exit(1);
}
if (!fs.existsSync(dataPath)) {
  console.error(
    "questions.json が見つかりません。問題データファイルをscripts/フォルダに置いてください。"
  );
  process.exit(1);
}

const serviceAccount = require(keyPath);
const questions = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  await db.collection("content").doc("questions").set({
    list: questions,
    count: questions.length,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`アップロード完了: ${questions.length}問`);
  process.exit(0);
}

main().catch((err) => {
  console.error("失敗しました:", err);
  process.exit(1);
});
