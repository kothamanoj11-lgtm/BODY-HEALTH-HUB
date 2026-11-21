/* BodyBlueprint — client-side demo authentication.
   Accounts live in localStorage (password stored as salted SHA-256). Fine for a college demo;
   a real product would verify passwords on a server. */
'use strict';
const $ = (s) => document.querySelector(s);
const USERS_KEY = 'bb.users', SESSION_KEY = 'bb.session';

if (localStorage.getItem(SESSION_KEY)) location.replace('index.html'); // already signed in

let mode = 'login';
const users = () => { try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; } catch (e) { return {}; } };

async function hashPw(pw, salt) {
  const text = salt + pw;
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const c of text) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; // fallback
  return 'x' + h.toString(16);
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove('show'), 2400);
}
function fail(msg) {
  $('#err').textContent = msg;
  const c = $('#loginCard'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
}
function enter(name) {
  localStorage.setItem(SESSION_KEY, name);
  $('#loginCard').classList.add('leaving');
  toast('Access granted — welcome, ' + name);
  setTimeout(() => location.replace('index.html'), 750);
}

/* tabs */
function setMode(m) {
  mode = m; $('#err').textContent = '';
  $('#tabLogin').classList.toggle('active', m === 'login');
  $('#tabSignup').classList.toggle('active', m === 'signup');
  $('#tabInd').style.transform = m === 'login' ? 'translateX(0)' : 'translateX(100%)';
  $('#confirmRow').hidden = $('#strength').hidden = m === 'login';
  $('#pass2').required = m === 'signup';
  $('#submitBtn').textContent = m === 'login' ? 'Log in' : 'Create account';
  $('#pass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
}
$('#tabLogin').onclick = () => setMode('login');
$('#tabSignup').onclick = () => setMode('signup');
$('#showPw').onclick = () => { const p = $('#pass'); p.type = p.type === 'password' ? 'text' : 'password'; };

/* password strength meter */
$('#pass').addEventListener('input', () => {
  const v = $('#pass').value;
  const score = (v.length >= 6) + (v.length >= 10) + /[A-Z]/.test(v) + /\d/.test(v) + /[^A-Za-z0-9]/.test(v);
  const bar = $('#strength i');
  bar.style.width = score * 20 + '%';
  bar.style.background = score <= 2 ? '#ff4d6d' : score <= 3 ? '#ffc23d' : '#2dffa0';
});

/* submit */
$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#user').value.trim(), pw = $('#pass').value, db = users(), key = name.toLowerCase();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) return fail('Username: 3–20 letters, numbers or _');
  if (mode === 'signup') {
    if (db[key]) return fail('That username is already taken.');
    if (pw !== $('#pass2').value) return fail('Passwords do not match.');
    const salt = Math.random().toString(36).slice(2);
    db[key] = { name, salt, hash: await hashPw(pw, salt) };
    localStorage.setItem(USERS_KEY, JSON.stringify(db));
    enter(name);
  } else {
    const u = db[key];
    if (!u || u.hash !== (await hashPw(pw, u.salt))) return fail('Invalid username or password.');
    enter(u.name);
  }
});
$('#guestBtn').onclick = () => enter('guest');

/* ---- visuals: particle network + cursor ---- */
const bg = $('#bgfx'), ctx = bg.getContext('2d');
let nodes = [], mouse = { x: -999, y: -999 };
function init() {
  bg.width = innerWidth; bg.height = innerHeight;
  nodes = Array.from({ length: Math.min(70, Math.floor(innerWidth / 18)) }, () => ({
    x: Math.random() * bg.width, y: Math.random() * bg.height, vx: (Math.random() - .5) * .4, vy: (Math.random() - .5) * .4 }));
}
init(); addEventListener('resize', init);
(function loop() {
  ctx.clearRect(0, 0, bg.width, bg.height);
  nodes.forEach((a, i) => {
    a.x += a.vx; a.y += a.vy;
    if (a.x < 0 || a.x > bg.width) a.vx *= -1;
    if (a.y < 0 || a.y > bg.height) a.vy *= -1;
    ctx.fillStyle = 'rgba(0,240,255,.7)'; ctx.fillRect(a.x, a.y, 2, 2);
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 110) { ctx.strokeStyle = `rgba(120,160,255,${.16 * (1 - d / 110)})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    }
    const dm = Math.hypot(a.x - mouse.x, a.y - mouse.y);
    if (dm < 160) { ctx.strokeStyle = `rgba(168,85,255,${.5 * (1 - dm / 160)})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); }
  });
  requestAnimationFrame(loop);
})();
const dot = $('#cursorDot'), ring = $('#cursorRing'); let rx = 0, ry = 0;
addEventListener('mousemove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  dot.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
  ring.classList.toggle('big', !!e.target.closest('button,input'));
});
(function trail() { rx += (mouse.x - rx) * .15; ry += (mouse.y - ry) * .15; ring.style.transform = `translate(${rx}px,${ry}px)`; requestAnimationFrame(trail); })();
// 3D tilt on the login card
const card = $('#loginCard');
card.addEventListener('mousemove', (e) => {
  const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  card.style.setProperty('--mx', x * 100 + '%'); card.style.setProperty('--my', y * 100 + '%');
  card.style.transform = `perspective(900px) rotateX(${(.5 - y) * 6}deg) rotateY(${(x - .5) * 8}deg)`;
});
card.addEventListener('mouseleave', () => (card.style.transform = ''));
document.addEventListener('click', (e) => {
  const b = e.target.closest('.btn'); if (!b) return;
  const r = b.getBoundingClientRect(), s = document.createElement('span');
  s.className = 'ripple'; s.style.left = e.clientX - r.left + 'px'; s.style.top = e.clientY - r.top + 'px';
  b.appendChild(s); setTimeout(() => s.remove(), 650);
});