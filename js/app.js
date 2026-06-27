// ═══════════════════════════════════════════
// 基础医学概论刷题 — 主逻辑
// 三门学科（解剖/生理/组织）题库合并 + 学科筛选 + 5选项 + 知识点页
// ═══════════════════════════════════════════

// 合并三门学科题库（解剖[0-4]→生理[5-13]→组织[14-17]，顺序固定保护旧记录）
const QUIZ_BANKS = [].concat(BANKS_ANATOMY, BANKS_PHYSIOLOGY, BANKS_HISTOLOGY);
const SUBJECTS = ["解剖学", "生理学", "组织学"];

// 全局状态
// ═══════════════════════════════════════════
const LS_KEY = "anatomy_quiz_state_v2";
let state = {
  view: "quiz",
  mode: "single",
  subject: "解剖学",
  bankIndex: 0,
  scoring: "instant",
  positions: {},
  allOrder: null,
  records: {},
  wrongBook: {},
  currentAnswers: {},
  currentBatchSubmitted: false,
  currentQuestionList: [],
  _batchResult: null
};

function saveState() {
  const toSave = {
    view: state.view,
    mode: state.mode,
    subject: state.subject,
    bankIndex: state.bankIndex,
    scoring: state.scoring,
    positions: state.positions,
    allOrder: state.allOrder,
    records: state.records,
    wrongBook: state.wrongBook
  };
  try { localStorage.setItem(LS_KEY, JSON.stringify(toSave)); } catch(e) {
    console.warn("saveState failed:", e);
    try { showToast("⚠️ 存储空间不足，进度可能无法保存"); } catch(e2) {}
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // 校验枚举值,防止篡改导致异常
      state.view = (saved.view === "knowledge") ? "knowledge" : "quiz";
      state.mode = (["single","all","wrong"].indexOf(saved.mode) >= 0) ? saved.mode : "single";
      state.subject = (SUBJECTS.indexOf(saved.subject) >= 0) ? saved.subject : "解剖学";
      state.scoring = (saved.scoring === "batch") ? "batch" : "instant";
      // 校验 bankIndex 范围
      const bi = parseInt(saved.bankIndex);
      state.bankIndex = (bi >= 0 && bi < QUIZ_BANKS.length) ? bi : 0;
      // 校验 positions 为对象
      state.positions = (saved.positions && typeof saved.positions === "object" && !Array.isArray(saved.positions)) ? saved.positions : {};
      // 校验 allOrder 为 null 或数组
      state.allOrder = (Array.isArray(saved.allOrder)) ? saved.allOrder : null;
      // 校验 records 为对象
      state.records = (saved.records && typeof saved.records === "object" && !Array.isArray(saved.records)) ? saved.records : {};
      // 校验 wrongBook 为对象
      state.wrongBook = (saved.wrongBook && typeof saved.wrongBook === "object" && !Array.isArray(saved.wrongBook)) ? saved.wrongBook : {};
    }
  } catch(e) {
    console.warn("loadState failed, using defaults:", e);
  }
}

// ═══════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════
function getPosKey() {
  if (state.mode === "single") return "single_" + state.bankIndex;
  return state.mode;
}

function getCurrentPosition() {
  const key = getPosKey();
  return state.positions[key] || 0;
}

function setCurrentPosition(pos) {
  const key = getPosKey();
  state.positions[key] = pos;
  saveState();
}

function getRecordKey(bankIdx, qIdx) {
  return bankIdx + "_" + qIdx;
}

function getQuestion(bankIdx, qIdx) {
  return QUIZ_BANKS[bankIdx].questions[qIdx];
}

