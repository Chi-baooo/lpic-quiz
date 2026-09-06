// LPIC-1 問題集の出題ロジック本体。
// 以前の単一HTML版から、ストレージ部分だけをFirestore連携(sync.js)に差し替えたもの。
import { saveProgress } from "./sync.js";

let ALL_Q = [];
let CATS = [];
const TYPE_LABEL = { single: "単一選択", multi: "複数選択", fill: "記述", note: "暗記カード" };
let EXAM_CATS = {};
const catChipEls = {};

let filters = { exam: new Set(["101", "102"]), cat: new Set(), type: new Set(["single", "multi", "fill", "note"]), flaggedOnly: false, search: "" };
let queue = [];
let qIndex = 0;
let stats = {}; // id -> {attempts, correct, lastCorrect}
let answered = false;
let selected = new Set();
let sessionLog = [];
let isMockExam = false;
let mockTimerInterval = null;
let mockEndTime = null;
let flagged = new Set();
let dailyLog = {}; // 'YYYY-MM-DD' -> {attempts, correct}

let currentUid = null;
let saveTimer = null;

// ---------------------------------------------------------------
// 初期化 / 後片付け(app.js から、ログイン後・ログアウト時に呼ばれる)
// ---------------------------------------------------------------
export function initQuiz(uid, questions, progress) {
  currentUid = uid;
  ALL_Q = questions;
  CATS = [...new Set(ALL_Q.map((q) => q.category))];
  EXAM_CATS = {};
  ALL_Q.forEach((q) => {
    (EXAM_CATS[q.exam] ||= new Set()).add(q.category);
  });
  filters = { exam: new Set(["101", "102"]), cat: new Set(CATS), type: new Set(["single", "multi", "fill", "note"]), flaggedOnly: false, search: "" };

  stats = progress.stats || {};
  flagged = new Set(progress.flags || []);
  dailyLog = progress.daily || {};

  document.getElementById("searchInput").value = "";
  document.getElementById("flagOnlyCheck").checked = false;
  document.getElementById("modeSelect").value = "shuffle";
  document.getElementById("countSelect").value = "all";

  buildChips();
  syncCategoryChips();
  renderDashboard();
  document.getElementById("qcard").innerHTML = emptyStateHtml();

  wireStaticButtons();
}

export function teardownQuiz() {
  clearMockTimer();
  currentUid = null;
  queue = [];
  qIndex = 0;
  sessionLog = [];
  document.getElementById("examChips").innerHTML = "";
  document.getElementById("catChips").innerHTML = "";
  document.getElementById("typeChips").innerHTML = "";
  document.getElementById("catStats").innerHTML = "";
  document.getElementById("typeStats").innerHTML = "";
  document.getElementById("dailyStats").innerHTML = "";
  document.getElementById("qcard").innerHTML = "";
}

function emptyStateHtml() {
  return `<div class="empty-state"><div class="big">左のフィルターを選んで「この条件で開始」を押してください</div><div>条件を絞り込むほど、狙った分野を集中的に演習できます。</div></div>`;
}

// ---------------------------------------------------------------
// Firestoreへの保存(変更のたびに呼ぶ。多少まとめて送れるよう軽くデバウンス)
// ---------------------------------------------------------------
function persist() {
  if (!currentUid) return;
  setSyncTag("syncing", "同期中…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveProgress(currentUid, { stats, flags: [...flagged], daily: dailyLog })
      .then(() => setSyncTag("synced", "同期済み"))
      .catch((err) => {
        console.error(err);
        setSyncTag("error", "同期エラー");
      });
  }, 400);
}

function setSyncTag(cls, text) {
  const el = document.getElementById("syncTag");
  if (!el) return;
  el.className = "sync-tag " + cls;
  el.textContent = text;
}

