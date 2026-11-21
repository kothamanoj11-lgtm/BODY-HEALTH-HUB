/* BodyBlueprint — HealthHub
   All biometric data is stored in METRIC (kg, cm, ml); units are converted only for display. */
'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
// Auth guard: only signed-in users may see the dashboard
const USER = localStorage.getItem('bb.session');
if (!USER) { location.replace('login.html'); throw new Error('Not signed in'); }
const KEY = 'bodyblueprint.v1.' + USER.toLowerCase(); // each account has its own data
const WELCOME_KEY = 'bodyblueprint.welcomed.' + USER.toLowerCase();

/* ---------- 1. STATE & STORAGE ---------- */
const defaults = {
  profile: { height: 175, weight: 72, age: 28, sex: 'male', units: 'metric', activity: 1.375, goal: 'maintain' },
  logs: {} // { 'YYYY-MM-DD': { water, bed, wake, sleepH, rating, weight } }
};
let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.profile && s.logs) return s;
  } catch (e) { /* ignore */ }
  return JSON.parse(JSON.stringify(defaults));
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ }
}
const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function today() {
  const k = dateKey();
  if (!state.logs[k]) state.logs[k] = { water: 0, bed: '', wake: '', sleepH: 0, rating: 0, weight: state.profile.weight };
  return state.logs[k];
}

/* ---------- 2. FORMULAS ---------- */
const calcBMI = (kg, cm) => kg / Math.pow(cm / 100, 2);
// Mifflin-St Jeor
const calcBMR = (kg, cm, age, sex) => 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161);
const waterGoal = (kg) => Math.round((kg * 35) / 50) * 50; // ~35 ml per kg, rounded to 50

function whoCategory(bmi) {
  if (bmi < 18.5) return { name: 'Underweight', color: '#4da6ff' };
  if (bmi < 25) return { name: 'Normal', color: '#2dffa0' };
  if (bmi < 30) return { name: 'Overweight', color: '#ffc23d' };
  return { name: 'Obese', color: '#ff4d6d' };
}

// Unit conversions (display layer only)
const KG_LB = 2.20462, CM_IN = 0.393701;
const isImp = () => state.profile.units === 'imperial';
const dispH = (cm) => (isImp() ? cm * CM_IN : cm);
const dispW = (kg) => (isImp() ? kg * KG_LB : kg);
const round1 = (n) => Math.round(n * 10) / 10;

/* ---------- 3. SUB-SCORES (each normalised to 0-100) ---------- */
function bmiScore(bmi) {
  if (bmi >= 18.5 && bmi < 25) return 100;
  const dist = bmi < 18.5 ? 18.5 - bmi : bmi - 24.9;
  return Math.max(0, 100 - dist * 12);
}
function hydrationScore(ml, goal) { return Math.min(100, (ml / goal) * 100); }
function sleepScore(h, rating) {
  if (!h) return 0;
  let dur = h >= 7 && h <= 9 ? 100 : h < 7 ? 100 - (7 - h) * 20 : 100 - (h - 9) * 15;
  dur = Math.max(0, dur);
  return rating ? dur * 0.85 + (rating / 5) * 100 * 0.15 : dur * 0.85;
}
function computeScores() {
  const p = state.profile, t = today();
  const bmi = calcBMI(p.weight, p.height);
  const s = {
    bmi: bmiScore(bmi),
    water: hydrationScore(t.water, waterGoal(p.weight)),
    sleep: sleepScore(t.sleepH, t.rating)
  };
  s.total = Math.round(s.bmi * 0.30 + s.water * 0.35 + s.sleep * 0.35);
  return s;
}
function scoreLabel(n) {
  if (n >= 85) return ['Optimal Balance', '#2dffa0'];
  if (n >= 70) return ['Good Progress', '#00f0ff'];
  if (n >= 50) return ['Room to Improve', '#ffc23d'];
  return ['Needs Attention', '#ff4d6d'];
}