function getOptionLabel(idx, isTF) {
  if (isTF) return idx === 0 ? "对" : "错";
  return String.fromCharCode(65 + idx);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ═══════════════════════════════════════════
// 构建当前题目列表
// ═══════════════════════════════════════════
function buildQuestionList() {
  if (state.mode === "single") {
    const bank = QUIZ_BANKS[state.bankIndex];
    state.currentQuestionList = bank.questions.map((q, i) => ({
      bankIdx: state.bankIndex, qIdx: i, globalIdx: i
    }));
  } else if (state.mode === "all") {
    const totalAll = QUIZ_BANKS.reduce(function(s, b) { return s + b.questions.length; }, 0);
    // 校验 allOrder 是否过期（题库扩展后旧 allOrder 题数不对，需重建）
    if (!state.allOrder || state.allOrder.length !== totalAll) {
      const all = [];
      QUIZ_BANKS.forEach((bank, bi) => {
        bank.questions.forEach((q, qi) => { all.push({ bankIdx: bi, qIdx: qi }); });
      });
      state.allOrder = shuffle(all);
      saveState();
    }
    state.currentQuestionList = state.allOrder.map((item, i) => ({
      bankIdx: item.bankIdx, qIdx: item.qIdx, globalIdx: i
    }));
  } else if (state.mode === "wrong") {
    const wrongItems = [];
    for (const [key, val] of Object.entries(state.wrongBook)) {
      if (!val.mastered) {
        const [bi, qi] = key.split("_").map(Number);
        wrongItems.push({ bankIdx: bi, qIdx: qi });
      }
    }
    state.currentQuestionList = wrongItems.map((item, i) => ({
      bankIdx: item.bankIdx, qIdx: item.qIdx, globalIdx: i
    }));
  }
}

// ═══════════════════════════════════════════
// 统计
// ═══════════════════════════════════════════
function getStats() {
  let totalAnswered = 0, totalCorrect = 0;
  const bankStats = QUIZ_BANKS.map(() => ({ answered: 0, correct: 0 }));
  for (const [key, rec] of Object.entries(state.records)) {
    if (!rec.answered) continue;
    totalAnswered++;
    if (rec.correct) totalCorrect++;
    const [bi] = key.split("_").map(Number);
    if (bankStats[bi]) { bankStats[bi].answered++; if (rec.correct) bankStats[bi].correct++; }
  }
  const totalQuestions = QUIZ_BANKS.reduce((s, b) => s + b.questions.length, 0);
  const wrongCount = Object.values(state.wrongBook).filter(w => !w.mastered).length;
  return { totalAnswered, totalCorrect, totalQuestions, wrongCount, bankStats };
}

// ═══════════════════════════════════════════
// 渲染
// ═══════════════════════════════════════════
function renderAll() {
  renderModeBar();
  renderScoringToggle();
  renderQuestion();
  renderSidebar();
  updateNavButtons();
}

function renderModeBar() {
  const bankSelect = document.getElementById("bankSelect");
  const btnSubmitAll = document.getElementById("btnSubmitAll");
  const subjectFilter = document.getElementById("subjectFilter");
  // 学科筛选器仅在单一题库模式显示
  subjectFilter.style.display = state.mode === "single" ? "flex" : "none";
  // 更新学科按钮高亮
  document.querySelectorAll(".subj-btn").forEach(function(btn) {
    btn.className = btn.className.replace(" active", "") + (btn.textContent === state.subject ? " active" : "");
  });
  if (state.mode === "single") {
    bankSelect.style.display = "inline-block";
    var subIdx = 0;
    bankSelect.innerHTML = QUIZ_BANKS.map(function(b, i) {
      if (b.subject !== state.subject) return "";
      subIdx++;
      return '<option value="' + i + '" ' + (i === state.bankIndex ? "selected" : "") + '>' + subIdx + '. ' + escapeHtml(b.name) + '（' + b.questions.length + '题）</option>';
    }).filter(function(s){return s;}).join("");
    btnSubmitAll.style.display = state.scoring === "batch" ? "inline-block" : "none";
  } else if (state.mode === "all") {
    bankSelect.style.display = "none";
    btnSubmitAll.style.display = state.scoring === "batch" ? "inline-block" : "none";
  } else {
    bankSelect.style.display = "none";
    btnSubmitAll.style.display = "none";
  }
}

function setSubject(subj) {
  if (state.subject === subj) return;
  state.subject = subj;
  // 切换学科后定位到该学科第一个题库
  const firstIdx = QUIZ_BANKS.findIndex(function(b){return b.subject === subj;});
  if (firstIdx >= 0) state.bankIndex = firstIdx;
  state.currentBatchSubmitted = false;
  state.currentAnswers = {};
  state._batchResult = null;
  buildQuestionList();
  const pos = getCurrentPosition();
  if (pos >= state.currentQuestionList.length) setCurrentPosition(0);
  saveState();
  renderAll();
}

function renderScoringToggle() {
  document.getElementById("scInstant").className = state.scoring === "instant" ? "active" : "";
  document.getElementById("scBatch").className = state.scoring === "batch" ? "active" : "";
}

function renderQuestion() {
  const area = document.getElementById("questionArea");
  const batchResult = document.getElementById("batchResult");

  if (state.currentQuestionList.length === 0) {
    area.innerHTML = '<div class="empty-state"><div class="empty-icon">' +
      (state.mode === "wrong" ? "🎉" : "📝") + '</div><p>' +
      (state.mode === "wrong" ? "错题本为空，全部已掌握！" : "请选择题库开始刷题") + '</p></div>';
    batchResult.classList.remove("show");
    return;
  }

  const pos = getCurrentPosition();
  if (pos >= state.currentQuestionList.length) {
    const total = state.currentQuestionList.length;
    const done = countDoneInCurrentList();
    area.innerHTML = '<div class="empty-state"><div class="empty-icon">🎉</div>' +
      '<p style="font-size:18px;font-weight:600;color:var(--text);">本组题目已全部完成！</p>' +
      '<p style="color:var(--text-sub);margin-top:4px;">已完成 ' + done + '/' + total + ' 题</p>' +
      '<button class="btn-primary" style="margin-top:16px;padding:10px 24px;" onclick="restartCurrent()">重新开始</button></div>';
    batchResult.classList.remove("show");
    return;
  }

  const item = state.currentQuestionList[pos];
  const q = getQuestion(item.bankIdx, item.qIdx);
  const isTF = q.type === "tf";
  const recKey = getRecordKey(item.bankIdx, item.qIdx);
  const rec = state.records[recKey];
  const isAnswered = rec && rec.answered;
  const selectedAnswer = state.currentAnswers[item.globalIdx];
  const bankName = QUIZ_BANKS[item.bankIdx].name;
  const showCorrect = (state.scoring === "instant" && isAnswered) || (state.scoring === "batch" && state.currentBatchSubmitted);

  let html = '<div class="q-header">' +
    '<span class="q-num">第 ' + (pos + 1) + '/' + state.currentQuestionList.length + ' 题 · ' + QUIZ_BANKS[item.bankIdx].subject + ' · ' + bankName + '</span>' +
    '<span class="q-type-tag' + (isTF ? ' tf' : '') + '">' + (isTF ? '判断题' : '单选题') + '</span></div>';
  html += '<div class="q-stem">' + escapeHtml(q.stem) + '</div>';
  html += '<div class="options">';

  for (let i = 0; i < q.options.length; i++) {
    let cls = "opt";
    if (showCorrect) {
      if (i === q.answer) cls += " correct-reveal";
      if (i === selectedAnswer && i !== q.answer) cls += " wrong";
    } else {
      if (i === selectedAnswer) cls += " selected";
    }
    const clickable = (!showCorrect && state.scoring === "instant") || (state.scoring === "batch" && !state.currentBatchSubmitted);
    html += '<div class="' + cls + '"' + (clickable ? ' onclick="selectOption(' + item.globalIdx + ',' + i + ')"' : '') + '>' +
      '<span class="opt-letter">' + getOptionLabel(i, isTF) + '.</span>' +
      '<span>' + escapeHtml(q.options[i]) + '</span></div>';
  }
  html += '</div>';

  if (showCorrect) {
    html += '<div class="explanation show">' +
      '<div class="exp-label">✅ 正确答案：' + getOptionLabel(q.answer, isTF) + (isTF ? '' : '. ' + escapeHtml(q.options[q.answer])) + '</div>' +
      '<div style="margin-top:6px;line-height:1.8;">' + escapeHtml(q.exp) + '</div>' +
      '<div class="exp-ai">⚠️ 以上解析为AI生成，仅供参考学习，如有疑问请核对教材。</div></div>';
  }

  area.innerHTML = html;

  if (state.scoring === "batch" && state.currentBatchSubmitted) {
    showBatchResult();
  } else {
    batchResult.classList.remove("show");
  }
}

function selectOption(globalIdx, optIdx) {
  if (state.scoring === "instant") {
    state.currentAnswers[globalIdx] = optIdx;
    const item = state.currentQuestionList[globalIdx];
    const q = getQuestion(item.bankIdx, item.qIdx);
    const isCorrect = optIdx === q.answer;
    const recKey = getRecordKey(item.bankIdx, item.qIdx);

    state.records[recKey] = {
      answered: true,
      correct: isCorrect,
      count: (state.records[recKey] ? state.records[recKey].count || 0 : 0) + 1
    };

    if (!isCorrect) {
      const wb = state.wrongBook[recKey];
      state.wrongBook[recKey] = {
        errorCount: (wb ? wb.errorCount || 0 : 0) + 1,
        mastered: false,
        lastError: Date.now()
      };
    } else {
      if (state.wrongBook[recKey]) {
        state.wrongBook[recKey].mastered = true;
      }
    }
    saveState();
    renderQuestion();
    renderSidebar();
  } else if (state.scoring === "batch" && !state.currentBatchSubmitted) {
    state.currentAnswers[globalIdx] = optIdx;
    renderQuestion();
  }
}

function submitAll() {
  if (state.scoring !== "batch") return;
  const list = state.currentQuestionList;
  let answeredCount = 0, correctCount = 0;

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const sel = state.currentAnswers[i];
    if (sel === undefined) continue;
    answeredCount++;
    const q = getQuestion(item.bankIdx, item.qIdx);
    const isCorrect = sel === q.answer;
    if (isCorrect) correctCount++;
    const recKey = getRecordKey(item.bankIdx, item.qIdx);

    state.records[recKey] = {
      answered: true,
      correct: isCorrect,
      count: (state.records[recKey] ? state.records[recKey].count || 0 : 0) + 1
    };

    if (!isCorrect) {
      const wb = state.wrongBook[recKey];
      state.wrongBook[recKey] = {
        errorCount: (wb ? wb.errorCount || 0 : 0) + 1,
        mastered: false,
        lastError: Date.now()
      };
    } else {
      if (state.wrongBook[recKey]) {
        state.wrongBook[recKey].mastered = true;
      }
    }
  }

  state.currentBatchSubmitted = true;
  state._batchResult = { answeredCount: answeredCount, correctCount: correctCount, total: list.length };
  saveState();
  renderQuestion();
  renderSidebar();
  showToast("判分完成：" + correctCount + "/" + answeredCount + " 正确（" + (list.length - answeredCount) + " 题未答）");
}