// ---------------------------------------------------------------
// フィルターUI
// ---------------------------------------------------------------
function buildChips() {
  const examBox = document.getElementById("examChips");
  examBox.innerHTML = "";
  ["101", "102"].forEach((ex) => {
    const el = document.createElement("label");
    el.className = "chip on";
    el.innerHTML = `<input type="checkbox" checked data-exam="${ex}"> 第${ex}試験`;
    el.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) filters.exam.add(ex);
      else filters.exam.delete(ex);
      el.classList.toggle("on", e.target.checked);
      syncCategoryChips();
    });
    examBox.appendChild(el);
  });

  const catBox = document.getElementById("catChips");
  catBox.innerHTML = "";
  CATS.forEach((cat) => {
    const el = document.createElement("label");
    el.className = "chip on small";
    el.innerHTML = `<input type="checkbox" checked data-cat="${cat}"> ${cat}`;
    el.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) filters.cat.add(cat);
      else filters.cat.delete(cat);
      el.classList.toggle("on", e.target.checked);
    });
    catBox.appendChild(el);
    catChipEls[cat] = el;
  });

  const typeBox = document.getElementById("typeChips");
  typeBox.innerHTML = "";
  Object.entries(TYPE_LABEL).forEach(([t, label]) => {
    const el = document.createElement("label");
    el.className = "chip on small";
    el.innerHTML = `<input type="checkbox" checked data-type="${t}"> ${label}`;
    el.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) filters.type.add(t);
      else filters.type.delete(t);
      el.classList.toggle("on", e.target.checked);
    });
    typeBox.appendChild(el);
  });
}

function syncCategoryChips() {
  const allowed = new Set();
  filters.exam.forEach((ex) => (EXAM_CATS[ex] || new Set()).forEach((c) => allowed.add(c)));
  filters.cat = new Set(allowed);
  CATS.forEach((cat) => {
    const el = catChipEls[cat];
    if (!el) return;
    const input = el.querySelector("input");
    const isAllowed = allowed.has(cat);
    input.checked = isAllowed;
    input.disabled = !isAllowed;
    el.classList.toggle("on", isAllowed);
    el.style.opacity = isAllowed ? "1" : "0.35";
    el.style.cursor = isAllowed ? "pointer" : "default";
  });
}

function acc(id) {
  const s = stats[id];
  if (!s || s.attempts === 0) return null;
  return s.correct / s.attempts;
}

function buildQueue() {
  let list = ALL_Q.filter((q) => filters.exam.has(q.exam) && filters.cat.has(q.category) && filters.type.has(q.type));
  if (filters.flaggedOnly) {
    list = list.filter((q) => flagged.has(q.id));
  }
  const kw = filters.search.trim().toLowerCase();
  if (kw) {
    list = list.filter((q) => {
      const hay = [q.question, ...(q.choices || []), q.explanation || ""].join(" ").toLowerCase();
      return hay.includes(kw);
    });
  }
  const mode = document.getElementById("modeSelect").value;
  if (mode === "shuffle") {
    list = [...list].sort(() => Math.random() - 0.5);
  } else if (mode === "weak") {
    list = [...list].sort((a, b) => {
      const aa = acc(a.id);
      const bb = acc(b.id);
      const av = aa === null ? -1 : aa;
      const bv = bb === null ? -1 : bb;
      return av - bv;
    });
  } else if (mode === "unseen") {
    list = [...list].sort((a, b) => {
      const as = stats[a.id] ? stats[a.id].attempts : 0;
      const bs = stats[b.id] ? stats[b.id].attempts : 0;
      return as - bs;
    });
  }
  const countVal = document.getElementById("countSelect").value;
  if (countVal !== "all") {
    list = list.slice(0, parseInt(countVal, 10));
  }
  return list;
}

function startQueue(list, opts = {}) {
  queue = list;
  qIndex = 0;
  sessionLog = [];
  clearMockTimer();
  isMockExam = !!opts.isMock;
  const card = document.getElementById("qcard");
  if (queue.length === 0) {
    card.innerHTML = `<div class="empty-state"><div class="big">条件に合う問題がありません</div><div>フィルターを見直してください。</div></div>`;
    return;
  }
  if (isMockExam) startMockTimer(90 * 60);
  renderQuestion();
}

function clearMockTimer() {
  if (mockTimerInterval) {
    clearInterval(mockTimerInterval);
    mockTimerInterval = null;
  }
}
function startMockTimer(seconds) {
  mockEndTime = Date.now() + seconds * 1000;
  updateTimerDisplay();
  mockTimerInterval = setInterval(updateTimerDisplay, 1000);
}
function updateTimerDisplay() {
  const el = document.getElementById("timerTag");
  if (!el) return;
  const remain = Math.max(0, Math.round((mockEndTime - Date.now()) / 1000));
  const m = String(Math.floor(remain / 60)).padStart(2, "0");
  const s = String(remain % 60).padStart(2, "0");
  el.textContent = `⏱ ${m}:${s}`;
  el.classList.toggle("warn", remain <= 300);
  if (remain <= 0) {
    clearMockTimer();
    el.textContent = "⏱ 時間切れ";
  }
}