/* ---------- 4. RENDERING ---------- */
function polar(cx, cy, r, t) { // t: 0 (left) → 1 (right)
  return [cx - r * Math.cos(Math.PI * t), cy - r * Math.sin(Math.PI * t)];
}
function arc(t0, t1, r, color) {
  const [x0, y0] = polar(110, 110, r, t0), [x1, y1] = polar(110, 110, r, t1);
  return `<path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" stroke="${color}" stroke-width="14" fill="none" opacity=".9"/>`;
}
function buildGauge() {
  const MIN = 10, MAX = 40, f = (v) => (v - MIN) / (MAX - MIN);
  $('#gauge').innerHTML =
    arc(0, f(18.5), 88, '#4da6ff') + arc(f(18.5), f(25), 88, '#2dffa0') +
    arc(f(25), f(30), 88, '#ffc23d') + arc(f(30), 1, 88, '#ff4d6d') +
    `<g id="needle"><line x1="110" y1="110" x2="110" y2="34" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
     <circle cx="110" cy="110" r="7" fill="#05060f" stroke="#00f0ff" stroke-width="3"/></g>`;
  $('#needle').style.transform = 'rotate(-90deg)';
}
function setNeedle(bmi) {
  const t = Math.min(1, Math.max(0, (bmi - 10) / 30));
  requestAnimationFrame(() => ($('#needle').style.transform = `rotate(${t * 180 - 90}deg)`));
}

