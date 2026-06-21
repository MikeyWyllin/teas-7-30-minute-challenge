const SET_SIZE = 25;
const TIME_LIMIT_SECONDS = 30 * 60;
const TEAS_BALANCED_COUNTS = { Reading: 6, Math: 6, Science: 7, English: 6 };
const SUBJECTS = ["Reading", "Math", "Science", "English"];
const STORAGE_KEY = "teas7-current-attempt-v2";
const HISTORY_KEY = "teas7-history-v2";
const LEGACY_HISTORY_KEY = "teas7-history-v1";

const $ = (id) => document.getElementById(id);

let state = {
  seed: "",
  selectedSubjects: [...SUBJECTS],
  plannedCounts: { ...TEAS_BALANCED_COUNTS },
  startedAt: null,
  submittedAt: null,
  deadline: null,
  currentIndex: 0,
  questions: [],
  answers: {},
  submitted: false,
  timerId: null
};

function normalizeSeed(value) {
  const raw = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return raw || makeSeed();
}

function makeSeed() {
  return "SET-" + Math.random().toString(36).slice(2, 7).toUpperCase();
}

function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1^h2^h3^h4)>>>0, (h2^h1)>>>0, (h3^h1)>>>0, (h4^h1)>>>0];
}

function sfc32(a, b, c, d) {
  return function() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11);
    d = d + 1 | 0;
    t = t + d | 0;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  }
}

function rngFor(seed) { return sfc32(...cyrb128(seed)); }

function shuffle(arr, rng) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getSelectedSubjects() {
  const checked = [...document.querySelectorAll("#subjectSelector input:checked")].map(input => input.value);
  return checked.length ? checked : [...SUBJECTS];
}

function subjectSignature(subjects) {
  return SUBJECTS.filter(s => subjects.includes(s)).join("-");
}

function calculateSubjectCounts(subjects) {
  const selected = SUBJECTS.filter(s => subjects.includes(s));
  if (selected.length === 4) return { ...TEAS_BALANCED_COUNTS };

  const counts = Object.fromEntries(selected.map(s => [s, 0]));
  const base = Math.floor(SET_SIZE / selected.length);
  const remainder = SET_SIZE % selected.length;

  selected.forEach((subject, idx) => {
    counts[subject] = base + (idx < remainder ? 1 : 0);
  });

  return counts;
}

function validatePools(plannedCounts) {
  for (const [subject, count] of Object.entries(plannedCounts)) {
    const poolCount = QUESTIONS.filter(q => q.subject === subject).length;
    if (poolCount < count) throw new Error(`${subject} only has ${poolCount} questions, but this setup needs ${count}.`);
  }
}

function buildSet(seed, subjects) {
  const selectedSubjects = SUBJECTS.filter(s => subjects.includes(s));
  const plannedCounts = calculateSubjectCounts(selectedSubjects);
  validatePools(plannedCounts);

  const rng = rngFor(`${seed}|${subjectSignature(selectedSubjects)}`);
  const picked = [];

  Object.entries(plannedCounts).forEach(([subject, count]) => {
    const pool = QUESTIONS.filter(q => q.subject === subject);
    picked.push(...shuffle(pool, rng).slice(0, count));
  });

  return {
    questions: shuffle(picked, rng),
    plannedCounts
  };
}

function startAttempt(seed, subjects = getSelectedSubjects()) {
  const setSeed = normalizeSeed(seed);
  const selectedSubjects = SUBJECTS.filter(s => subjects.includes(s));
  const built = buildSet(setSeed, selectedSubjects);

  state = {
    seed: setSeed,
    selectedSubjects,
    plannedCounts: built.plannedCounts,
    startedAt: new Date().toISOString(),
    submittedAt: null,
    deadline: Date.now() + TIME_LIMIT_SECONDS * 1000,
    currentIndex: 0,
    questions: built.questions,
    answers: {},
    submitted: false,
    timerId: null
  };

  saveCurrent();
  updateShareUrl();
  showQuiz();
  startTimer();
}

function saveCurrent() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({...state, timerId: null}));
}