function startMockExam(exam) {
  filters.exam = new Set([exam]);
  syncCategoryChips();
  document.getElementById("typeChips").querySelectorAll("input").forEach((inp) => {
    const t = inp.dataset.type;
    const on = t !== "note";
    inp.checked = on;
    inp.closest(".chip").classList.toggle("on", on);
    if (on) filters.type.add(t);
    else filters.type.delete(t);
  });
  document.getElementById("examChips").querySelectorAll("input").forEach((inp) => {
    const on = inp.dataset.exam === exam;
    inp.checked = on;
    inp.closest(".chip").classList.toggle("on", on);
  });
  document.getElementById("modeSelect").value = "shuffle";
  document.getElementById("countSelect").value = "60";
  startQueue(buildQueue(), { isMock: true });
}

// ---------------------------------------------------------------
// ダッシュボード(単元ごとの総数・正解数/総問題数)
// ---------------------------------------------------------------
function renderDashboard() {
  let totalPool = 0;
  let totalMastered = 0;
  const catBox = document.getElementById("catStats");
  catBox.innerHTML = "";
  CATS.forEach((cat) => {
    const qsInCat = ALL_Q.filter((q) => q.category === cat && q.type !== "note");
    const poolSize = qsInCat.length;
    const mastered = qsInCat.filter((q) => stats[q.id] && stats[q.id].lastCorrect).length;
    totalPool += poolSize;
    totalMastered += mastered;
    const pct = poolSize > 0 ? Math.round((mastered / poolSize) * 100) : 0;
    const row = document.createElement("div");
    row.className = "cat-row";
    row.innerHTML = `<div class="label"><span>${cat}(全${poolSize}問)</span><span>${mastered} / ${poolSize}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>`;
    catBox.appendChild(row);
  });
  document.getElementById("overallStat").textContent = `${totalMastered} / ${totalPool}`;
  document.getElementById("overallBar").style.width = totalPool > 0 ? Math.round((totalMastered / totalPool) * 100) + "%" : "0%";
  renderTypeStats();
  renderDailyStats();
}

function renderTypeStats() {
  const box = document.getElementById("typeStats");
  if (!box) return;
  box.innerHTML = "";
  ["single", "multi", "fill"].forEach((t) => {
    const qsOfType = ALL_Q.filter((q) => q.type === t);
    const poolSize = qsOfType.length;
    const mastered = qsOfType.filter((q) => stats[q.id] && stats[q.id].lastCorrect).length;
    const pct = poolSize > 0 ? Math.round((mastered / poolSize) * 100) : 0;
    const row = document.createElement("div");
    row.className = "cat-row";
    row.innerHTML = `<div class="label"><span>${TYPE_LABEL[t]}(全${poolSize}問)</span><span>${mastered} / ${poolSize}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>`;
    box.appendChild(row);
  });
}

function renderDailyStats() {
  const box = document.getElementById("dailyStats");
  if (!box) return;
  const dates = Object.keys(dailyLog).sort().reverse().slice(0, 10);
  if (dates.length === 0) {
    box.innerHTML = `<div style="color:var(--muted); font-family:var(--sans); font-size:12.5px;">まだ記録がありません</div>`;
    return;
  }
  box.innerHTML = dates
    .map((d) => {
      const s = dailyLog[d];
      const pct = s.attempts > 0 ? Math.round((s.correct / s.attempts) * 100) : 0;
      return `<div class="stat-row"><span>${d}</span><span>${s.correct}/${s.attempts} (${pct}%)</span></div>`;
    })
    .join("");
}