function countTo(el, to, ms = 1000) {
  const from = parseInt(el.textContent) || 0, t0 = performance.now();
  (function step(now) {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

function renderProfile() {
  const p = state.profile;
  $('#hUnit').textContent = isImp() ? 'in' : 'cm';
  $('#wUnit').textContent = isImp() ? 'lb' : 'kg';
  $('#height').value = round1(dispH(p.height));
  $('#weight').value = round1(dispW(p.weight));
  $('#age').value = p.age;
  $('#sex').value = p.sex;
  $('#activity').value = p.activity;
  $('#goal').value = p.goal;
  $('#unitMetric').classList.toggle('active', !isImp());
  $('#unitImperial').classList.toggle('active', isImp());

  const bmi = calcBMI(p.weight, p.height), cat = whoCategory(bmi);
  $('#bmiVal').textContent = bmi.toFixed(1);
  $('#bmiCat').textContent = cat.name;
  $('#bmiCat').style.color = cat.color;
  $('#bmrVal').textContent = Math.round(calcBMR(p.weight, p.height, p.age, p.sex)).toLocaleString();
  $('#goalVal').textContent = waterGoal(p.weight).toLocaleString();
  setNeedle(bmi);
}

function renderWater() {
  const goal = waterGoal(state.profile.weight), ml = today().water;
  const pct = Math.min(100, Math.round((ml / goal) * 100));
  $('#waterFill').style.height = pct + '%';
  $('#waterPct').textContent = pct + '%';
  $('#waterVal').textContent = ml.toLocaleString();
  $('#waterGoal').textContent = goal.toLocaleString();
}

function renderSleep() {
  const t = today();
  if (t.bed) $('#bed').value = t.bed;
  if (t.wake) $('#wake').value = t.wake;
  $('#sleepTotal').textContent = (t.sleepH || 0).toFixed(1) + ' h';
  $$('#stars button').forEach((b) => b.classList.toggle('on', +b.dataset.star <= t.rating));
}

function renderScore() {
  const s = computeScores(), [label, color] = scoreLabel(s.total);
  $('#ringFg').style.strokeDashoffset = 364.4 * (1 - s.total / 100);
  countTo($('#scoreNum'), s.total);
  $('#scoreLabel').textContent = `${s.total}/100 — ${label}`;
  $('#scoreLabel').style.color = color;
  $('#barBmi').style.width = s.bmi + '%';
  $('#barWater').style.width = s.water + '%';
  $('#barSleep').style.width = s.sleep + '%';
}

/* ---------- 5. ADVICE ENGINE ---------- */
function buildAdvice() {
  const p = state.profile, t = today(), s = computeScores();
  const bmi = calcBMI(p.weight, p.height), tips = [];
  const waterOK = s.water >= 85, sleepOK = t.sleepH >= 7 && t.sleepH <= 9, sleepLogged = t.sleepH > 0;

  if (sleepLogged && t.sleepH < 7 && !waterOK)
    tips.push(['bad', 'Sleep + Hydration', 'Sleep deficit detected: increase water intake to offset fatigue, and aim for an earlier bedtime tonight.']);
  else if (sleepLogged && t.sleepH < 7)
    tips.push(['warn', 'Sleep', `You slept ${t.sleepH.toFixed(1)} h. Adults generally benefit from 7–9 h; try a consistent wind-down routine.`]);
  else if (!sleepLogged)
    tips.push(['warn', 'Sleep', 'No sleep logged today. Log bedtime and wake time to complete your index.']);
  if (sleepLogged && t.sleepH > 9)
    tips.push(['warn', 'Sleep', 'Sleeping over 9 h regularly may reflect low sleep quality; consider a steadier schedule.']);

  if (!waterOK && !(sleepLogged && t.sleepH < 7))
    tips.push(['warn', 'Hydration', `You're at ${Math.round(s.water)}% of your water goal. Sip regularly through the day.`]);
  if (t.rating && t.rating <= 2)
    tips.push(['warn', 'Restfulness', 'Low restfulness rating: limit screens and caffeine late in the day.']);

  if (bmi < 18.5)
    tips.push(['warn', 'Body composition', 'BMI is in the underweight band. Balanced, nutrient-dense meals can help; consider speaking to a clinician.']);
  else if (bmi >= 30)
    tips.push(['bad', 'Body composition', 'BMI is in the obese band. Gradual activity and balanced eating are WHO-recommended first steps; consult a clinician.']);
  else if (bmi >= 25)
    tips.push(['warn', 'Body composition', 'BMI is in the overweight band. Aim for 150 min/week of moderate activity (WHO).']);

  if (waterOK && sleepOK)
    tips.unshift(['good', 'All targets met', 'Hydration and sleep targets met! Maintain physical activity to match BMR baseline.']);

  $('#adviceList').innerHTML = tips
    .map(([cls, h, txt], i) => `<div class="adv ${cls}" style="animation-delay:${i * 0.08}s"><b>${h}</b>${txt}</div>`).join('');
}

/* ---------- 6. CALORIES ---------- */
function renderCalories() {
  const p = state.profile;
  const tdee = calcBMR(p.weight, p.height, p.age, p.sex) * p.activity;
  const adj = { cut: -500, maintain: 0, bulk: 300 }[p.goal];
  $('#tdeeVal').textContent = Math.round(tdee).toLocaleString();
  $('#calVal').textContent = Math.round(tdee + adj).toLocaleString();
}

/* ---------- 7. CHART ---------- */
let chart;
function last7() {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = dateKey(d), l = state.logs[k];
    out.push({
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      sleep: l && l.sleepH ? +l.sleepH.toFixed(1) : null,
      water: l && l.water ? +(l.water / 1000).toFixed(2) : null,
      weight: l && l.weight ? round1(dispW(l.weight)) : null
    });
  }
  return out;
}
function renderChart() {
  const note = $('#chartNote');
  if (typeof Chart === 'undefined') { note.textContent = 'Chart.js could not load (check your internet connection).'; return; }
  const d = last7();
  const data = {
    labels: d.map((x) => x.label),
    datasets: [
      { label: 'Sleep (h)', data: d.map((x) => x.sleep), borderColor: '#a855ff', backgroundColor: '#a855ff', tension: .4, yAxisID: 'y', spanGaps: true },
      { label: 'Water (L)', data: d.map((x) => x.water), borderColor: '#00f0ff', backgroundColor: '#00f0ff', tension: .4, yAxisID: 'y', spanGaps: true },
      { label: `Weight (${isImp() ? 'lb' : 'kg'})`, data: d.map((x) => x.weight), borderColor: '#ffc23d', backgroundColor: '#ffc23d', borderDash: [6, 4], tension: .4, yAxisID: 'y1', spanGaps: true }
    ]
  };
  const grid = { color: 'rgba(120,160,255,.12)' }, tick = { color: '#8b93b8' };
  const options = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: '#e8ecff' } } },
    scales: {
      x: { grid, ticks: tick },
      y: { position: 'left', grid, ticks: tick, title: { display: true, text: 'Hours / Litres', color: '#8b93b8' }, suggestedMin: 0, suggestedMax: 10 },
      y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: tick, title: { display: true, text: 'Weight', color: '#8b93b8' } }
    }
  };
  if (chart) { chart.data = data; chart.options = options; chart.update(); }
  else chart = new Chart($('#trendChart'), { type: 'line', data, options });
  note.textContent = d.some((x) => x.sleep || x.water) ? '' : 'No data yet — log today or load the 14-day sample.';
}