function loadCurrent() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY) || localStorage.getItem(LEGACY_HISTORY_KEY) || "[]";
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

function writeHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function formatTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function startTimer() {
  clearInterval(state.timerId);
  tick();
  state.timerId = setInterval(tick, 250);
}

function tick() {
  const remaining = Math.ceil((state.deadline - Date.now()) / 1000);
  $("timerLabel").textContent = formatTime(remaining);
  $("timerLabel").parentElement.classList.toggle("timer-low", remaining <= 120);
  if (!state.submitted && remaining <= 0) submitQuiz(true);
}

function showStart() {
  clearInterval(state.timerId);
  $("startScreen").classList.remove("hidden");
  $("quizScreen").classList.add("hidden");
  $("resultsScreen").classList.add("hidden");
  $("timerLabel").textContent = "30:00";
  $("timerLabel").parentElement.classList.remove("timer-low");
  const saved = loadCurrent();
  $("resumeBtn").classList.toggle("hidden", !saved || saved.submitted || saved.deadline <= Date.now());
  updateStartStats();
  updateSubjectPlanDisplay();
}

function showQuiz() {
  $("startScreen").classList.add("hidden");
  $("quizScreen").classList.remove("hidden");
  $("resultsScreen").classList.add("hidden");
  $("setCodeLabel").textContent = `${state.seed} • ${subjectSignature(state.selectedSubjects)}`;
  renderActiveSubjects();
  renderNav();
  renderQuestion();
}

function showResults() {
  clearInterval(state.timerId);
  $("startScreen").classList.add("hidden");
  $("quizScreen").classList.add("hidden");
  $("resultsScreen").classList.remove("hidden");
  renderResults();
}

function answerFor(question) {
  return state.answers[question.id] || [];
}

function setAnswer(question, value) {
  if (state.submitted) return;
  if (question.type === "multi") {
    const current = new Set(answerFor(question));
    current.has(value) ? current.delete(value) : current.add(value);
    state.answers[question.id] = [...current].sort();
  } else {
    state.answers[question.id] = [value];
  }
  saveCurrent();
  renderChoices(question);
  renderNav();
  updateAnsweredCount();
}

function isAnswered(question) { return answerFor(question).length > 0; }

function isCorrect(question) {
  const a = answerFor(question).slice().sort().join(",");
  const c = question.correct.slice().sort().join(",");
  return a === c;
}

function renderQuestion() {
  const q = state.questions[state.currentIndex];
  $("questionCounter").textContent = `Question ${state.currentIndex + 1} of ${state.questions.length}`;
  $("subjectBadge").textContent = q.subject;
  $("topicBadge").textContent = q.topic;
  $("typeBadge").textContent = q.type === "multi" ? "Multi-select" : (q.type === "tf" ? "True / False" : "Multiple Choice");
  $("questionStem").textContent = q.stem;
  renderChoices(q);
  renderNav();
  updateAnsweredCount();
  $("prevBtn").disabled = state.currentIndex === 0;
  $("nextBtn").textContent = state.currentIndex === state.questions.length - 1 ? "Last Question" : "Next";
}

function renderChoices(q) {
  const selected = new Set(answerFor(q));
  $("choices").innerHTML = "";
  q.choices.forEach(choice => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice";
    const chosen = selected.has(choice.letter);
    if (chosen) btn.classList.add("selected");
    if (state.submitted) {
      const correct = q.correct.includes(choice.letter);
      if (correct) btn.classList.add("correct-choice");
      if (chosen && !correct) btn.classList.add("wrong-choice");
    }
    btn.innerHTML = `<span class="choice-letter">${choice.letter}</span><span class="choice-text"></span>`;
    btn.querySelector(".choice-text").textContent = choice.text;
    btn.addEventListener("click", () => setAnswer(q, choice.letter));
    $("choices").appendChild(btn);
  });
}

function renderNav() {
  $("questionNav").innerHTML = "";
  state.questions.forEach((q, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-dot";
    btn.textContent = idx + 1;
    btn.title = `${idx + 1}. ${q.subject}`;
    if (idx === state.currentIndex) btn.classList.add("current");
    if (isAnswered(q)) btn.classList.add("answered");
    if (state.submitted) btn.classList.add(isCorrect(q) ? "correct" : "wrong");
    btn.addEventListener("click", () => { state.currentIndex = idx; renderQuestion(); saveCurrent(); });
    $("questionNav").appendChild(btn);
  });
}

