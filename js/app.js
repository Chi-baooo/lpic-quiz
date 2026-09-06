import { logIn, logOut, resetPassword, watchAuthState, authErrorMessage } from "./auth.js";
import { loadProgress, loadQuestionBank } from "./sync.js";
import { initQuiz, teardownQuiz } from "./quiz.js";

let questionsPromise = null;

// 問題データはGitHub上の公開ファイルではなく、ログイン必須のFirestoreから取得する。
// 同じログインセッション中は再取得しないようキャッシュする。
function getQuestions() {
  if (!questionsPromise) {
    questionsPromise = loadQuestionBank();
  }
  return questionsPromise;
}

// ---------------------------------------------------------------
// ログイン画面の初期表示
// 新規登録の窓口はアプリ上には設けない(アカウントはFirebaseコンソールから
// 管理者が手動で作成する運用。README参照)。
// ---------------------------------------------------------------
function initAuthScreenTexts() {
  document.getElementById("authTitle").textContent = "ログイン";
  document.getElementById("authSub").textContent = "ユーザID(メールアドレス)とパスワードでログインしてください。";
  document.getElementById("authSubmitBtn").textContent = "ログイン";
}

function clearAuthMessages() {
  const err = document.getElementById("authError");
  const info = document.getElementById("authInfo");
  err.classList.remove("show");
  info.classList.remove("show");
  err.textContent = "";
  info.textContent = "";
}
function showAuthError(msg) {
  const err = document.getElementById("authError");
  err.textContent = msg;
  err.classList.add("show");
}
function showAuthInfo(msg) {
  const info = document.getElementById("authInfo");
  info.textContent = msg;
  info.classList.add("show");
}

document.getElementById("authSubmitBtn").addEventListener("click", async () => {
  clearAuthMessages();
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  if (!email || !password) {
    showAuthError("ユーザID(メールアドレス)とパスワードを入力してください。");
    return;
  }
  const btn = document.getElementById("authSubmitBtn");
  btn.disabled = true;
  try {
    await logIn(email, password);
    // 成功後の画面切り替えは watchAuthState 側で行う
  } catch (err) {
    showAuthError(authErrorMessage(err));
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("forgotLink").addEventListener("click", async () => {
  clearAuthMessages();
  const email = document.getElementById("authEmail").value.trim();
  if (!email) {
    showAuthError("パスワード再設定用のメールを送るため、まずユーザID(メールアドレス)を入力してください。");
    return;
  }
  try {
    await resetPassword(email);
    showAuthInfo("パスワード再設定用のメールを送信しました。メールをご確認ください。");
  } catch (err) {
    showAuthError(authErrorMessage(err));
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await logOut();
});

initAuthScreenTexts();
watchAuthState(async (user) => {
  const authScreen = document.getElementById("authScreen");
  const appScreen = document.getElementById("appScreen");

  if (user) {
    authScreen.hidden = true;
    appScreen.hidden = false;
    document.getElementById("userEmailLabel").textContent = user.email;

    try {
      const [questions, progress] = await Promise.all([getQuestions(), loadProgress(user.uid)]);
      initQuiz(user.uid, questions, progress);
    } catch (err) {
      console.error(err);
      questionsPromise = null; // 失敗時は次回リトライできるようキャッシュをクリア
      alert("データの読み込みに失敗しました。通信環境を確認し、再読み込みしてください。\n" + err.message);
    }
  } else {
    teardownQuiz();
    appScreen.hidden = true;
    authScreen.hidden = false;
    document.getElementById("authEmail").value = "";
    document.getElementById("authPassword").value = "";
    clearAuthMessages();
  }
});