/* ---------- 8. MASTER RENDER ---------- */
function renderAll() {
  renderProfile(); renderWater(); renderSleep(); renderScore(); buildAdvice(); renderCalories(); renderChart();
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------- 9. EVENTS ---------- */
// Profile form (convert displayed units back to metric before storing)
$('#profileForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const h = parseFloat($('#height').value), w = parseFloat($('#weight').value);
  state.profile.height = round1(isImp() ? h / CM_IN : h);
  state.profile.weight = round1(isImp() ? w / KG_LB : w);
  state.profile.age = parseInt($('#age').value);
  state.profile.sex = $('#sex').value;
  today().weight = state.profile.weight;
  save(); renderAll(); toast('Metrics updated');
});
$('#unitMetric').onclick = () => { state.profile.units = 'metric'; save(); renderAll(); };
$('#unitImperial').onclick = () => { state.profile.units = 'imperial'; save(); renderAll(); };

// Water
function snapshot() { return { water: today().water, score: computeScores().total }; }
function addWater(ml) {
  const prev = snapshot(), t = today();
  t.water = Math.max(0, t.water + ml);
  save(); renderWater(); renderScore(); buildAdvice(); renderChart();
  if (ml > 0) { const r = $('#waterFill').getBoundingClientRect(); burst(r.left + r.width / 2, r.top, 18, ['#00f0ff', '#4d7cff']); }
  checkMilestones(prev);
}
$$('[data-water]').forEach((b) => b.addEventListener('click', () => addWater(parseInt(b.dataset.water))));
$('.glass').addEventListener('click', () => addWater(250)); // tap the glass to sip
$('.glass').style.cursor = 'pointer';
$('#waterReset').onclick = () => { today().water = 0; save(); renderWater(); renderScore(); buildAdvice(); renderChart(); };

// Sleep
function sleepHours(bed, wake) {
  if (!bed || !wake) return 0;
  const [bh, bm] = bed.split(':').map(Number), [wh, wm] = wake.split(':').map(Number);
  let mins = wh * 60 + wm - (bh * 60 + bm);
  if (mins <= 0) mins += 1440; // crosses midnight
  return mins / 60;
}
['#bed', '#wake'].forEach((id) => $(id).addEventListener('input', () => {
  $('#sleepTotal').textContent = sleepHours($('#bed').value, $('#wake').value).toFixed(1) + ' h';
}));
$$('#stars button').forEach((b) => b.addEventListener('click', () => {
  today().rating = +b.dataset.star; renderSleep();
}));
$('#sleepSave').onclick = () => {
  const prev = snapshot(), t = today();
  t.bed = $('#bed').value; t.wake = $('#wake').value;
  t.sleepH = sleepHours(t.bed, t.wake);
  save(); renderSleep(); renderScore(); buildAdvice(); renderChart();
  const h = t.sleepH, ok = h >= 7 && h <= 9;
  openModal(ok ? '🌙 Sleep logged' : '🌙 Sleep logged — below target',
    `<div class="m-big">${h.toFixed(1)} h</div><p>${ok
      ? 'Great — that is inside the recommended 7–9 hour window.'
      : h < 7 ? 'That is under the 7-hour minimum. Try moving bedtime earlier and drink water through the day to offset fatigue.'
        : 'That is over 9 hours. A steadier schedule may improve sleep quality.'}</p>`);
  if (ok) burst(innerWidth / 2, innerHeight / 3, 50, ['#a855ff', '#00f0ff']);
  setTimeout(() => checkMilestones(prev), 400);
};

