# LPIC Quiz セットアップ手順

このリポジトリを公開するまでの手順です。**「① Firebaseプロジェクトを作る」→「② コードに設定値を入れる」→「③ GitHubにアップロードしてPagesを有効化する」**の3ステップです。順番に進めてください。

---

## ① Firebaseプロジェクトを作る

### 1. プロジェクトを作成する
1. https://console.firebase.google.com/ を開き、Googleアカウントでログインします。
2. 「プロジェクトを追加」をクリックし、プロジェクト名(例: `lpic-quiz`)を入力して作成します。
3. Googleアナリティクスは、有効/無効どちらでも構いません(不要なら無効でOK)。

### 2. メールアドレス/パスワード認証を有効化する
1. 左メニュー「構築」→「Authentication」→「始める」をクリック。
2. 「Sign-in method」タブを開き、一覧から「メール/パスワード」を選択。
3. 「有効にする」をONにして保存します。

### 3. Firestoreデータベースを作成する
1. 左メニュー「構築」→「Firestore Database」→「データベースの作成」。
2. モードは「本番環境モード」を選択。
3. ロケーションは `asia-northeast1`(東京)を選択して「有効にする」。
4. 作成後、上部の「ルール」タブを開き、中身をすべて選択して削除し、このリポジトリの `firestore.rules` ファイルの内容をそのまま貼り付けて「公開」をクリックします。

### 4. ウェブアプリを登録し、設定値を取得する
1. 左メニュー上部の歯車アイコン →「プロジェクトの設定」。
2. 下にスクロールし「マイアプリ」→ `</>`(ウェブ)のアイコンをクリック。
3. アプリのニックネームを適当に入力(例: `lpic-quiz-web`)して登録。**Firebase Hostingの設定はスキップして構いません**(GitHub Pagesを使うため)。
4. 表示される `firebaseConfig` の中身(下のような形)をコピーします。

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "lpic-quiz-xxxxx.firebaseapp.com",
  projectId: "lpic-quiz-xxxxx",
  storageBucket: "lpic-quiz-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

---

## ② コードに設定値を入れる

このリポジトリの `js/firebase-config.js` を開き、`YOUR_API_KEY` などの部分を、①でコピーした値に置き換えて保存します。

```js
export const firebaseConfig = {
  apiKey: "AIzaSy...",                          // ← ここを置き換える
  authDomain: "lpic-quiz-xxxxx.firebaseapp.com", // ← ここを置き換える
  projectId: "lpic-quiz-xxxxx",                  // ← ここを置き換える
  storageBucket: "lpic-quiz-xxxxx.appspot.com",  // ← ここを置き換える
  messagingSenderId: "123456789",                // ← ここを置き換える
  appId: "1:123456789:web:abcdef123456",         // ← ここを置き換える
};
```

**補足(セキュリティについて)**: この`apiKey`はGitHub上に公開されても問題ありません。Firebaseの`apiKey`は「どのFirebaseプロジェクト宛の通信か」を示すだけの識別子であり、実際のアクセス制御は①で設定した`firestore.rules`が担っています。パスワードのように秘密にする必要はない、というのがFirebase公式の仕様です。

---

## ⚠️ ③の前に必ず: 問題データをFirestoreへ移行する(重要)

**問題データ(`questions.json`)は、著作物の複製を含むため、GitHub Pages上に公開ファイルとして置いてはいけません。** GitHubのPublicリポジトリに置くと、ログイン画面の有無にかかわらず、リポジトリ画面や直接URL経由で誰でも中身を閲覧・ダウンロードできてしまいます。そのため、問題データは**Firestore(ログインしないと読めないデータベース)側に保存**し、GitHubには一切アップロードしません。

### 1. サービスアカウントキーを取得する
1. Firebaseコンソール → 歯車アイコン →「プロジェクトの設定」→「サービス アカウント」タブ。
2. 「新しい秘密鍵の生成」をクリックし、ダウンロードされたJSONファイルを `scripts/serviceAccountKey.json` という名前でこのリポジトリの `scripts/` フォルダに保存します。
3. **このファイルは絶対にGitHubにアップロードしないでください**(`.gitignore`で除外済みですが、念のためご注意ください)。

### 2. 問題データファイルを配置する
お手元の `questions.json`(433問のデータ)を、`scripts/questions.json` として同じフォルダに保存します。こちらも**GitHubにはアップロードしません**。