function showBatchResult() {
  const batchResult = document.getElementById("batchResult");
  const br = state._batchResult;
  if (!br) return;
  const pct = br.answeredCount > 0 ? Math.round(br.correctCount / br.answeredCount * 100) : 0;
  document.getElementById("batchScore").innerHTML =
    '<span style="color:' + (pct >= 60 ? 'var(--correct)' : 'var(--wrong)') + '">' + br.correctCount + '</span> / ' + br.answeredCount;
  document.getElementById("batchDetail").textContent =
    '正确率 ' + pct + '% · 共 ' + br.total + ' 题，' + (br.total - br.answeredCount) + ' 题未答（未答不计分）';
  batchResult.classList.add("show");
}

function countDoneInCurrentList() {
  let count = 0;
  for (const item of state.currentQuestionList) {
    const recKey = getRecordKey(item.bankIdx, item.qIdx);
    if (state.records[recKey] && state.records[recKey].answered) count++;
  }
  return count;
}

function renderSidebar() {
  const stats = getStats();
  const overallPct = stats.totalAnswered > 0 ? Math.round(stats.totalCorrect / stats.totalAnswered * 100) : 0;
  const completionPct = Math.round(stats.totalAnswered / stats.totalQuestions * 100);

  document.getElementById("statOverall").textContent = stats.totalAnswered > 0 ? overallPct + "%" : "-";
  document.getElementById("statOverall").className = "val " + (overallPct >= 60 ? "good" : "bad");
  document.getElementById("statTotal").textContent = stats.totalAnswered;
  document.getElementById("statWrongCount").textContent = stats.wrongCount;
  document.getElementById("progressBar").style.width = completionPct + "%";
  document.getElementById("progressLabel").textContent = "完成度 " + completionPct + "%（" + stats.totalAnswered + "/" + stats.totalQuestions + "）";

  let bsHtml = "";
  QUIZ_BANKS.forEach((b, i) => {
    const bs = stats.bankStats[i];
    const pct = bs.answered > 0 ? Math.round(bs.correct / bs.answered * 100) : 0;
    bsHtml += '<div class="stat-row">' +
      '<span style="font-size:12px;">' + escapeHtml(b.name.substring(0, 8)) + '...</span>' +
      '<span class="val" style="font-size:13px;">' + (bs.answered > 0 ? pct + "% (" + bs.correct + "/" + bs.answered + ")" : "-") + '</span></div>';
  });
  document.getElementById("bankStats").innerHTML = bsHtml || '<p style="font-size:13px;color:var(--text-sub);">暂无数据</p>';

  let wlHtml = "";
  const wbEntries = Object.entries(state.wrongBook).filter(function(e) { return !e[1].mastered; });
  if (wbEntries.length === 0) {
    wlHtml = '<p style="font-size:13px;color:var(--text-sub);">暂无错题 🎉</p>';
  } else {
    wbEntries.slice(0, 20).forEach(function(entry) {
      const key = entry[0], val = entry[1];
      const parts = key.split("_");
      const bi = parseInt(parts[0]), qi = parseInt(parts[1]);
      const q = getQuestion(bi, qi);
      const stemShort = q.stem.length > 18 ? q.stem.substring(0, 18) + "..." : q.stem;
      const safeKey = escapeHtml(key);
      const safeCount = parseInt(val.errorCount) || 0;
      wlHtml += '<div class="wrong-item" onclick="jumpToWrong(\'' + safeKey + '\')" title="点击跳转">' +
        escapeHtml(stemShort) + '<span class="w-tag unmastered">错' + safeCount + '次</span></div>';
    });
    if (wbEntries.length > 20) {
      wlHtml += '<p style="font-size:12px;color:var(--text-sub);margin-top:4px;">...还有 ' + (wbEntries.length - 20) + ' 道错题</p>';
    }
  }
  document.getElementById("wrongList").innerHTML = wlHtml;
}