// Calories
$('#activity').onchange = (e) => { state.profile.activity = parseFloat(e.target.value); save(); renderCalories(); };
$('#goal').onchange = (e) => { state.profile.goal = e.target.value; save(); renderCalories(); };

// Sample data (14 days)
const SAMPLE = {
  sleep:  [6.0, 7.5, 5.5, 8.0, 6.5, 7.0, 5.0, 7.5, 8.0, 6.0, 7.0, 6.5, 7.5, 6.0],
  water:  [1500, 2200, 1200, 2600, 1800, 2000, 1000, 2400, 2700, 1600, 2100, 1900, 2300, 1700],
  weight: [72.6, 72.5, 72.8, 72.4, 72.6, 72.5, 72.9, 72.4, 72.3, 72.6, 72.4, 72.5, 72.3, 72.4],
  rating: [3, 4, 2, 5, 3, 4, 2, 4, 5, 3, 4, 3, 4, 3]
};
function loadSample() {
  for (let i = 0; i < 14; i++) {
    const d = new Date(); d.setDate(d.getDate() - (14 - i));
    const wake = 7 * 60, bed = (wake - SAMPLE.sleep[i] * 60 + 1440) % 1440;
    const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
    state.logs[dateKey(d)] = { water: SAMPLE.water[i], bed: hm(bed), wake: hm(wake), sleepH: SAMPLE.sleep[i], rating: SAMPLE.rating[i], weight: SAMPLE.weight[i] };
  }
  save(); renderAll(); toast('Loaded 14 days of sample data');
}
$('#sampleBtn').onclick = loadSample;

// Demo: low score → high score
$('#demoBtn').onclick = () => {
  Object.assign(state.profile, { height: 175, weight: 72, age: 28, sex: 'male' });
  const t = today();
  Object.assign(t, { water: 800, bed: '00:30', wake: '06:00', sleepH: 5.5, rating: 2, weight: 72 });
  renderAll(); toast('Step 1: low water + short sleep');
  setTimeout(() => {
    Object.assign(t, { water: 2200, bed: '23:00', wake: '06:30', sleepH: 7.5, rating: 4 });
    save(); renderAll(); toast('Step 2: hydration + sleep targets met!');
    setTimeout(() => showScorePopup(true), 900);
  }, 3200);
};

// Reminders
let remindTimer = null;
$('#remindBtn').onclick = async () => {
  if (remindTimer) {
    clearInterval(remindTimer); remindTimer = null;
    $('#remindBtn').textContent = '🔔 Hydration reminders: Off'; return;
  }
  if (!('Notification' in window)) return toast('Notifications not supported in this browser');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return toast('Notification permission denied');
  remindTimer = setInterval(() => {
    const h = new Date().getHours();
    if (h >= 8 && h < 21) new Notification('💧 Time to hydrate', { body: 'Drink a glass of water — log it in BodyBlueprint.' });
  }, 90 * 60 * 1000);
  new Notification('💧 Reminders on', { body: "We'll nudge you every 90 minutes." });
  $('#remindBtn').textContent = '🔔 Hydration reminders: On';
};