// ---------------------------------------------------------------
// 出題・解答
// ---------------------------------------------------------------
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function renderQuestion() {
  answered = false;
  selected = new Set();
  const q = queue[qIndex];
  const card = document.getElementById("qcard");

  let bodyHtml = "";
  if (q.type === "note") {
    bodyHtml = `<div class="note-box">${escapeHtml(q.explanation)}</div>`;
  } else if (q.type === "fill") {
    bodyHtml = `<div class="fill-answer"><input type="text" id="fillInput" placeholder="回答を入力..." autocomplete="off"></div>`;
  } else {
    const inputType = q.type === "multi" ? "checkbox" : "radio";
    bodyHtml =
      `<div class="choices">` +
      q.choices
        .map(
          (c, i) => `
      <label class="choice" data-idx="${i}">
        <input type="${inputType}" name="choice" value="${i}">
        <span>${escapeHtml(c)}</span>
        <span class="mark"></span>
      </label>`
        )
        .join("") +
      `</div>`;
  }

  const isFlagged = flagged.has(q.id);
  card.innerHTML = `
    <div class="qmeta">
      <span class="tag exam${q.exam}">第${q.exam}試験</span>
      <span class="tag">${q.category}</span>
      <span class="tag">${TYPE_LABEL[q.type]}</span>
      ${isMockExam ? '<span class="tag timer-tag" id="timerTag">⏱ --:--</span>' : ""}
      <button id="flagBtn" class="tag" style="cursor:pointer; border-color:${isFlagged ? "var(--amber)" : "var(--line)"}; color:${isFlagged ? "var(--amber)" : "var(--muted)"};">${isFlagged ? "★ フラグ済み" : "☆ フラグを付ける"}</button>
      <span class="tag progress-pill">${qIndex + 1} / ${queue.length}</span>
    </div>
    <div class="qtext">${escapeHtml(q.question)}</div>
    ${bodyHtml}
    <div class="explain" id="explainBox"></div>
    <div class="actions">
      <button class="btn ghost" id="skipBtn" style="${q.type === "note" ? "display:none;" : ""}">スキップ(不正解扱い)</button>
      <button class="btn" id="submitBtn">${q.type === "note" ? "確認した →" : "回答する"}</button>
    </div>
  `;

  document.getElementById("flagBtn").addEventListener("click", () => {
    if (flagged.has(q.id)) flagged.delete(q.id);
    else flagged.add(q.id);
    persist();
    const btn = document.getElementById("flagBtn");
    const on = flagged.has(q.id);
    btn.textContent = on ? "★ フラグ済み" : "☆ フラグを付ける";
    btn.style.borderColor = on ? "var(--amber)" : "var(--line)";
    btn.style.color = on ? "var(--amber)" : "var(--muted)";
  });

  if (q.type !== "note") {
    card.querySelectorAll(".choice").forEach((el) => {
      el.addEventListener("click", () => {
        if (answered) return;
        const idx = parseInt(el.dataset.idx);
        if (q.type === "single") {
          card.querySelectorAll(".choice").forEach((c) => c.classList.remove("selected"));
          selected = new Set([idx]);
          el.classList.add("selected");
          el.querySelector("input").checked = true;
        } else {
          if (selected.has(idx)) {
            selected.delete(idx);
            el.classList.remove("selected");
            el.querySelector("input").checked = false;
          } else {
            selected.add(idx);
            el.classList.add("selected");
            el.querySelector("input").checked = true;
          }
        }
      });
    });
  }

  document.getElementById("submitBtn").addEventListener("click", () => {
    if (!answered) submitAnswer();
    else nextQuestion();
  });
  document.getElementById("skipBtn").addEventListener("click", () => {
    if (!answered) skipAnswer();
  });
}

function recordResult(q, isCorrect, skipped) {
  if (!stats[q.id]) stats[q.id] = { attempts: 0, correct: 0, lastCorrect: false };
  stats[q.id].attempts += 1;
  if (isCorrect) stats[q.id].correct += 1;
  stats[q.id].lastCorrect = isCorrect;

  const d = new Date().toISOString().slice(0, 10);
  if (!dailyLog[d]) dailyLog[d] = { attempts: 0, correct: 0 };
  dailyLog[d].attempts += 1;
  if (isCorrect) dailyLog[d].correct += 1;

  persist();
  renderDashboard();

  sessionLog.push({ id: q.id, isCorrect, question: q.question, category: q.category, exam: q.exam, explanation: q.explanation, skipped: !!skipped });
}