function jumpToWrong(key) {
  const parts = key.split("_");
  const bi = parseInt(parts[0]), qi = parseInt(parts[1]);
  switchMode("wrong");
  const pos = state.currentQuestionList.findIndex(function(item) { return item.bankIdx === bi && item.qIdx === qi; });
  if (pos >= 0) {
    setCurrentPosition(pos);
    state.currentBatchSubmitted = false;
    state.currentAnswers = {};
    renderAll();
  }
}

// ═══════════════════════════════════════════
// 模式切换
// ═══════════════════════════════════════════
function switchMode(mode) {
  if (state.view !== "quiz") switchView("quiz");
  if (state.mode === mode) return;
  state.mode = mode;
  state.currentBatchSubmitted = false;
  state.currentAnswers = {};
  state._batchResult = null;
  buildQuestionList();
  const pos = getCurrentPosition();
  if (pos >= state.currentQuestionList.length) { setCurrentPosition(0); }

  document.getElementById("navSingle").className = mode === "single" ? "active" : "";
  document.getElementById("navAll").className = mode === "all" ? "active" : "";
  document.getElementById("navWrong").className = mode === "wrong" ? "active" : "";

  saveState();
  renderAll();
}

function onBankChange() {
  state.bankIndex = parseInt(document.getElementById("bankSelect").value);
  state.currentBatchSubmitted = false;
  state.currentAnswers = {};
  state._batchResult = null;
  buildQuestionList();
  const pos = getCurrentPosition();
  if (pos >= state.currentQuestionList.length) setCurrentPosition(0);
  saveState();
  renderAll();
}