### 3. 移行スクリプトを実行する
ターミナル(コマンドプロンプト)で `scripts` フォルダに移動し、以下を実行します。

```bash
cd scripts
npm install firebase-admin
node migrate_questions.js
```

「アップロード完了: 433問」と表示されれば成功です。これでFirestoreの `content/questions` ドキュメントに問題データが保存され、ログイン済みのユーザーだけがアプリ経由で読み取れる状態になります。

### 4. GitHubにアップロードするのは「コードだけ」
この後の③でGitHubにアップロードするのは、`index.html` / `css/` / `js/` / `firestore.rules` / `README.md` / `.gitignore` / `scripts/migrate_questions.js` / `scripts/package.json` です。**`scripts/questions.json` と `scripts/serviceAccountKey.json` の2つは絶対に含めないでください。**

---



### 1. リポジトリを作る
GitHubで新しいリポジトリを作成します(例: `lpic-quiz`)。Public(公開)にしてください(後述の理由により、無料でGitHub Pagesを使うにはPublicである必要があります)。

### 2. ファイルをアップロードする
このフォルダの中身一式(`index.html`, `css/`, `js/`, `data/`, `firestore.rules`, `README.md`)を、作成したリポジトリにそのままアップロードします。GitHubの画面から「Add file → Upload files」でドラッグ&ドロップしても、Gitコマンドでpushしても、どちらでも構いません。

### 3. GitHub Pagesを有効化する
1. リポジトリの「Settings」タブ →左メニュー「Pages」。
2. 「Source」で「Deploy from a branch」を選び、Branchを `main`、フォルダを `/ (root)` にして保存。
3. 数分待つと、ページ上部に公開URL(`https://<あなたのユーザー名>.github.io/lpic-quiz/`)が表示されます。

### 4. アカウントを作成する(管理者による手動登録)

このアプリには「新規登録」画面を設けていません。**誰でも自由にアカウントを作れる状態を避けるため、あなた自身のアカウントはFirebaseコンソールから手動で1つだけ作成します。**

1. Firebaseコンソール →「Authentication」→「Users」タブ。
2. 「ユーザーを追加」をクリックし、使いたいメールアドレスとパスワード(6文字以上)を入力して作成します。
3. 公開されたURL(`https://<あなたのユーザー名>.github.io/lpic-quiz/`)にアクセスし、今作成したメールアドレス・パスワードでログインできれば完了です。

もし後から2つ目のアカウントを追加したくなった場合も、同じ「ユーザーを追加」から手動で作成してください。

**補足(残るリスクについて)**: アプリ画面から新規登録できなくしても、Firebaseの`apiKey`はGitHub上で公開されているため、技術的に詳しい第三者がFirebase AuthenticationのAPIを直接叩けば、理論上はアカウントを作成すること自体は可能です。これは「見つけにくく、簡単には使えなくする」対策であり、完全に閉じた仕組みではない点はご留意ください。より厳密に閉じたい場合は、Cloud Functions(有料のBlazeプラン)を使った登録制限の実装が必要になります。

---

## 以前のローカル版(localStorage版)の進捗を引き継ぐ場合

以前の単一HTML版で「進捗を書き出す」を押して保存していた `lpic_progress.json` があれば、ログイン後の画面にある「進捗を読み込む」ボタンからそのファイルを選択してください。既存のクラウド上のデータと合算されます(上書きではありません)。

---

## 無料枠について

- **Firebase Authentication**: メール/パスワード認証は無料です(件数無制限)。
- **Firestore(Sparkプラン)**: 1日あたり読み取り5万回・書き込み2万回・保存容量1GiBまで無料。1人で問題演習に使う分には、まず超えることはありません。
- **GitHub Pages**: Publicリポジトリであれば無料です。Privateリポジトリで使うにはGitHub Pro(有料)が必要です。

## うまく動かないときは

- 「問題データがFirestoreに見つかりません」というエラー → `scripts/migrate_questions.js` をまだ実行していないか、実行時にエラーが出ていないか確認してください。
- 画面が真っ白、ログインできない → ブラウザの開発者ツール(F12)の「Console」タブにエラーが出ていないか確認してください。`firebase-config.js`の値が正しいか、Firestoreのルールが公開されているかを見直してください。
- 「Missing or insufficient permissions」というエラー → `firestore.rules` が正しく貼り付けられ「公開」されているか確認してください。