function submitAnswer() {
  const q = queue[qIndex];
  const card = document.getElementById("qcard");
  let isCorrect = false;

  if (q.type === "note") {
    nextQuestion();
    return;
  }

  if (q.type === "fill") {
    const val = document.getElementById("fillInput").value.trim();
    const correctAns = String(q.correct).trim();
    isCorrect = val !== "" && (val === correctAns || val.replace(/\s/g, "") === correctAns.replace(/\s/g, ""));
    document.getElementById("fillInput").disabled = true;
  } else {
    const correctSet = new Set(q.correct);
    isCorrect = selected.size === correctSet.size && [...selected].every((i) => correctSet.has(i));
    card.querySelectorAll(".choice").forEach((el) => {
      const idx = parseInt(el.dataset.idx);
      const mark = el.querySelector(".mark");
      if (correctSet.has(idx)) {
        el.classList.add("correct");
        mark.textContent = "正解";
        mark.classList.add("ok");
      } else if (selected.has(idx)) {
        el.classList.add("incorrect");
        mark.textContent = "選択";
        mark.classList.add("ng");
      }
      el.style.pointerEvents = "none";
    });
  }

  const box = document.getElementById("explainBox");
  box.classList.add("show", isCorrect ? "ok" : "ng");
  box.innerHTML = `<b>${isCorrect ? "○ 正解" : "× 不正解"}</b> — ${escapeHtml(q.explanation)}`;

  answered = true;
  document.getElementById("submitBtn").textContent = qIndex + 1 < queue.length ? "次の問題 →" : "結果を見る";
  document.getElementById("skipBtn").style.display = "none";

  recordResult(q, isCorrect, false);
}

function skipAnswer() {
  const q = queue[qIndex];
  const card = document.getElementById("qcard");

  if (q.type === "fill") {
    document.getElementById("fillInput").disabled = true;
  } else {
    const correctSet = new Set(q.correct);
    card.querySelectorAll(".choice").forEach((el) => {
      const idx = parseInt(el.dataset.idx);
      const mark = el.querySelector(".mark");
      if (correctSet.has(idx)) {
        el.classList.add("correct");
        mark.textContent = "正解";
        mark.classList.add("ok");
      }
      el.style.pointerEvents = "none";
    });
  }

  const box = document.getElementById("explainBox");
  box.classList.add("show", "ng");
  box.innerHTML = `<b>× スキップ(不正解扱い)</b> — ${escapeHtml(q.explanation)}`;

  answered = true;
  document.getElementById("submitBtn").textContent = qIndex + 1 < queue.length ? "次の問題 →" : "結果を見る";
  document.getElementById("skipBtn").style.display = "none";

  recordResult(q, false, true);
}

function nextQuestion() {
  qIndex += 1;
  if (qIndex >= queue.length) {
    showResults();
    return;
  }
  renderQuestion();
}

function showResults() {
  clearMockTimer();
  const card = document.getElementById("qcard");
  const total = sessionLog.length;
  const correctList = sessionLog.filter((l) => l.isCorrect);
  const wrongList = sessionLog.filter((l) => !l.isCorrect);
  const pct = total > 0 ? Math.round((correctList.length / total) * 100) : 0;

  let mockNote = "";
  if (isMockExam) {
    const passLine = pct >= 60 ? "合格ライン目安(6割)を上回っています。" : "合格ライン目安(6割)にはまだ届いていません。";
    mockNote = `<div class="result-sub">※ 本番はスコア200〜800の相対評価のため参考値ですが、${passLine}</div>`;
  }

  card.innerHTML = `
    <div class="result-summary">
      <div class="result-score">${correctList.length} / ${total} 正解 (${pct}%)</div>
      <div class="result-sub">${isMockExam ? "模擬試験" : "演習"}が終了しました。</div>
      ${mockNote}
      <div class="result-actions">
        <button class="btn" id="retryWrongBtn" ${wrongList.length === 0 ? "disabled" : ""}>間違えた${wrongList.length}問だけ解き直す</button>
        <button class="btn ghost" id="retrySameBtn">同じセットをシャッフルして再挑戦</button>
        <button class="btn ghost" id="backBtn">ダッシュボードに戻る</button>
      </div>
      <div class="result-list-title">✕ 不正解だった問題(${wrongList.length})</div>
      <div id="wrongListBox">${
        wrongList.length === 0
          ? '<div style="color:var(--muted); font-size:13px;">ありません 🎉</div>'
          : wrongList
              .map(
                (l) => `
        <div class="result-item ng">
          <div class="meta">第${l.exam}試験 / ${l.category}</div>
          <div class="q">${escapeHtml(l.question)}</div>
          <div class="ans">${escapeHtml(l.explanation)}</div>
        </div>`
              )
              .join("")
      }</div>
      <div class="result-list-title">○ 正解した問題(${correctList.length})</div>
      <div id="correctListBox">${
        correctList.length === 0
          ? '<div style="color:var(--muted); font-size:13px;">ありません</div>'
          : correctList
              .map(
                (l) => `
        <div class="result-item ok">
          <div class="meta">第${l.exam}試験 / ${l.category}</div>
          <div class="q">${escapeHtml(l.question)}</div>
        </div>`
              )
              .join("")
      }</div>
    </div>
  `;

  document.getElementById("retryWrongBtn").addEventListener("click", () => {
    const ids = new Set(wrongList.map((l) => l.id));
    const list = [...queue.filter((q) => ids.has(q.id))].sort(() => Math.random() - 0.5);
    startQueue(list, { isMock: false });
  });
  document.getElementById("retrySameBtn").addEventListener("click", () => {
    const list = [...queue].sort(() => Math.random() - 0.5);
    startQueue(list, { isMock: isMockExam });
  });
  document.getElementById("backBtn").addEventListener("click", () => {
    card.innerHTML = emptyStateHtml();
  });
}