// Doctor summary (print → Save as PDF)
$('#exportBtn').onclick = () => {
  const p = state.profile, bmi = calcBMI(p.weight, p.height);
  const rows = Object.keys(state.logs).sort().slice(-7).map((k) => {
    const l = state.logs[k];
    return `<tr><td>${k}</td><td>${(l.sleepH || 0).toFixed(1)}</td><td>${l.rating || '-'}</td><td>${l.water || 0}</td><td>${l.weight || '-'}</td></tr>`;
  }).join('');
  $('#printSheet').innerHTML = `
    <h1>BodyBlueprint — Personal Health Summary</h1>
    <div>Generated: ${new Date().toLocaleString()}</div>
    <table><tr><th>Height</th><th>Weight</th><th>Age</th><th>Sex</th><th>BMI (WHO)</th><th>BMR</th><th>Water goal</th></tr>
    <tr><td>${p.height} cm</td><td>${p.weight} kg</td><td>${p.age}</td><td>${p.sex}</td>
    <td>${bmi.toFixed(1)} (${whoCategory(bmi).name})</td>
    <td>${Math.round(calcBMR(p.weight, p.height, p.age, p.sex))} kcal</td><td>${waterGoal(p.weight)} ml</td></tr></table>
    <h3>Last 7 logged days</h3>
    <table><tr><th>Date</th><th>Sleep (h)</th><th>Restfulness (1-5)</th><th>Water (ml)</th><th>Weight (kg)</th></tr>${rows}</table>
    <p>Wellness Index today: ${computeScores().total}/100. Self-reported data for educational purposes only; not a medical diagnosis.</p>`;
  window.print();
};

$('#clearBtn').onclick = () => {
  if (!confirm('Delete all saved data?')) return;
  localStorage.removeItem(KEY); state = JSON.parse(JSON.stringify(defaults)); renderAll(); toast('Data cleared');
};

/* ---------- 10. POP-UP WINDOWS ---------- */
let modalActions = [];
function openModal(title, html, actions = [['Got it', null]]) {
  $('#mTitle').textContent = title;
  $('#mBody').innerHTML = html;
  $('#mActions').innerHTML = '';
  actions.forEach(([label, fn], i) => {
    const b = document.createElement('button');
    b.className = 'btn' + (i ? ' ghost' : ''); b.textContent = label;
    b.onclick = () => { closeModal(); if (fn) fn(); };
    $('#mActions').appendChild(b);
  });
  $('#modalBack').classList.add('open');
}
function closeModal() { $('#modalBack').classList.remove('open'); }
$('#modalX').onclick = closeModal;
$('#modalBack').addEventListener('click', (e) => { if (e.target.id === 'modalBack') closeModal(); });

function showScorePopup(celebrate) {
  const s = computeScores(), [label, color] = scoreLabel(s.total);
  const row = (n, v, w) => `<div class="m-row"><span>${n} <b>${w}</b></span><div class="bar"><i style="width:${v}%"></i></div><em>${Math.round(v)}</em></div>`;
  openModal(celebrate ? '⚡ Wellness boost!' : 'Wellness breakdown',
    `<div class="m-big" style="color:${color}">${s.total}<small>/100</small></div>
     <div class="m-sub" style="color:${color}">${label}</div>
     ${row('BMI stability', s.bmi, '30%')}${row('Hydration', s.water, '35%')}${row('Sleep', s.sleep, '35%')}
     <p class="m-note">Each metric is normalised to 0–100 then combined with the weights above.</p>`);
  if (celebrate) burst(innerWidth / 2, innerHeight / 2.5, 120);
}

// Achievement pop-ups: fire once per day per milestone
function checkMilestones(prev) {
  const now = snapshot(), goal = waterGoal(state.profile.weight), seen = (state.flags = state.flags || {});
  const fire = (id, fn) => { const k = dateKey() + id; if (!seen[k]) { seen[k] = 1; save(); setTimeout(fn, 500); } };
  if (prev.water < goal && now.water >= goal)
    fire('water', () => { openModal('💧 Hydration goal reached!', `<div class="m-big">${now.water.toLocaleString()} ml</div><p>You hit your daily target. Keep sipping steadily rather than all at once.</p>`); burst(innerWidth / 2, innerHeight / 2.5, 140, ['#00f0ff', '#4d7cff', '#fff']); });
  if (prev.score < 85 && now.score >= 85)
    fire('score', () => showScorePopup(true));
}