function setScoring(type) {
  state.scoring = type;
  state.currentBatchSubmitted = false;
  state.currentAnswers = {};
  state._batchResult = null;
  saveState();
  renderAll();
}

function restartCurrent() {
  if (state.mode === "all") { state.allOrder = null; }
  setCurrentPosition(0);
  state.currentBatchSubmitted = false;
  state.currentAnswers = {};
  state._batchResult = null;
  buildQuestionList();
  saveState();
  renderAll();
  showToast("已重新开始");
}

// ═══════════════════════════════════════════
// 导航
// ═══════════════════════════════════════════
function goPrev() {
  const pos = getCurrentPosition();
  if (pos > 0) {
    setCurrentPosition(pos - 1);
    state.currentBatchSubmitted = false;
    state._batchResult = null;
    renderAll();
  }
}

function goNext() {
  const pos = getCurrentPosition();
  if (pos < state.currentQuestionList.length - 1) {
    setCurrentPosition(pos + 1);
    state.currentBatchSubmitted = false;
    state._batchResult = null;
    renderAll();
  }
}

// ═══════════════════════════════════════════
// 重置
// ═══════════════════════════════════════════
function confirmReset(action) {
  const overlay = document.getElementById("modalOverlay");
  const title = document.getElementById("modalTitle");
  const msg = document.getElementById("modalMsg");
  const btn = document.getElementById("modalConfirmBtn");

  if (action === "progress") {
    title.textContent = "重置全部进度";
    msg.textContent = "这将清除所有答题记录、正确率统计和断点续做位置。错题本不会被清除。此操作不可撤销，确认继续？";
    btn.textContent = "确认重置";
    btn.onclick = doResetProgress;
  } else if (action === "wrong") {
    title.textContent = "清空错题本";
    msg.textContent = "这将清除所有错题记录（包括已掌握和未掌握的）。答题统计不受影响。此操作不可撤销，确认继续？";
    btn.textContent = "确认清空";
    btn.onclick = doResetWrongBook;
  }
  overlay.classList.add("show");
}

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("show");
}