function renderActiveSubjects() {
  $("activeSubjects").innerHTML = "";
  Object.entries(state.plannedCounts).forEach(([subject, count]) => {
    const pill = document.createElement("span");
    pill.textContent = `${subject} ${count}`;
    $("activeSubjects").appendChild(pill);
  });
}

function updateAnsweredCount() {
  const answered = state.questions.filter(isAnswered).length;
  $("answeredCount").textContent = answered;
}

function nextQuestion() {
  if (state.currentIndex < state.questions.length - 1) {
    state.currentIndex += 1;
    saveCurrent();
    renderQuestion();
  }
}

function prevQuestion() {
  if (state.currentIndex > 0) {
    state.currentIndex -= 1;
    saveCurrent();
    renderQuestion();
  }
}

function submitQuiz(auto = false) {
  if (state.submitted) return;
  if (!auto) {
    const unanswered = state.questions.filter(q => !isAnswered(q)).length;
    if (unanswered && !confirm(`${unanswered} unanswered. Submit anyway?`)) return;
  }
  state.submitted = true;
  state.submittedAt = new Date().toISOString();
  saveCurrent();
  saveHistory();
  showResults();
}

function scoreSummary() {
  const correct = state.questions.filter(isCorrect).length;
  const bySubject = {};
  state.questions.forEach(q => {
    bySubject[q.subject] ||= { correct: 0, total: 0 };
    bySubject[q.subject].total += 1;
    if (isCorrect(q)) bySubject[q.subject].correct += 1;
  });
  return { correct, total: state.questions.length, bySubject };
}

function renderResults() {
  const score = scoreSummary();
  $("timerLabel").textContent = "00:00";
  $("finalRecord").textContent = `${score.correct}–${score.total - score.correct}`;
  $("finalPercent").textContent = `${Math.round((score.correct / score.total) * 100)}% correct • ${state.seed}`;
  $("breakdown").innerHTML = "";

  SUBJECTS.forEach(subject => {
    const s = score.bySubject[subject];
    if (!s) return;
    const pct = Math.round((s.correct / s.total) * 100);
    const row = document.createElement("div");
    row.className = "break-row";
    row.innerHTML = `<div><strong>${subject}</strong><span>${s.correct} correct / ${s.total} total</span></div><strong>${pct}%</strong>`;
    $("breakdown").appendChild(row);
  });

  $("resultsAllTimeStats").innerHTML = renderAllTimeStatsHtml(readHistory(), true);
  $("reviewArea").innerHTML = "";
}