// Clickable cards open detail pop-ups
$('.ring-wrap').style.cursor = 'pointer';
$('.ring-wrap').addEventListener('click', () => showScorePopup(false));
$('#adviceList').addEventListener('click', (e) => {
  const c = e.target.closest('.adv'); if (!c) return;
  openModal(c.querySelector('b').textContent, `<p>${c.childNodes[1].textContent}</p><p class="m-note">General educational wellness information, not medical advice.</p>`);
});
$('#bmiVal').style.cursor = 'pointer';
$('.gauge-wrap').addEventListener('click', () => {
  const p = state.profile, bmi = calcBMI(p.weight, p.height), c = whoCategory(bmi);
  openModal('BMI details', `<div class="m-big" style="color:${c.color}">${bmi.toFixed(1)}</div><div class="m-sub" style="color:${c.color}">${c.name}</div>
    <p>WHO bands: under 18.5 underweight · 18.5–24.9 normal · 25–29.9 overweight · 30+ obese.</p>
    <p class="m-note">BMI does not distinguish muscle from fat; treat it as a screening guide only.</p>`);
});

function helpModal() {
  openModal('Gestures & shortcuts',
    `<ul class="m-list">
      <li><kbd>W</kbd> add 250 ml · <kbd>Shift</kbd>+<kbd>W</kbd> add 500 ml</li>
      <li><kbd>D</kbd> run the demo · <kbd>?</kbd> this help · <kbd>Esc</kbd> close pop-ups</li>
      <li>Tap the <b>water glass</b> to sip 250 ml</li>
      <li>Tap the <b>score ring</b>, <b>BMI gauge</b> or an <b>advice card</b> for details</li>
      <li>Move your mouse over cards to tilt them in 3D</li>
    </ul>`);
}
$('#helpBtn').onclick = helpModal;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') return closeModal();
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || e.ctrlKey || e.metaKey) return;
  if (e.key === 'w') addWater(250);
  else if (e.key === 'W') addWater(500);
  else if (e.key === 'd') $('#demoBtn').click();
  else if (e.key === '?') helpModal();
});

/* ---------- 11. FUTURISTIC EFFECTS ---------- */
const fine = matchMedia('(pointer:fine)').matches;

// Confetti / energy burst
const fx = $('#fx'), fctx = fx.getContext('2d');
let sparks = [], fxRunning = false;
function sizeFx() { fx.width = innerWidth; fx.height = innerHeight; }
sizeFx(); addEventListener('resize', sizeFx);
function burst(x, y, n = 60, colors = ['#00f0ff', '#a855ff', '#2dffa0', '#ffc23d', '#ff4d6d']) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 7;
    sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, life: 1, c: colors[i % colors.length], s: 2 + Math.random() * 4 });
  }
  if (!fxRunning) { fxRunning = true; requestAnimationFrame(tickFx); }
}
function tickFx() {
  fctx.clearRect(0, 0, fx.width, fx.height);
  sparks.forEach((p) => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.vx *= 0.99; p.life -= 0.014;
    fctx.globalAlpha = Math.max(0, p.life); fctx.fillStyle = p.c; fctx.shadowColor = p.c; fctx.shadowBlur = 10;
    fctx.fillRect(p.x, p.y, p.s, p.s);
  });
  sparks = sparks.filter((p) => p.life > 0);
  if (sparks.length) requestAnimationFrame(tickFx); else { fxRunning = false; fctx.clearRect(0, 0, fx.width, fx.height); }
}