function doResetProgress() {
  state.records = {};
  state.positions = {};
  state.allOrder = null;
  state.currentBatchSubmitted = false;
  state.currentAnswers = {};
  state._batchResult = null;
  buildQuestionList();
  saveState();
  closeModal();
  renderAll();
  showToast("进度已重置");
}

function doResetWrongBook() {
  state.wrongBook = {};
  state.currentBatchSubmitted = false;
  state.currentAnswers = {};
  state._batchResult = null;
  buildQuestionList();
  saveState();
  closeModal();
  renderAll();
  showToast("错题本已清空");
}

// ═══════════════════════════════════════════
// Toast
// ═══════════════════════════════════════════
let toastTimer;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { el.classList.remove("show"); }, 2000);
}

// ═══════════════════════════════════════════
// 键盘导航
// ═══════════════════════════════════════════
document.addEventListener("keydown", function(e) {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
  if (e.key === "ArrowLeft" || e.key === "a") { e.preventDefault(); goPrev(); }
  if (e.key === "ArrowRight" || e.key === "d") { e.preventDefault(); goNext(); }
  if (state.scoring === "instant" && !state.currentBatchSubmitted && state.currentQuestionList.length > 0) {
    const pos = getCurrentPosition();
    if (pos < state.currentQuestionList.length) {
      const item = state.currentQuestionList[pos];
      const q = getQuestion(item.bankIdx, item.qIdx);
      const recKey = getRecordKey(item.bankIdx, item.qIdx);
      const isAnswered = state.records[recKey] && state.records[recKey].answered;
      if (!isAnswered) {
        const numMap = { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4 };
        if (e.key in numMap && numMap[e.key] < q.options.length) {
          e.preventDefault();
          selectOption(item.globalIdx, numMap[e.key]);
        }
      }
    }
  }
});

// ═══════════════════════════════════════════
// 更新导航按钮
// ═══════════════════════════════════════════
function updateNavButtons() {
  const pos = getCurrentPosition();
  const total = state.currentQuestionList.length;
  document.getElementById("navProgress").textContent = total > 0 ? (pos + 1) + " / " + total : "";
  // 禁用首尾按钮
  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");
  if (btnPrev) btnPrev.disabled = pos <= 0;
  if (btnNext) btnNext.disabled = pos >= total - 1;
}


// ═══════════════════════════════════════════
// 视图切换（刷题 / 知识点）
// ═══════════════════════════════════════════
function switchView(view) {
  state.view = view;
  saveState();
  const quizView = document.getElementById("quizView");
  const knowledgeView = document.getElementById("knowledgeView");
  const navButtons = document.getElementById("navButtons");
  if (view === "knowledge") {
    quizView.style.display = "none";
    knowledgeView.style.display = "block";
    navButtons.style.display = "none";
    document.getElementById("navSingle").className = "";
    document.getElementById("navAll").className = "";
    document.getElementById("navWrong").className = "";
    document.getElementById("navKnowledge").className = "active";
    renderKnowledge();
  } else {
    quizView.style.display = "flex";
    knowledgeView.style.display = "none";
    navButtons.style.display = "flex";
    document.getElementById("navKnowledge").className = "";
    document.getElementById("navSingle").className = state.mode === "single" ? "active" : "";
    document.getElementById("navAll").className = state.mode === "all" ? "active" : "";
    document.getElementById("navWrong").className = state.mode === "wrong" ? "active" : "";
  }
}