// ---------------------------------------------------------------
// 進捗の書き出し/読み込み(バックアップ・旧ローカル版からの移行用)
// ---------------------------------------------------------------
function ioMsg(text) {
  const el = document.getElementById("ioMsg");
  el.textContent = text;
  el.style.display = "block";
}

function exportProgress() {
  const payload = { exported_at: new Date().toISOString(), stats, flags: [...flagged], daily: dailyLog };
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lpic_progress.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  ioMsg("進捗を lpic_progress.json として書き出しました。");
}

function importProgressFile(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      const incoming = parsed.stats || parsed;
      let merged = 0;
      Object.keys(incoming).forEach((id) => {
        const inc = incoming[id];
        if (!stats[id]) stats[id] = { attempts: 0, correct: 0, lastCorrect: false };
        stats[id].attempts += inc.attempts || 0;
        stats[id].correct += inc.correct || 0;
        // 直近の正誤情報(lastCorrect)は、取り込むデータに含まれていればそれを優先する
        if (typeof inc.lastCorrect === "boolean") stats[id].lastCorrect = inc.lastCorrect;
        merged++;
      });

      if (Array.isArray(parsed.flags)) {
        parsed.flags.forEach((id) => flagged.add(id));
      }
      if (parsed.daily && typeof parsed.daily === "object") {
        Object.keys(parsed.daily).forEach((d) => {
          const inc = parsed.daily[d];
          if (!dailyLog[d]) dailyLog[d] = { attempts: 0, correct: 0 };
          dailyLog[d].attempts += inc.attempts || 0;
          dailyLog[d].correct += inc.correct || 0;
        });
      }

      persist();
      renderDashboard();
      ioMsg(`${merged}問分のデータ(フラグ・日別ログ含む)を合算して読み込み、クラウドに同期しました。`);
    } catch (err) {
      ioMsg("読み込みに失敗しました。正しいjsonファイルか確認してください。");
    }
  };
  reader.readAsText(file);
}

// ---------------------------------------------------------------
// 静的なボタン類のイベント登録(initQuizのたびに呼ぶ)
// ---------------------------------------------------------------
function wireStaticButtons() {
  document.getElementById("startBtn").onclick = () => startQueue(buildQueue());
  document.getElementById("mock101Btn").onclick = () => startMockExam("101");
  document.getElementById("mock102Btn").onclick = () => startMockExam("102");

  document.getElementById("resetBtn").onclick = () => {
    if (!confirm("学習履歴(正答率データ)をすべて削除します。よろしいですか?")) return;
    stats = {};
    persist();
    renderDashboard();
  };

  document.getElementById("exportBtn").onclick = exportProgress;
  document.getElementById("importBtn").onclick = () => document.getElementById("importFile").click();
  document.getElementById("importFile").onchange = (e) => {
    const file = e.target.files[0];
    if (file) importProgressFile(file);
    e.target.value = "";
  };

  document.getElementById("searchInput").oninput = (e) => {
    filters.search = e.target.value;
  };
  document.getElementById("flagOnlyCheck").onchange = (e) => {
    filters.flaggedOnly = e.target.checked;
    document.getElementById("flagOnlyChip").classList.toggle("on", e.target.checked);
  };
}
