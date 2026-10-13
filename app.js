'use strict';

const $ = (s, r = document) => r.querySelector(s);
const SAVE_KEY = 'monopoly-banker-v1';
const SET_KEY = 'monopoly-banker-settings';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let S = null;            // состояние игры
let history = [];        // для «Отменить»
let settings = { sound: true, voice: true };
const moods = {};        // pid -> 'happy' | 'sad'
const moodTimers = {};
let shownMoney = {};     // какие суммы сейчас показаны на карточках (для анимации счёта)
let popChip = null;      // только что купленная улица — её фишка «выпрыгивает»
let sheetHandlers = {};
let cellCtx = null;

/* ---------- Хранение ---------- */
function storeSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* нет хранилища */ } }
function storeGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function save() { storeSet(SAVE_KEY, { S, history: history.slice(-30) }); }

function commit(fn) {
  history.push(JSON.parse(JSON.stringify(S)));
  if (history.length > 40) history.shift();
  fn();
  save();
  render();
}

function undo() {
  if (!history.length) { toast('Отменять нечего'); return; }
  S = history.pop();
  save(); closeSheet(); render();
  toast('↩️ Последнее действие отменено'); sfx('undo');
}

/* ---------- Помощники ---------- */
const player = id => S.players.find(p => p.id === id);
const cur = () => S.players[S.turn];
const fmt = n => (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('ru-RU');
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const plain = s => s.replace(/&shy;/g, '');
const idx = BOARD.map((_, i) => i);
const groupCells = g => idx.filter(i => BOARD[i].g === g);
const ownsGroup = (id, g) => groupCells(g).every(i => S.props[i].owner === id);
const ownedBy = id => idx.filter(i => S.props[i] && S.props[i].owner === id);
const countType = (id, t) => idx.filter(i => BOARD[i].t === t && S.props[i].owner === id).length;
const mortValue = i => BOARD[i].price / 2;
const unmortCost = i => Math.ceil(BOARD[i].price / 2 * 1.1);
const propColor = i => BOARD[i].g ? GROUPS[BOARD[i].g].color : (BOARD[i].t === 'station' ? '#3b3b3b' : '#f5d21c');
const lightBand = i => ['light', 'yellow'].includes(BOARD[i].g) || BOARD[i].t === 'utility' || BOARD[i].t === 'chest';

const TYPE_STYLE = {
  start: ['#e3262f', '🏁'], chest: ['#7cc8f0', '💝'], chance: ['#f28a1c', '❓'], tax: ['#8f8f8f', '💰'],
  station: ['#3b3b3b', '🚂'], utility: ['#f5d21c', '💡'], jail: ['#f28a1c', '🔒'], parking: ['#e3262f', '🅿️'],
  gotojail: ['#1f5fbf', '👮'],
};
const cellIcon = i => (i === 28 ? '🚰' : (TYPE_STYLE[BOARD[i].t] || [])[1] || '');

function rentOf(i, dice = 0) {
  const c = BOARD[i], p = S.props[i];
  if (!p || !p.owner || p.mort) return 0;
  if (c.t === 'street') return p.houses ? c.rent[p.houses] : c.rent[0] * (ownsGroup(p.owner, c.g) ? 2 : 1);
  if (c.t === 'station') return STATION_RENT[countType(p.owner, 'station')];
  if (c.t === 'utility') return dice * UTILITY_MULT[countType(p.owner, 'utility')];
  return 0;
}

function canBuild(i) {
  const c = BOARD[i], p = S.props[i];
  if (c.t !== 'street' || !p.owner || p.mort || p.houses >= 5) return false;
  const g = groupCells(c.g);
  if (!ownsGroup(p.owner, c.g) || g.some(j => S.props[j].mort)) return false;
  return p.houses <= Math.min(...g.map(j => S.props[j].houses));
}
function buildHint(i) {
  const c = BOARD[i], p = S.props[i];
  if (c.t !== 'street' || p.houses >= 5) return '';
  if (!ownsGroup(p.owner, c.g)) return 'Чтобы строить дома, собери все улицы этого цвета';
  if (groupCells(c.g).some(j => S.props[j].mort)) return 'Сначала выкупи заложенные улицы этого цвета';
  if (!canBuild(i)) return 'Строим ровно: сначала дом на другой улице этого цвета';
  return '';
}
function canSellHouse(i) {
  const c = BOARD[i], p = S.props[i];
  if (c.t !== 'street' || !p.houses) return false;
  return p.houses >= Math.max(...groupCells(c.g).map(j => S.props[j].houses));
}
function canMortgage(i) {
  const c = BOARD[i], p = S.props[i];
  if (!p.owner || p.mort) return false;
  return !(c.t === 'street' && groupCells(c.g).some(j => S.props[j].houses));
}

/* ---------- Звук и голос ---------- */
let actx = null;
function tone(f, t0, dur, type = 'sine', vol = 0.15) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(actx.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function sfx(kind) {
  if (!settings.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime;
    switch (kind) {
      case 'coin': [988, 1319, 1568].forEach((f, k) => tone(f, t + k * 0.07, 0.18, 'square', 0.06)); break;
      case 'pay': tone(660, t, 0.12, 'triangle'); tone(523, t + 0.12, 0.12, 'triangle'); tone(392, t + 0.24, 0.3, 'triangle'); break;
      case 'buy': [523, 659, 784, 1047].forEach((f, k) => tone(f, t + k * 0.09, 0.22, 'triangle', 0.18)); break;
      case 'build': [392, 523, 784].forEach((f, k) => tone(f, t + k * 0.1, 0.12, 'square', 0.06)); break;
      case 'jail': tone(196, t, 0.35, 'sawtooth', 0.08); tone(147, t + 0.3, 0.6, 'sawtooth', 0.08); break;
      case 'turn': tone(587, t, 0.1, 'triangle'); tone(880, t + 0.1, 0.25, 'triangle'); break;
      case 'tap': tone(760, t, 0.05, 'sine', 0.08); break;
      case 'undo': tone(500, t, 0.1, 'sine'); tone(350, t + 0.1, 0.15, 'sine'); break;
      case 'card': [440, 554, 659, 880].forEach((f, k) => tone(f, t + k * 0.06, 0.15, 'sine', 0.12)); break;
    }
  } catch (e) { /* звук недоступен */ }
}
let ruVoice = null;
function pickVoice() {
  try { ruVoice = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith('ru')) || null; } catch (e) { /* нет голоса */ }
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text) {
  if (!settings.voice || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ru-RU'; u.rate = 1.05; u.pitch = 1.15;
    if (ruVoice) u.voice = ruVoice;
    speechSynthesis.speak(u);
  } catch (e) { /* голос недоступен */ }
}

/* ---------- Эффекты ---------- */
function elFor(id) {
  if (id === 'bank') return $('#bank');
  return $(`.pcard[data-pid="${id}"] .tk`);
}
function centerOf(el) { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }

function flyCoins(from, to, amount) {
  if (reducedMotion) return;
  const a = elFor(from), b = elFor(to);
  if (!a || !b) return;
  const [x0, y0] = centerOf(a), [x1, y1] = centerOf(b);
  const n = Math.min(10, 3 + Math.floor(amount / 150));
  for (let k = 0; k < n; k++) {
    const c = document.createElement('div');
    c.className = 'fx coin'; c.textContent = '$';
    c.style.left = x0 + 'px'; c.style.top = y0 + 'px';
    document.body.appendChild(c);
    const dx = x1 - x0, dy = y1 - y0, lift = -70 - Math.random() * 90, jit = (Math.random() - 0.5) * 80;
    c.animate([
      { transform: 'translate(0,0) scale(.3)', opacity: 0 },
      { transform: `translate(${dx * 0.5 + jit}px, ${dy * 0.5 + lift}px) scale(1.15) rotate(180deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(.6) rotate(360deg)`, opacity: 0.9 },
    ], { duration: 800, delay: k * 70, easing: 'ease-in-out', fill: 'forwards' }).onfinish = () => c.remove();
  }
}

function confetti(el) {
  if (reducedMotion || !el) return;
  const [x, y] = centerOf(el);
  const colors = ['#f5b819', '#e3262f', '#1d9e55', '#2f7de1', '#d63a8f', '#f28a1c'];
  for (let k = 0; k < 36; k++) {
    const c = document.createElement('div');
    c.className = 'fx confetti';
    c.style.left = x + 'px'; c.style.top = y + 'px'; c.style.background = colors[k % colors.length];
    document.body.appendChild(c);
    const ang = Math.random() * Math.PI * 2, dist = 80 + Math.random() * 180;
    const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 60;
    c.animate([
      { transform: 'translate(0,0) rotate(0) scale(.4)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${Math.random() * 720}deg) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx * 1.1}px, ${dy + 160}px) rotate(${Math.random() * 1080}deg) scale(.8)`, opacity: 0 },
    ], { duration: 1400 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }).onfinish = () => c.remove();
  }
}

function bigWord(text, color = '#fff') {
  const w = document.createElement('div');
  w.className = 'fx bigword'; w.textContent = text; w.style.color = color;
  document.body.appendChild(w);
  if (reducedMotion) { setTimeout(() => w.remove(), 1200); return; }
  w.animate([
    { transform: 'scale(.2) rotate(-12deg)', opacity: 0 },
    { transform: 'scale(1.15) rotate(3deg)', opacity: 1, offset: 0.25 },
    { transform: 'scale(1) rotate(-2deg)', opacity: 1, offset: 0.75 },
    { transform: 'scale(1.3)', opacity: 0 },
  ], { duration: 1700, easing: 'ease-out', fill: 'forwards' }).onfinish = () => w.remove();
}

function setMood(id, mood) {
  if (id === 'bank') return;
  moods[id] = mood;
  clearTimeout(moodTimers[id]);
  moodTimers[id] = setTimeout(() => { delete moods[id]; renderPlayers(); renderBoard(); }, 2600);
}

function toast(text, tokId) {
  const box = $('#toast');
  const t = document.createElement('div');
  t.className = 'toast';
  const p = tokId && tokId !== 'bank' && player(tokId);
  t.innerHTML = (p ? `<div class="tk">${tokenSVG(p.token, 'happy')}</div>` : '') + `<span>${esc(text)}</span>`;
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, 2600);
}
function announce(text, tokId, spoken) { toast(text, tokId); speak(spoken || text); }

function countTo(el, from, to) {
  if (!el) return;
  el.classList.add(to > from ? 'flash-gain' : 'flash-loss');
  if (reducedMotion) { el.textContent = fmt(to); return; }
  el.textContent = fmt(from);
  const t0 = performance.now() + 350, dur = 700;
  const step = now => {
    const k = Math.min(1, Math.max(0, (now - t0) / dur));
    el.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- Денежные операции ---------- */
function move(from, to, amount, opts = {}) {
  amount = Math.round(amount);
  if (amount) {
    if (from !== 'bank') setMood(from, 'sad');
    if (to !== 'bank') setMood(to, 'happy');
  }
  commit(() => {
    if (amount) {
      if (from !== 'bank') player(from).money -= amount;
      if (to !== 'bank') player(to).money += amount;
    }
    if (opts.extra) opts.extra();
  });
  if (amount) {
    flyCoins(from, to, amount);
    sfx(to === 'bank' ? 'pay' : 'coin');
  }
  if (opts.say) announce(opts.say, opts.tok || (to !== 'bank' ? to : from), opts.spoken);
}

function payEach(who, amt) {
  const others = S.players.filter(p => p.id !== who);
  setMood(who, 'sad'); others.forEach(p => setMood(p.id, 'happy'));
  commit(() => { player(who).money -= amt * others.length; others.forEach(p => { p.money += amt; }); });
  others.forEach(p => flyCoins(who, p.id, amt));
  sfx('pay');
  announce(`Заплатил каждому по ${fmt(amt)}`, who, `Плати каждому по ${amt} долларов`);
}
function collectEach(who, amt) {
  const others = S.players.filter(p => p.id !== who);
  setMood(who, 'happy'); others.forEach(p => setMood(p.id, 'sad'));
  commit(() => { player(who).money += amt * others.length; others.forEach(p => { p.money -= amt; }); });
  others.forEach(p => flyCoins(p.id, who, amt));
  sfx('coin');
  announce(`Получил от каждого по ${fmt(amt)}`, who, `Каждый платит тебе по ${amt} долларов`);
}

function goJail(who) {
  setMood(who, 'sad');
  commit(() => { const p = player(who); p.jail = true; p.pos = 10; });
  sfx('jail');
  bigWord('В ТЮРЬМУ!', '#ffd84a');
  announce(`${player(who).name} — в тюрьму!`, who, 'Отправляйся в тюрьму!');
}

function nextTurn() {
  commit(() => { S.turn = (S.turn + 1) % S.players.length; });
  sfx('turn');
  const p = cur();
  announce(`Ходит ${p.name}`, p.id, `Ходит ${p.name}`);
}

function buy(i, who) {
  const c = BOARD[i];
  setMood(who, 'happy');
  popChip = i;
  commit(() => { player(who).money -= c.price; S.props[i].owner = who; });
  flyCoins(who, 'bank', c.price);
  sfx('buy');
  confetti($(`.cell[data-i="${i}"]`));
  bigWord('КУПЛЕНО!', '#ffd84a');
  announce(`Куплено: ${plain(c.name)}`, who, `Покупка! ${plain(c.name)}`);
}

/* ---------- Отрисовка ---------- */
function tkHTML(p, extra = '') {
  const m = moods[p.id] || '';
  return `<div class="tk ${m} ${p.jail ? 'jailed' : ''} ${extra}">${tokenSVG(p.token, m || 'ok')}</div>`;
}

function chipsHTML(id) {
  return ownedBy(id).map(i => {
    const p = S.props[i];
    const label = p.houses === 5 ? '★' : (p.houses || '');
    return `<span class="chip ${p.mort ? 'mort' : ''} ${popChip === i ? 'pop' : ''}" style="--gc:${propColor(i)}" title="${esc(plain(BOARD[i].name))}">${label}</span>`;
  }).join('');
}

function renderPlayers() {
  const box = $('#players');
  box.innerHTML = S.players.map((p, k) => `
    <button class="pcard ${k === S.turn ? 'current' : ''}" data-pid="${p.id}" style="--pc:${TOKENS[p.token].color}" aria-label="${esc(p.name)}: ${fmt(p.money)}">
      ${tkHTML(p)}
      <span class="pname">${esc(p.name)}</span>
      <span class="money ${p.money < 0 ? 'neg' : ''}" data-money>${fmt(shownMoney[p.id] ?? p.money)}</span>
      <span class="chips">${chipsHTML(p.id)}</span>
    </button>`).join('');
  S.players.forEach(p => {
    const from = shownMoney[p.id] ?? p.money;
    if (from !== p.money) countTo($(`.pcard[data-pid="${p.id}"] [data-money]`, box), from, p.money);
    shownMoney[p.id] = p.money;
  });
  popChip = null;
}

function cellPos(i) {
  if (i <= 10) return [11, 11 - i];
  if (i <= 20) return [11 - (i - 10), 1];
  if (i <= 30) return [1, 1 + (i - 20)];
  return [1 + (i - 30), 11];
}
function cellSide(i) {
  if (i % 10 === 0) return 'corner';
  if (i < 10) return 's-b';
  if (i < 20) return 's-l';
  if (i < 30) return 's-t';
  return 's-r';
}

function renderBoard() {
  const cells = BOARD.map((c, i) => {
    const [r, col] = cellPos(i);
    const pr = S.props[i];
    const owner = pr && pr.owner && player(pr.owner);
    const here = S.players.filter(p => p.pos === i);
    let inner = '';
    if (c.t === 'street') inner += `<span class="band" style="--gc:${GROUPS[c.g].color}"></span>`;
    else inner += `<span class="ico">${cellIcon(i)}</span>`;
    inner += `<span class="nm">${c.short}</span>`;
    if (c.price && !owner) inner += `<span class="pr">$${c.price}</span>`;
    if (c.t === 'tax') inner += `<span class="pr">−$${c.amount}</span>`;
    if (pr && pr.houses) {
      inner += `<span class="houses">${pr.houses === 5 ? '<i class="hotel"></i>' : '<i></i>'.repeat(pr.houses)}</span>`;
    }
    if (owner) inner += `<span class="owner" style="--pc:${TOKENS[owner.token].color}">${tokenSVG(owner.token)}</span>`;
    if (here.length) inner += `<span class="here">${here.map(p => `<span class="mini">${tokenSVG(p.token, moods[p.id] || 'ok')}</span>`).join('')}</span>`;
    const cls = ['cell', cellSide(i), c.t, pr && pr.mort ? 'mort' : ''].join(' ');
    return `<button class="${cls}" data-i="${i}" style="grid-row:${r};grid-column:${col}" aria-label="${esc(plain(c.name))}">${inner}</button>`;
  }).join('');

  const p = cur();
  const center = `
    <div class="center">
      <div class="logo">МОНОПОЛИЯ</div>
      <div class="turn">
        ${tkHTML(p)}
        <div class="who"><small>Сейчас ходит</small>${esc(p.name)}</div>
      </div>
      <div class="row">
        <button class="big gold" data-act="next">Следующий ход ➜</button>
        <button class="big green small" data-act="go">🏁 Прошёл Старт +$${GO_BONUS}</button>
      </div>
      <p class="hint">Куда встала фишка? Нажми на эту клетку</p>
      <div id="bank" aria-hidden="true">🏦</div>
    </div>`;
  $('#board').innerHTML = cells + center;
}

function render() {
  if (!S) return;
  renderPlayers();
  renderBoard();
}

/* ---------- Окна ---------- */
function openSheet(html, handlers) {
  sheetHandlers = handlers || {};
  const bd = $('#sheet-backdrop');
  const wasOpen = !bd.hidden;
  bd.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><button class="close" aria-label="Закрыть">✕</button>${html}</div>`;
  if (wasOpen) { bd.style.animation = 'none'; bd.firstChild.style.animation = 'none'; }
  else bd.style.animation = '';
  bd.hidden = false;
}
function closeSheet() {
  const bd = $('#sheet-backdrop');
  bd.hidden = true; bd.innerHTML = ''; sheetHandlers = {}; cellCtx = null;
}

function titleCard(i, owner) {
  const c = BOARD[i];
  const color = c.t === 'street' || c.price ? propColor(i) : TYPE_STYLE[c.t][0];
  const kicker = c.t === 'street' ? GROUPS[c.g].name + ' улица' : (c.t === 'station' ? 'Вокзал' : c.t === 'utility' ? 'Предприятие' : '');
  const ico = c.t === 'street' ? '' : `<div style="font-size:44px">${cellIcon(i)}</div>`;
  let body = '';
  if (c.price) {
    const pr = S.props[i];
    let rows = [];
    if (c.t === 'street') {
      const full = pr.owner && ownsGroup(pr.owner, c.g);
      const lvl = pr.houses ? pr.houses + 1 : (full ? 1 : 0);
      rows = [
        ['Рента', c.rent[0]], ['Вся группа одного цвета', c.rent[0] * 2],
        ['🏠 1 дом', c.rent[1]], ['🏠🏠 2 дома', c.rent[2]], ['🏠🏠🏠 3 дома', c.rent[3]],
        ['🏠🏠🏠🏠 4 дома', c.rent[4]], ['🏨 Отель', c.rent[5]],
      ].map((r, k) => `<tr class="${pr.owner && !pr.mort && k === lvl ? 'now' : ''}"><td>${r[0]}</td><td>$${r[1]}</td></tr>`);
      rows.push(`<tr><td>Дом стоит</td><td>$${GROUPS[c.g].house}</td></tr>`);
    } else if (c.t === 'station') {
      const n = pr.owner ? countType(pr.owner, 'station') : 0;
      rows = [1, 2, 3, 4].map(k => `<tr class="${n === k && !pr.mort ? 'now' : ''}"><td>${'🚂'.repeat(k)} ${k} вокзал${k > 1 ? 'а' : ''}</td><td>$${STATION_RENT[k]}</td></tr>`);
    } else {
      const n = pr.owner ? countType(pr.owner, 'utility') : 0;
      rows = [`<tr class="${n === 1 && !pr.mort ? 'now' : ''}"><td>Одно предприятие</td><td>кубики × 4</td></tr>`,
              `<tr class="${n === 2 && !pr.mort ? 'now' : ''}"><td>Оба предприятия</td><td>кубики × 10</td></tr>`];
    }
    rows.push(`<tr><td>Залог</td><td>$${mortValue(i)}</td></tr>`);
    const own = owner
      ? `<div class="who-pick" style="justify-content:center"><span>Хозяин:</span><span style="width:44px;height:44px;display:inline-block">${tokenSVG(owner.token)}</span><b>${esc(owner.name)}</b>${pr.mort ? '<span>(заложена)</span>' : ''}</div>`
      : `<p class="say" style="font-size:18px">Цена: <b class="price-tag">$${c.price}</b> · свободна</p>`;
    body = `<div class="tc-body">${own}<table class="rent-table">${rows.join('')}</table></div>`;
  }
  return `<div class="title-card"><div class="tc-band ${lightBand(i) ? 'light' : ''}" style="--gc:${color}">
    ${ico}${kicker ? `<small>${kicker}</small>` : ''}<b>${esc(plain(c.name))}</b></div>${body}</div>`;
}

function propButtons(i, trade) {
  const c = BOARD[i], p = S.props[i];
  const b = [];
  if (c.t === 'street' && !p.mort) {
    const g = GROUPS[c.g];
    if (p.houses < 5) b.push(`<button class="big green small" data-act="build" data-i="${i}" ${canBuild(i) ? '' : 'disabled'}>${p.houses === 4 ? '🏨 Отель' : '🏠 Дом'} −$${g.house}</button>`);
    if (p.houses > 0) b.push(`<button class="big ghost small" data-act="sellhouse" data-i="${i}" ${canSellHouse(i) ? '' : 'disabled'}>Продать ${p.houses === 5 ? 'отель' : 'дом'} +$${g.house / 2}</button>`);
  }
  if (!p.mort) b.push(`<button class="big ghost small" data-act="mort" data-i="${i}" ${canMortgage(i) ? '' : 'disabled'}>Заложить +$${mortValue(i)}</button>`);
  else b.push(`<button class="big gold small" data-act="unmort" data-i="${i}">Выкупить −$${unmortCost(i)}</button>`);
  if (trade) {
    b.push(`<button class="big ghost small" data-act="give" data-i="${i}" ${p.houses ? 'disabled' : ''}>🤝 Продать игроку</button>`);
    b.push(`<button class="big ghost small" data-act="tobank" data-i="${i}">Вернуть банку</button>`);
  }
  return b.join('');
}

function propHandlers(refresh) {
  return {
    build: d => {
      const i = +d.i, c = BOARD[i], p = S.props[i], cost = GROUPS[c.g].house;
      setMood(p.owner, 'happy');
      commit(() => { player(p.owner).money -= cost; p.houses += 1; });
      refresh(); flyCoins(S.props[i].owner, 'bank', cost); sfx('build');
      const hotel = S.props[i].houses === 5;
      if (hotel) bigWord('ОТЕЛЬ!', '#ffd84a');
      announce(`${hotel ? '🏨 Отель' : '🏠 Дом'}: ${plain(c.name)}`, S.props[i].owner, hotel ? 'Ура! Отель построен!' : 'Построен дом!');
    },
    sellhouse: d => {
      const i = +d.i, c = BOARD[i], owner = S.props[i].owner, back = GROUPS[c.g].house / 2;
      commit(() => { S.props[i].houses -= 1; player(owner).money += back; });
      refresh(); flyCoins('bank', owner, back); sfx('coin');
      toast(`Дом продан: +${fmt(back)}`, owner);
    },
    mort: d => {
      const i = +d.i, owner = S.props[i].owner;
      commit(() => { S.props[i].mort = true; player(owner).money += mortValue(i); });
      refresh(); flyCoins('bank', owner, mortValue(i)); sfx('coin');
      announce(`Заложена: ${plain(BOARD[i].name)}`, owner, 'Улица заложена');
    },
    unmort: d => {
      const i = +d.i, owner = S.props[i].owner;
      commit(() => { S.props[i].mort = false; player(owner).money -= unmortCost(i); });
      refresh(); flyCoins(owner, 'bank', unmortCost(i)); sfx('pay');
      announce(`Выкуплена: ${plain(BOARD[i].name)}`, owner, 'Улица выкуплена');
    },
    give: d => {
      const i = +d.i, from = S.props[i].owner;
      chooseTarget(`Кому продаём «${plain(BOARD[i].name)}»?`, S.players.filter(p => p.id !== from).map(p => p.id), to => {
        openPad({
          title: `За сколько ${esc(player(to).name)} покупает?`,
          buttons: [{
            label: '🤝 Договорились', cls: 'green', allowZero: true,
            fn: amt => {
              popChip = i;
              move(to, from, amt, {
                extra: () => { S.props[i].owner = to; },
                say: `${plain(BOARD[i].name)} → ${player(to).name}`, tok: to, spoken: 'Сделка!',
              });
            },
          }],
        });
      });
    },
    tobank: d => {
      const i = +d.i;
      commit(() => { Object.assign(S.props[i], { owner: null, houses: 0, mort: false }); });
      refresh(); toast(`${plain(BOARD[i].name)} снова свободна`);
    },
  };
}

function chooseTarget(title, ids, cb, withBank = false) {
  const opts = (withBank ? ['bank'] : []).concat(ids);
  openSheet(`<h2>${title}</h2><div class="actions">${opts.map(id => id === 'bank'
    ? `<button class="big ghost" data-act="pick" data-id="bank"><span class="ico">🏦</span>Банк</button>`
    : `<button class="big ghost" data-act="pick" data-id="${id}"><span style="width:44px;height:44px;display:inline-block">${tokenSVG(player(id).token)}</span>${esc(player(id).name)}</button>`).join('')}</div>`,
  { pick: d => cb(d.id) });
}

function openPad({ title, buttons, start = 0 }) {
  let amt = start;
  const html = `<h2>${title}</h2>
    <div class="amount" id="pad-amt">${fmt(amt)}</div>
    <div class="bills">${BILLS.map(b => `<button class="bill" data-act="bill" data-v="${b.v}" style="--bb:${b.bg};--bf:${b.fg}" aria-label="${b.v} долларов">${b.v}</button>`).join('')}</div>
    <div class="actions"><button class="big ghost small" data-act="clear">⌫ Сбросить</button></div>
    <div class="actions">${buttons.map((b, k) => `<button class="big ${b.cls || ''}" data-act="ok" data-k="${k}">${b.label}</button>`).join('')}</div>`;
  const show = () => {
    const el = $('#pad-amt');
    el.textContent = fmt(amt);
    if (!reducedMotion) el.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 180 });
  };
  openSheet(html, {
    bill: d => { amt += +d.v; show(); sfx('tap'); },
    clear: () => { amt = 0; show(); },
    ok: d => {
      const b = buttons[+d.k];
      if (!amt && !b.allowZero) { toast('Сначала набери сумму купюрами'); return; }
      closeSheet(); b.fn(amt);
    },
  });
}

/* ---------- Окно клетки ---------- */
function openCell(i) {
  const p = cur();
  cellCtx = { i, who: p.id, prev: p.pos, dice: 0 };
  p.pos = i; save(); renderBoard();
  sfx('tap');
  renderCellSheet();
}

function renderCellSheet() {
  const { i, who, prev } = cellCtx;
  const c = BOARD[i], me = player(who), pr = S.props[i];
  const owner = pr && pr.owner ? player(pr.owner) : null;
  const passedGo = i !== 0 && prev > i && c.t !== 'jail' && !me.jail;
  let say = '', acts = [];

  if (passedGo) acts.push(`<button class="big gold" data-act="passgo">🏁 Прошёл Старт +$${GO_BONUS}</button>`);

  if (c.price) {
    if (!owner) {
      const enough = me.money >= c.price;
      say = enough ? 'Свободна! Покупаем?' : 'Не хватает денег на покупку. Можно заложить свою улицу.';
      acts.push(`<button class="big green" data-act="buy" ${enough ? '' : 'disabled'}><span class="ico">🛒</span>Купить за $${c.price}</button>`);
      acts.push(`<button class="big ghost" data-act="close">Не покупаю</button>`);
    } else if (owner.id === who) {
      say = 'Это твоя улица! 🎉';
      acts.push(propButtons(i, false));
      const h = buildHint(i);
      if (h && c.t === 'street') say += `<br><small style="font-size:16px;color:var(--muted)">${h}</small>`;
    } else if (pr.mort) {
      say = 'Улица заложена — платить ничего не нужно 😊';
    } else if (c.t === 'utility') {
      const r = rentOf(i, cellCtx.dice);
      say = 'Сколько выпало на кубиках?';
      acts.push(`<div class="dice-grid" style="flex-basis:100%">${[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => `<button data-act="dice" data-n="${n}" aria-pressed="${cellCtx.dice === n}">${n}</button>`).join('')}</div>`);
      acts.push(`<button class="big red" data-act="rent" ${r ? '' : 'disabled'}><span class="ico">💸</span>Заплатить ${r ? '$' + r : ''} → ${esc(owner.name)}</button>`);
    } else {
      const r = rentOf(i);
      say = `<span class="say big-txt">Рента ${fmt(r)}</span>`;
      acts.push(`<button class="big red" data-act="rent"><span class="ico">💸</span>Заплатить $${r} → ${esc(owner.name)}</button>`);
    }
  } else {
    switch (c.t) {
      case 'start':
        say = 'Ты на Старте!';
        acts.push(`<button class="big green" data-act="start"><span class="ico">💰</span>Получить $${GO_BONUS}</button>`);
        break;
      case 'chance':
      case 'chest':
        say = `<span class="say big-txt">Возьми карточку<br>«${c.t === 'chance' ? 'Шанс' : 'Благотворительный фонд'}»!</span>`;
        acts.push(`<button class="big green" data-act="cardget"><span class="ico">💰</span>Получить из банка</button>`);
        acts.push(`<button class="big red" data-act="cardpay"><span class="ico">💸</span>Заплатить в банк</button>`);
        acts.push(`<button class="big ghost small" data-act="cardeachpay">Заплатить каждому</button>`);
        acts.push(`<button class="big ghost small" data-act="cardeachget">Получить от каждого</button>`);
        acts.push(`<button class="big ghost small" data-act="jail">👮 В тюрьму</button>`);
        break;
      case 'tax':
        say = `<span class="say big-txt">Налог ${fmt(c.amount)}</span>`;
        acts.push(`<button class="big red" data-act="tax"><span class="ico">💸</span>Заплатить $${c.amount}</button>`);
        break;
      case 'jail':
        if (me.jail) {
          say = 'Сидим в тюрьме. Как выйти?';
          acts.push(`<button class="big gold" data-act="jailpay">Заплатить $${JAIL_FINE} и выйти</button>`);
          acts.push(`<button class="big ghost" data-act="jailfree">Вышел бесплатно (дубль или карточка)</button>`);
        } else say = 'Просто в гостях 👋';
        break;
      case 'gotojail':
        say = '<span class="say big-txt">Отправляйся в тюрьму!</span>';
        acts.push(`<button class="big red" data-act="jail">👮 В тюрьму</button>`);
        break;
      case 'parking':
        say = 'Бесплатная стоянка. Отдыхаем! 😎';
        break;
    }
  }

  const whoPick = `<div class="who-pick"><span>Кто встал?</span>${S.players.map(p =>
    `<button data-act="who" data-pid="${p.id}" aria-pressed="${p.id === who}" aria-label="${esc(p.name)}">${tokenSVG(p.token)}</button>`).join('')}</div>`;

  openSheet(`${whoPick}${titleCard(i, owner)}
    ${say ? `<p class="say">${say}</p>` : ''}
    ${acts.length ? `<div class="actions">${acts.join('')}</div>` : ''}`,
  Object.assign(propHandlers(renderCellSheet), {
    who: d => {
      const old = player(cellCtx.who);
      old.pos = cellCtx.prev;
      const nw = player(d.pid);
      cellCtx.who = nw.id; cellCtx.prev = nw.pos; nw.pos = i;
      save(); renderBoard(); renderCellSheet();
    },
    close: closeSheet,
    passgo: () => { cellCtx.prev = i; move('bank', who, GO_BONUS, { say: `+${fmt(GO_BONUS)} за Старт`, spoken: `Получи ${GO_BONUS} долларов!` }); renderCellSheet(); },
    buy: () => { closeSheet(); buy(i, who); },
    dice: d => { cellCtx.dice = +d.n; sfx('tap'); renderCellSheet(); },
    rent: () => {
      const r = rentOf(i, cellCtx.dice);
      closeSheet();
      move(who, owner.id, r, { say: `Рента ${fmt(r)} → ${owner.name}`, tok: who, spoken: `Плати ренту, ${r} долларов` });
    },
    start: () => { closeSheet(); move('bank', who, GO_BONUS, { say: `+${fmt(GO_BONUS)} за Старт`, spoken: `Получи ${GO_BONUS} долларов!` }); },
    tax: () => { closeSheet(); move(who, 'bank', c.amount, { say: `Налог ${fmt(c.amount)}`, tok: who, spoken: `Налог, ${c.amount} долларов` }); },
    jail: () => { closeSheet(); goJail(who); },
    jailpay: () => { closeSheet(); move(who, 'bank', JAIL_FINE, { extra: () => { player(who).jail = false; }, say: 'Свобода!', tok: who, spoken: 'Ура, свобода!' }); },
    jailfree: () => { closeSheet(); commit(() => { player(who).jail = false; }); setMood(who, 'happy'); announce('Свобода!', who, 'Ура, свобода!'); },
    cardget: () => openPad({ title: 'Сколько дал банк?', buttons: [{ label: '💰 Получить', cls: 'green', fn: a => move('bank', who, a, { say: `+${fmt(a)}`, spoken: `Получи ${a} долларов!` }) }] }),
    cardpay: () => openPad({ title: 'Сколько платим банку?', buttons: [{ label: '💸 Заплатить', cls: 'red', fn: a => move(who, 'bank', a, { say: `−${fmt(a)}`, tok: who, spoken: `Плати ${a} долларов` }) }] }),
    cardeachpay: () => openPad({ title: 'Сколько платим каждому?', buttons: [{ label: '💸 Заплатить всем', cls: 'red', fn: a => payEach(who, a) }] }),
    cardeachget: () => openPad({ title: 'Сколько с каждого?', buttons: [{ label: '💰 Собрать', cls: 'green', fn: a => collectEach(who, a) }] }),
  }));
  if (c.t === 'chance' || c.t === 'chest') sfx('card');
}

/* ---------- Окно игрока ---------- */
function openPlayer(pid) {
  const p = player(pid);
  const own = ownedBy(pid);
  const isTurn = cur().id === pid;
  const html = `
    <div style="display:flex;align-items:center;gap:16px">
      <div class="tk" style="width:96px;height:96px;flex:none">${tokenSVG(p.token, 'happy')}</div>
      <div><h2>${esc(p.name)}</h2><div class="amount" style="font-size:40px;padding:4px 14px;margin-top:6px">${fmt(p.money)}</div></div>
    </div>
    <div class="actions">
      <button class="big red" data-act="pay"><span class="ico">💸</span>Заплатить</button>
      <button class="big green" data-act="get"><span class="ico">💰</span>Получить из банка</button>
    </div>
    <div class="actions">
      <button class="big ghost small" data-act="manual">✏️ Поправить деньги</button>
      ${isTurn ? '' : '<button class="big ghost small" data-act="setturn">👉 Передать ход сюда</button>'}
      <button class="big ghost small" data-act="jailtoggle">${p.jail ? '🔓 Выпустить из тюрьмы' : '🔒 Посадить в тюрьму'}</button>
    </div>
    <h2 style="font-size:22px">Улицы (${own.length})</h2>
    <div class="prop-list">${own.length ? own.map(i => {
      const pr = S.props[i], c = BOARD[i];
      const st = pr.mort ? 'заложена' : pr.houses === 5 ? '🏨 отель' : pr.houses ? '🏠×' + pr.houses : '';
      const rent = pr.mort ? '' : c.t === 'utility' ? `рента: кубики × ${UTILITY_MULT[countType(pid, 'utility')]}` : `рента ${fmt(rentOf(i))}`;
      const hint = !pr.mort && c.t === 'street' ? buildHint(i) : '';
      return `<div class="prop ${pr.mort ? 'mort' : ''}" style="--gc:${propColor(i)}"><span class="bar"></span>
        <div class="pn">${esc(plain(c.name))} <small>${[st, rent].filter(Boolean).join(' · ')}</small>${hint ? `<br><small>${hint}</small>` : ''}</div>
        <div class="pa">${propButtons(i, true)}</div></div>`;
    }).join('') : '<p class="empty">Пока нет улиц. Встань на свободную и купи!</p>'}</div>`;

  const refresh = () => openPlayer(pid);
  openSheet(html, Object.assign(propHandlers(refresh), {
    pay: () => chooseTarget('Кому платим?', S.players.filter(x => x.id !== pid).map(x => x.id), to => {
      openPad({
        title: `${esc(p.name)} платит: ${to === 'bank' ? 'Банку' : esc(player(to).name)}`,
        buttons: [{ label: '💸 Заплатить', cls: 'red', fn: a => move(pid, to, a, { say: `−${fmt(a)}`, tok: pid, spoken: `Плати ${a} долларов` }) }],
      });
    }, true),
    get: () => openPad({ title: `${esc(p.name)} получает из банка`, buttons: [{ label: '💰 Получить', cls: 'green', fn: a => move('bank', pid, a, { say: `+${fmt(a)}`, spoken: `Получи ${a} долларов!` }) }] }),
    manual: () => openPad({
      title: `Поправить деньги: ${esc(p.name)} (сейчас ${fmt(p.money)})`,
      buttons: [
        { label: '＋ Прибавить', cls: 'green', fn: a => { commit(() => { player(pid).money += a; }); toast(`Исправлено: +${fmt(a)}`, pid); } },
        { label: '－ Убавить', cls: 'red', fn: a => { commit(() => { player(pid).money -= a; }); toast(`Исправлено: −${fmt(a)}`, pid); } },
        { label: '＝ Сделать ровно', cls: '', allowZero: true, fn: a => { commit(() => { player(pid).money = a; }); toast(`Теперь ${fmt(a)}`, pid); } },
      ],
    }),
    setturn: () => { closeSheet(); commit(() => { S.turn = S.players.indexOf(player(pid)); }); sfx('turn'); announce(`Ходит ${p.name}`, pid); },
    jailtoggle: () => { commit(() => { player(pid).jail = !player(pid).jail; if (player(pid).jail) player(pid).pos = 10; }); refresh(); },
  }));
}

/* ---------- Начало игры ---------- */
let pickOrder = [];
const pickNames = {};
let canBack = false;

function showSetup(back) {
  canBack = back; pickOrder = [];
  $('#setup').hidden = false;
  renderSetup();
}
function renderSetup() {
  const money = ($('#start-money') && $('#start-money').value) || START_MONEY;
  $('#setup').innerHTML = `<div class="setup-box">
    <h1>Банкир <span>Монополии</span></h1>
    <p>Нажмите на фишки по порядку хода — от 2 до 4 игроков</p>
    <div class="pick-grid">${Object.keys(TOKENS).map(k => {
      const n = pickOrder.indexOf(k), on = n >= 0;
      return `<div class="pick ${on ? 'on' : ''}">
        <span class="num">${n + 1}</span>
        <button class="pick-btn" data-tok="${k}" aria-pressed="${on}">
          <div class="tk ${on ? 'happy' : ''}">${tokenSVG(k, on ? 'happy' : 'ok')}</div><b>${TOKENS[k].name}</b>
        </button>
        ${on ? `<input id="name-${k}" data-name="${k}" maxlength="14" placeholder="Имя игрока" value="${esc(pickNames[k] || '')}">` : ''}
      </div>`;
    }).join('')}</div>
    <label class="start-money">Деньги на старте: $<input id="start-money" type="number" inputmode="numeric" min="0" step="100" value="${money}"></label>
    <div class="row">
      ${canBack ? '<button class="big ghost" data-sa="back">Назад к игре</button>' : ''}
      <button class="big gold" data-sa="start" ${pickOrder.length < 2 ? 'disabled' : ''}>Играем! 🎲</button>
    </div>
  </div>`;
}

function newGame() {
  const money = Math.max(0, parseInt($('#start-money').value, 10) || START_MONEY);
  S = {
    players: pickOrder.map(k => ({ id: k, token: k, name: (pickNames[k] || '').trim() || TOKENS[k].name, money, pos: 0, jail: false })),
    turn: 0,
    props: {},
  };
  BOARD.forEach((c, i) => { if (c.price) S.props[i] = { owner: null, houses: 0, mort: false }; });
  history = []; shownMoney = {};
  S.players.forEach(p => { shownMoney[p.id] = p.money; });
  save();
  $('#setup').hidden = true;
  render();
  sfx('buy');
  bigWord('ПОЕХАЛИ!', '#ffd84a');
  speak(`Начинаем! Первым ходит ${cur().name}`);
}

/* ---------- События ---------- */
function bindEvents() {
  $('#players').addEventListener('click', e => {
    const c = e.target.closest('.pcard');
    if (c) { sfx('tap'); openPlayer(c.dataset.pid); }
  });
  $('#board').addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (a) {
      if (a.dataset.act === 'next') nextTurn();
      if (a.dataset.act === 'go') { const p = cur(); move('bank', p.id, GO_BONUS, { say: `+${fmt(GO_BONUS)} за Старт`, spoken: `Получи ${GO_BONUS} долларов!` }); }
      return;
    }
    const c = e.target.closest('.cell');
    if (c) openCell(+c.dataset.i);
  });
  $('#sheet-backdrop').addEventListener('click', e => {
    if (e.target.id === 'sheet-backdrop' || e.target.closest('.close')) { closeSheet(); return; }
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const h = sheetHandlers[b.dataset.act];
    if (h) h(b.dataset, b);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

  $('#btn-undo').addEventListener('click', undo);
  const toggle = (btn, key) => {
    $(btn).setAttribute('aria-pressed', settings[key]);
    $(btn).addEventListener('click', () => {
      settings[key] = !settings[key];
      $(btn).setAttribute('aria-pressed', settings[key]);
      storeSet(SET_KEY, settings);
      if (key === 'sound') sfx('tap');
      if (key === 'voice') speak('Голос включён');
    });
  };
  toggle('#btn-sound', 'sound');
  toggle('#btn-voice', 'voice');
  $('#btn-new').addEventListener('click', () => {
    openSheet(`<h2>Начать новую игру?</h2><p class="say">Текущая игра сотрётся.</p>
      <div class="actions"><button class="big red" data-act="yes">Да, новая игра</button><button class="big ghost" data-act="no">Нет, играем дальше</button></div>`,
    { yes: () => { closeSheet(); showSetup(true); }, no: closeSheet });
  });

  $('#setup').addEventListener('click', e => {
    const t = e.target.closest('[data-tok]');
    if (t) {
      const k = t.dataset.tok, n = pickOrder.indexOf(k);
      if (n >= 0) pickOrder.splice(n, 1); else if (pickOrder.length < 4) pickOrder.push(k);
      sfx('tap'); renderSetup();
      return;
    }
    const a = e.target.closest('[data-sa]');
    if (!a || a.disabled) return;
    if (a.dataset.sa === 'start') newGame();
    if (a.dataset.sa === 'back') $('#setup').hidden = true;
  });
  $('#setup').addEventListener('input', e => {
    if (e.target.dataset.name) pickNames[e.target.dataset.name] = e.target.value;
  });

  // Экран не гаснет во время игры
  document.addEventListener('pointerdown', () => {
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* нет поддержки */ }
  }, { once: true });
}

/* ---------- Запуск ---------- */
(function init() {
  const st = storeGet(SET_KEY);
  if (st) Object.assign(settings, st);
  bindEvents();
  const saved = storeGet(SAVE_KEY);
  if (saved && saved.S && saved.S.players && saved.S.players.length) {
    S = saved.S; history = saved.history || [];
    S.players.forEach(p => { shownMoney[p.id] = p.money; });
    render();
  } else {
    showSetup(false);
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