// ═══════════════════════════════════════════
// 知识点页面
// ═══════════════════════════════════════════
let kpState = { subject: "解剖学", chapter: null };

function setKnowledgeSubject(subj) {
  kpState.subject = subj;
  kpState.chapter = null;
  document.querySelectorAll(".kp-subj-btn").forEach(function(btn) {
    btn.className = btn.className.replace(" active", "") + (btn.textContent === subj ? " active" : "");
  });
  document.getElementById("kpSubjectTitle").textContent = subj;
  renderChapterList();
  document.getElementById("kpContent").innerHTML = '<div class="empty-state"><div class="empty-icon">📖</div><p>请选择左侧章节查看知识点</p></div>';
}

function renderChapterList() {
  const data = KNOWLEDGE_POINTS[kpState.subject];
  if (!data) { document.getElementById("kpChapterList").innerHTML = ""; return; }
  const chapters = Object.keys(data);
  document.getElementById("kpChapterList").innerHTML = chapters.map(function(ch) {
    const safeCh = escapeHtml(ch);
    return '<div class="kp-chapter-item' + (ch === kpState.chapter ? " active" : "") + '" onclick="selectChapter(\'' + safeCh + '\')">' + safeCh + '</div>';
  }).join("");
}

function selectChapter(ch) {
  kpState.chapter = ch;
  renderChapterList();
  renderKnowledgeContent();
}

function renderKnowledgeContent() {
  const data = KNOWLEDGE_POINTS[kpState.subject];
  if (!data || !kpState.chapter) return;
  const sections = data[kpState.chapter];  // array of {title, items}
  const content = document.getElementById("kpContent");
  let html = '<div class="kp-ch-title">' + escapeHtml(kpState.subject) + ' · ' + escapeHtml(kpState.chapter) + '</div>';
  sections.forEach(function(sec) {
    // section title (if not empty)
    if (sec.title) {
      html += '<div class="kp-section-title">' + escapeHtml(sec.title) + '</div>';
    }
    // section items
    sec.items.forEach(function(p) {
      if (typeof p === "string") {
        html += '<div class="kp-para">' + escapeHtml(p) + '</div>';
      } else if (p.key) {
        html += '<div class="kp-para key">⭐ ' + escapeHtml(p.key) + '</div>';
      } else if (p.warn) {
        html += '<div class="kp-para warn">⚠️ ' + escapeHtml(p.warn) + '</div>';
      } else if (p.section) {
        html += '<div class="kp-section-title">' + escapeHtml(p.section) + '</div>';
      }
    });
  });
  html += '<div class="kp-para" style="color:var(--text-muted);font-size:13px;margin-top:24px;border-top:1px solid var(--border-lt);padding-top:12px;">⚠️ 知识点来源于课程资料整理，如有疑问请核对教材。</div>';
  content.innerHTML = html;
}

function renderKnowledge() {
  setKnowledgeSubject(kpState.subject);
  if (kpState.chapter) { renderChapterList(); renderKnowledgeContent(); }
}

function escapeHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

// ═══════════════════════════════════════════
// 初始化
// ═══════════════════════════════════════════
function init() {
  loadState();
  buildQuestionList();
  // 校验当前学科下是否有题库，若无则切到解剖学
  if (!QUIZ_BANKS.some(function(b){return b.subject === state.subject;})) state.subject = "解剖学";
  const pos = getCurrentPosition();
  if (pos >= state.currentQuestionList.length && state.currentQuestionList.length > 0) {
    setCurrentPosition(0);
  }
  if (state.view === "knowledge") {
    switchView("knowledge");
  } else {
    document.getElementById("navSingle").className = state.mode === "single" ? "active" : "";
    document.getElementById("navAll").className = state.mode === "all" ? "active" : "";
    document.getElementById("navWrong").className = state.mode === "wrong" ? "active" : "";
    renderAll();
  }
}

init();