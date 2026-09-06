import { signUp, logIn, logOut, resetPassword, watchAuthState, authErrorMessage } from "./auth.js";
import { loadProgress, loadQuestionBank } from "./sync.js";
import { initQuiz, teardownQuiz } from "./quiz.js";

let mode = "login"; // "login" | "signup"
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
// ログイン/新規登録フォームの表示切り替え
// ---------------------------------------------------------------
function setMode(next) {
  mode = next;
  clearAuthMessages();
  const title = document.getElementById("authTitle");
  const sub = document.getElementById("authSub");
  const submitBtn = document.getElementById("authSubmitBtn");
  const switchArea = document.getElementById("authSwitch");

  if (mode === "login") {
    title.textContent = "ログイン";
    sub.textContent = "ユーザID(メールアドレス)とパスワードでログインしてください。";
    submitBtn.textContent = "ログイン";
    switchArea.innerHTML = `アカウントをお持ちでない場合は <a id="switchToSignup">新規登録</a>`;
    document.getElementById("switchToSignup").addEventListener("click", () => setMode("signup"));
  } else {
    title.textContent = "新規登録";
    sub.textContent = "ユーザID(メールアドレス)とパスワード(6文字以上)を決めてください。";
    submitBtn.textContent = "アカウントを作成";
    switchArea.innerHTML = `アカウントをお持ちの場合は <a id="switchToLogin">ログイン</a>`;
    document.getElementById("switchToLogin").addEventListener("click", () => setMode("login"));
  }
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
    if (mode === "login") {
      await logIn(email, password);
    } else {
      await signUp(email, password);
    }
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

setMode("login");

// ---------------------------------------------------------------
// ログイン状態の監視:ログインしたらアプリ画面へ、ログアウトしたらログイン画面へ
// ---------------------------------------------------------------
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
    setMode("login");
  }
});