// Particle network background that reacts to the mouse
const bg = $('#bgfx'), bctx = bg.getContext('2d');
let nodes = [], mouse = { x: -999, y: -999 };
function initNodes() {
  bg.width = innerWidth; bg.height = innerHeight;
  nodes = Array.from({ length: Math.min(70, Math.floor(innerWidth / 18)) }, () => ({
    x: Math.random() * bg.width, y: Math.random() * bg.height, vx: (Math.random() - .5) * .4, vy: (Math.random() - .5) * .4
  }));
}
initNodes(); addEventListener('resize', initNodes);
(function loopBg() {
  bctx.clearRect(0, 0, bg.width, bg.height);
  nodes.forEach((a, i) => {
    a.x += a.vx; a.y += a.vy;
    if (a.x < 0 || a.x > bg.width) a.vx *= -1;
    if (a.y < 0 || a.y > bg.height) a.vy *= -1;
    bctx.fillStyle = 'rgba(0,240,255,.7)'; bctx.fillRect(a.x, a.y, 2, 2);
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 110) { bctx.strokeStyle = `rgba(120,160,255,${.16 * (1 - d / 110)})`; bctx.beginPath(); bctx.moveTo(a.x, a.y); bctx.lineTo(b.x, b.y); bctx.stroke(); }
    }
    const dm = Math.hypot(a.x - mouse.x, a.y - mouse.y);
    if (dm < 160) { bctx.strokeStyle = `rgba(168,85,255,${.5 * (1 - dm / 160)})`; bctx.beginPath(); bctx.moveTo(a.x, a.y); bctx.lineTo(mouse.x, mouse.y); bctx.stroke(); }
  });
  requestAnimationFrame(loopBg);
})();

// Cursor glow + trailing ring
const dot = $('#cursorDot'), ring = $('#cursorRing');
let rx = 0, ry = 0;
addEventListener('mousemove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  dot.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
  ring.classList.toggle('big', !!e.target.closest('button,a,input,select,.glass,.ring-wrap,.gauge-wrap,.adv'));
});
(function trail() {
  rx += (mouse.x - rx) * 0.15; ry += (mouse.y - ry) * 0.15;
  ring.style.transform = `translate(${rx}px,${ry}px)`;
  requestAnimationFrame(trail);
})();

// 3D card tilt + glare
if (fine) {
  $$('.card').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', x * 100 + '%'); card.style.setProperty('--my', y * 100 + '%');
      if (card.classList.contains('wide')) return; // keep wide cards flat for the chart
      card.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 7}deg) rotateY(${(x - 0.5) * 9}deg) translateY(-3px)`;
    });
    card.addEventListener('mouseleave', () => (card.style.transform = ''));
  });
  // Magnetic buttons
  $$('.btn').forEach((b) => {
    b.addEventListener('mousemove', (e) => {
      const r = b.getBoundingClientRect();
      b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.2}px,${(e.clientY - r.top - r.height / 2) * 0.3}px)`;
    });
    b.addEventListener('mouseleave', () => (b.style.transform = ''));
  });
}
// Ripple on every button
document.addEventListener('click', (e) => {
  const b = e.target.closest('.btn'); if (!b) return;
  const r = b.getBoundingClientRect(), s = document.createElement('span');
  s.className = 'ripple'; s.style.left = e.clientX - r.left + 'px'; s.style.top = e.clientY - r.top + 'px';
  b.appendChild(s); setTimeout(() => s.remove(), 650);
});

/* ---------- 12. ACCOUNT ---------- */
$('#userChip').textContent = '👤 ' + USER;
$('#logoutBtn').onclick = () => { localStorage.removeItem('bb.session'); location.replace('login.html'); };

/* ---------- 13. INIT ---------- */
buildGauge();
renderAll();
if (!localStorage.getItem(WELCOME_KEY)) {
  setTimeout(() => openModal('Welcome to BodyBlueprint',
    `<p>Your futuristic health dashboard. Three quick steps:</p>
     <ul class="m-list"><li><b>1.</b> Enter height, weight and age → <b>Calculate</b></li>
     <li><b>2.</b> Log water and sleep through the day</li>
     <li><b>3.</b> Watch your Wellness Index and advice update</li></ul>
     <p class="m-note">Press <kbd>?</kbd> any time for gestures and shortcuts.</p>`,
    [['Start', () => localStorage.setItem(WELCOME_KEY, '1')], ['Run demo', () => { localStorage.setItem(WELCOME_KEY, '1'); $('#demoBtn').click(); }]]), 600);
}