function renderReview(onlyMissed = true) {
  $("reviewArea").innerHTML = "";
  const list = state.questions.filter(q => !onlyMissed || !isCorrect(q));
  if (!list.length) {
    $("reviewArea").innerHTML = `<div class="review-card correct"><h3>Clean sheet.</h3><p>No missed questions on this set.</p></div>`;
    return;
  }
  list.forEach((q, idx) => {
    const card = document.createElement("article");
    card.className = `review-card ${isCorrect(q) ? "correct" : "wrong"}`;
    const selected = answerFor(q).join(",") || "blank";
    const correct = q.correct.join(",");
    card.innerHTML = `<h3>${idx + 1}. ${q.id} • ${q.subject} • ${q.topic}</h3>
      <p>${escapeHtml(q.stem).replace(/\n/g, "<br>")}</p>
      <p class="answer-line">Your answer: ${escapeHtml(selected)}<br>Correct: ${escapeHtml(correct)}</p>
      <p>${escapeHtml(q.rationale)}</p>`;
    $("reviewArea").appendChild(card);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'}[ch]));
}

function attemptPayload() {
  const score = scoreSummary();
  return {
    app: "TEAS 7 30-Minute Challenge",
    version: 2,
    seed: state.seed,
    selectedSubjects: state.selectedSubjects,
    plannedCounts: state.plannedCounts,
    startedAt: state.startedAt,
    submittedAt: state.submittedAt,
    score: { correct: score.correct, total: score.total, percent: Math.round((score.correct / score.total) * 100) },
    subjectBreakdown: score.bySubject,
    answers: state.questions.map((q, idx) => ({
      number: idx + 1,
      id: q.id,
      subject: q.subject,
      topic: q.topic,
      type: q.type,
      selected: answerFor(q),
      correct: q.correct,
      isCorrect: isCorrect(q)
    }))
  };
}

function copyResults() {
  const payload = attemptPayload();
  const text = `Grade/review this TEAS 7 practice set. Give weak topics, error patterns, and a short study plan.\n\n${JSON.stringify(payload, null, 2)}`;
  navigator.clipboard?.writeText(text).then(() => alert("Results copied. Paste them into ChatGPT."), () => fallbackCopy(text));
}

function fallbackCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  document.body.removeChild(area);
  alert("Results copied. Paste them into ChatGPT.");
}

function downloadResults() {
  const blob = new Blob([JSON.stringify(attemptPayload(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `teas7-attempt-${state.seed}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function saveHistory() {
  const history = readHistory();
  history.unshift(attemptPayload());
  writeHistory(history.slice(0, 500));
}

function aggregateHistory(history) {
  const totals = {
    attempts: history.length,
    questions: 0,
    correct: 0,
    bySubject: Object.fromEntries(SUBJECTS.map(s => [s, { correct: 0, total: 0 }]))
  };

  history.forEach(attempt => {
    const score = attempt.score || {};
    totals.questions += Number(score.total || 0);
    totals.correct += Number(score.correct || 0);
    const breakdown = attempt.subjectBreakdown || {};
    SUBJECTS.forEach(subject => {
      const row = breakdown[subject];
      if (!row) return;
      totals.bySubject[subject].correct += Number(row.correct || 0);
      totals.bySubject[subject].total += Number(row.total || 0);
    });
  });

  return totals;
}

function renderAllTimeStatsHtml(history, includeTitle = false) {
  const totals = aggregateHistory(history);
  if (!totals.attempts) {
    return `<div class="alltime-empty">No saved stats yet. Finish a test and this will show your weak subjects.</div>`;
  }

  const overallPct = totals.questions ? Math.round((totals.correct / totals.questions) * 100) : 0;
  const subjectRows = SUBJECTS.map(subject => {
    const row = totals.bySubject[subject];
    const pct = row.total ? Math.round((row.correct / row.total) * 100) : null;
    const label = pct === null ? "No data" : `${pct}% • ${row.correct}/${row.total}`;
    return `<div class="mini-break"><span>${subject}</span><strong>${label}</strong></div>`;
  }).join("");

  const testedSubjects = SUBJECTS
    .map(subject => ({ subject, ...totals.bySubject[subject] }))
    .filter(row => row.total > 0)
    .sort((a, b) => (a.correct / a.total) - (b.correct / b.total));

  const weakest = testedSubjects.length ? testedSubjects[0].subject : "Not enough data";
  const title = includeTitle ? `<h3>All-time stats</h3>` : "";

  return `${title}
    <div class="alltime-summary">
      <div><strong>${totals.attempts}</strong><span>attempts</span></div>
      <div><strong>${overallPct}%</strong><span>overall</span></div>
      <div><strong>${weakest}</strong><span>focus next</span></div>
    </div>
    <div class="mini-breakdown">${subjectRows}</div>`;
}

function updateStartStats() {
  const history = readHistory();
  $("attemptsStat").textContent = history.length;
  $("allTimeStats").innerHTML = renderAllTimeStatsHtml(history, true);
}

function newSet() {
  localStorage.removeItem(STORAGE_KEY);
  const newSeed = makeSeed();
  $("seedInput").value = newSeed;
  updateShareUrl();
  startAttempt(newSeed, state.selectedSubjects && state.selectedSubjects.length ? state.selectedSubjects : getSelectedSubjects());
}

function clearStats() {
  if (!confirm("Clear all saved TEAS stats on this device?")) return;
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(LEGACY_HISTORY_KEY);
  updateStartStats();
}

function changeSubjects() {
  localStorage.removeItem(STORAGE_KEY);
  const active = state.selectedSubjects && state.selectedSubjects.length ? state.selectedSubjects : getSelectedSubjects();
  document.querySelectorAll("#subjectSelector input").forEach(input => {
    input.checked = active.includes(input.value);
  });
  showStart();
}

function applySeedAndSubjectsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const seed = params.get("seed");
  const subjectsParam = params.get("subjects");
  $("seedInput").value = seed ? normalizeSeed(seed) : makeSeed();

  if (subjectsParam) {
    const wanted = subjectsParam.split(",").map(s => s.trim()).filter(Boolean);
    document.querySelectorAll("#subjectSelector input").forEach(input => {
      input.checked = wanted.includes(input.value);
    });
    if (!getSelectedSubjects().length) setAllSubjects(true);
  }
}

function updateShareUrl() {
  const seed = normalizeSeed($("seedInput").value);
  const subjects = getSelectedSubjects();
  const url = new URL(window.location.href);
  url.searchParams.set("seed", seed);
  url.searchParams.set("subjects", subjects.join(","));
  history.replaceState(null, "", url.toString());
}

function setAllSubjects(checked) {
  document.querySelectorAll("#subjectSelector input").forEach(input => input.checked = checked);
  updateSubjectPlanDisplay();
  updateShareUrl();
}

function updateSubjectPlanDisplay() {
  let subjects = getSelectedSubjects();
  if (!subjects.length) subjects = [...SUBJECTS];
  const counts = calculateSubjectCounts(subjects);

  SUBJECTS.forEach(subject => {
    const el = $(`count${subject}`);
    if (!el) return;
    const count = counts[subject] || 0;
    el.textContent = count ? `${count} questions` : "Off";
  });

  const planText = Object.entries(counts).map(([subject, count]) => `${subject} ${count}`).join(" • ");
  $("subjectPlanText").textContent = `This test will generate: ${planText}.`;
}

window.addEventListener("DOMContentLoaded", () => {
  applySeedAndSubjectsFromUrl();
  updateSubjectPlanDisplay();

  $("randomSeedBtn").addEventListener("click", () => { $("seedInput").value = makeSeed(); updateShareUrl(); });
  $("seedInput").addEventListener("change", updateShareUrl);
  $("allSubjectsBtn").addEventListener("click", () => setAllSubjects(true));

  document.querySelectorAll("#subjectSelector input").forEach(input => {
    input.addEventListener("change", () => {
      if (!getSelectedSubjects().length) input.checked = true;
      updateSubjectPlanDisplay();
      updateShareUrl();
    });
  });

  $("startBtn").addEventListener("click", () => { updateShareUrl(); startAttempt($("seedInput").value, getSelectedSubjects()); });
  $("resumeBtn").addEventListener("click", () => {
    const saved = loadCurrent();
    if (saved) { state = saved; showQuiz(); startTimer(); }
  });
  $("prevBtn").addEventListener("click", prevQuestion);
  $("nextBtn").addEventListener("click", nextQuestion);
  $("submitBtn").addEventListener("click", () => submitQuiz(false));
  $("reviewMissedBtn").addEventListener("click", () => renderReview(true));
  $("copyResultsBtn").addEventListener("click", copyResults);
  $("downloadResultsBtn").addEventListener("click", downloadResults);
  $("newSetBtn").addEventListener("click", newSet);
  $("changeSubjectsBtn").addEventListener("click", changeSubjects);
  $("clearStatsBtn").addEventListener("click", clearStats);

  document.addEventListener("keydown", (e) => {
    if ($("quizScreen").classList.contains("hidden") || state.submitted) return;
    const q = state.questions[state.currentIndex];
    const key = e.key.toUpperCase();
    if (["A","B","C","D","E","F"].includes(key) && q.choices.some(c => c.letter === key)) setAnswer(q, key);
    if (e.key === "Enter") nextQuestion();
    if (e.key === "ArrowRight") nextQuestion();
    if (e.key === "ArrowLeft") prevQuestion();
  });

  showStart();
});
