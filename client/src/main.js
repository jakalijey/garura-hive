import { init, getHostLanguage } from '@nimiq/mini-app-sdk';
import { createScene } from './scene.js';
import { sound } from './audio.js';

const API = import.meta.env.VITE_API || 'https://signal.heylogram.tv/hiveapi';
const $ = (id) => document.getElementById(id);

const store = (() => {
  let ls = null; try { ls = window.localStorage; ls.getItem('x'); } catch { ls = null; }
  const mem = {}; let ready = !!ls;
  const inFrame = (() => { try { return window.parent !== window; } catch { return true; } })();
  if (!ls && inFrame) {
    window.addEventListener('message', (e) => { if (e.source === window.parent && e.data?.tur === 'hl-depo' && e.data.islem === 'hepsi') { Object.assign(mem, e.data.veri || {}); ready = true; } });
    let n = 0; const ask = () => { if (ready || n++ > 12) return; window.parent.postMessage({ tur: 'hl-depo', islem: 'hepsi' }, '*'); setTimeout(ask, 250); }; ask();
  }
  return {
    whenReady: () => new Promise((r) => { let n = 0; const t = () => (ready || n++ > 14 ? r() : setTimeout(t, 200)); t(); }),
    get: (k) => (ls ? ls.getItem('hive_' + k) : mem[k] ?? null),
    set: (k, v) => { if (ls) { try { ls.setItem('hive_' + k, v); } catch {} } else { mem[k] = v; if (inFrame) window.parent.postMessage({ tur: 'hl-depo', islem: 'yaz', anahtar: k, deger: v }, '*'); } },
    del: (k) => { if (ls) { try { ls.removeItem('hive_' + k); } catch {} } else { delete mem[k]; if (inFrame) window.parent.postMessage({ tur: 'hl-depo', islem: 'sil', anahtar: k }, '*'); } },
  };
})();

const TX = {
  en: { rank: 'Ranking', how: 'How to play', jar: 'Your jar', intro: 'Tap the honeycomb of the Garura tree, fill your jar with honey and get it as NIM.',
        set: 'Settings', sound: 'Sound', vibe: 'Vibration', langLbl: 'Language', useNimiq: 'Connect with Nimiq Pay', walletNo: 'Nimiq Pay did not share an address. You can type it below.', addrLbl: 'Your Nimiq address (NQ…)', nameLbl: 'Name on the ranking', start: 'Start',
        loginHint: 'Honey is only ever sent to this address; no signature, no payment. An exchange deposit address works too.',
        today: 'Today', ceil: 'Limit', ura: 'URA claimed', wd: 'Withdraw', wdN: (a) => `Withdraw ${a} NIM`, acc: 'Account', logout: 'Use another address',
        badAddr: 'That is not a valid Nimiq address. Check it (it starts with NQ).', tooMany: 'Too many sign-ins from here, try again later.', net: 'Connection problem, try again.',
        full: "Today's honeycomb is full. Claim URA in the Garura tree to raise your limit, or come back tomorrow.", budget: 'The hive is empty for today. Come back tomorrow.',
        q: 'Quick check — answer to keep tapping:', wrong: 'Not quite, try again.', min: (m) => `You can withdraw from ${m} NIM.`,
        queued: (a, at) => `${a} NIM is in the payout queue · sent around ${at}`, queuedOff: (a) => `${a} NIM is in the payout queue · payouts start soon`,
        added: (a) => `${a} NIM added to the payout queue.`, paid: (a) => `Paid so far: ${a} NIM`, empty: 'No honey collected yet. Be the first!',
        how1: (per) => `Tap the honeycomb: every tap puts ${per} NIM of honey in your jar.`, how2: 'Tapping alone fills about 1 NIM a day.',
        how3: 'Claim URA in the URA game (Garura tree) and link this Nimiq address there: every 1,000 URA claimed today adds +5 NIM to today\'s limit (up to 20).',
        how4: 'From 1 NIM you can withdraw. Payouts go out together about once an hour from the game\'s wallet; you pay no fee.',
        how5: 'A short sum question appears now and then to keep bots away. Nothing here depends on luck.',
        hComb: 'Honeycomb', hCombT: (per) => `Tap anywhere: every tap puts ${per} NIM of honey in your jar. The cells fill as your day goes on (about 1 NIM a day by tapping alone).`,
        hJar: 'Jar', hJarT: (m) => `Honey collects here. A full jar = ${m} NIM.`,
        hFull: 'Full jars', hFullT: 'Every full jar moves to this badge. ×2 means 2 jars are ready to withdraw.',
        hBee: 'Bees', hBeeT: "Claim URA in the Garura tree and link this Nimiq address there: every 1,000 URA claimed today brings a bee and +5 NIM to today's limit (the daily limit tops out at 20 NIM).",
        hLeaf: 'URA leaf', hLeafT: 'Top left. Tap it to open URA. When you have claimed URA today, turquoise sparkles drift down from it.',
        hWd: 'Withdraw', hWdT: "Your jars join the payout queue and are sent together about once an hour from the game's wallet. You pay no fee.",
        queuedBtn: (a, at) => `${a} NIM in the payout queue · ${at}`,
        rkToday: 'Today', rkAll: 'All time', rkYou: 'You', rkFoot: (n) => `Top 20 · ${n} ${n === 1 ? 'player' : 'players'}`,
        rkNone: 'You are not on the list yet. Tap the honeycomb and you are in.', rkNoneToday: 'No honey from you today yet. Tap and climb.', rkEmptyToday: 'Nobody has collected honey today yet. Be the first!' },
  tr: { rank: 'Sıralama', how: 'Nasıl oynanır', jar: 'Kavanozun', intro: 'Garura ağacının peteğine dokun, kavanozunu balla doldur, NIM olarak al.',
        set: 'Ayarlar', sound: 'Ses', vibe: 'Titreşim', langLbl: 'Dil', useNimiq: 'Nimiq Pay ile bağlan', walletNo: 'Nimiq Pay adres vermedi. Aşağıya yazabilirsin.', addrLbl: 'Nimiq adresin (NQ…)', nameLbl: 'Sıralamada görünecek isim', start: 'Başla',
        loginHint: 'Bal yalnızca bu adrese gönderilir; imza yok, ödeme yok. Borsadaki yatırma adresin de olur.',
        today: 'Bugün', ceil: 'Sınır', ura: 'URA claim', wd: 'Çek', wdN: (a) => `${a} NIM çek`, acc: 'Hesap', logout: 'Başka adres kullan',
        badAddr: 'Bu geçerli bir Nimiq adresi değil. Kontrol et (NQ ile başlar).', tooMany: 'Buradan çok fazla giriş yapıldı, biraz sonra dene.', net: 'Bağlantı sorunu, tekrar dene.',
        full: 'Bugünkü petek doldu. Garura ağacında URA claim ederek sınırını yükselt ya da yarın gel.', budget: 'Petek bugünlük boşaldı. Yarın gel.',
        q: 'Kısa kontrol — devam etmek için cevapla:', wrong: 'Olmadı, tekrar dene.', min: (m) => `${m} NIM'den itibaren çekebilirsin.`,
        queued: (a, at) => `${a} NIM ödeme sırasında · yaklaşık ${at}'de gönderilir`, queuedOff: (a) => `${a} NIM ödeme sırasında · ödemeler yakında başlıyor`,
        added: (a) => `${a} NIM ödeme sırasına eklendi.`, paid: (a) => `Şimdiye kadar ödenen: ${a} NIM`, empty: 'Henüz kimse bal toplamadı. İlk sen ol!',
        how1: (per) => `Peteğe dokun: her dokunuş kavanozuna ${per} NIM bal koyar.`, how2: 'Tek başına dokunarak günde yaklaşık 1 NIM dolar.',
        how3: "URA oyununda (Garura ağacı) URA claim et ve bu Nimiq adresini orada bağla: bugün claim ettiğin her 1000 URA bugünkü sınırına +5 NIM ekler (en çok 20).",
        how4: "1 NIM'den itibaren çekebilirsin. Ödemeler oyunun cüzdanından yaklaşık saatte bir toplu gönderilir; ücret ödemezsin.",
        how5: 'Botlara karşı ara sıra kısa bir toplama sorusu çıkar. Burada hiçbir şey şansa bağlı değil.',
        hComb: 'Petek', hCombT: (per) => `Herhangi bir yere dokun: her dokunuş kavanozuna ${per} NIM bal koyar. Gün ilerledikçe gözler dolar (tek başına dokunarak günde yaklaşık 1 NIM).`,
        hJar: 'Kavanoz', hJarT: (m) => `Bal burada birikir. Dolu bir kavanoz = ${m} NIM.`,
        hFull: 'Dolu kavanozlar', hFullT: 'Dolan her kavanoz bu rozete geçer. ×2 = çekmeye hazır 2 kavanoz.',
        hBee: 'Arılar', hBeeT: "Garura ağacında URA claim et ve bu Nimiq adresini orada bağla: bugün claim ettiğin her 1000 URA bir arı ve bugünkü sınırına +5 NIM getirir (günlük sınır en çok 20 NIM).",
        hLeaf: 'URA yaprağı', hLeafT: 'Sol üstte. Dokununca URA açılır. Bugün URA claim ettiysen ondan turkuaz ışıltılar dökülür.',
        hWd: 'Çek', hWdT: "Kavanozların ödeme sırasına girer ve oyunun cüzdanından yaklaşık saatte bir toplu gönderilir. Ücret ödemezsin.",
        queuedBtn: (a, at) => `${a} NIM ödeme sırasında · ${at}`,
        rkToday: 'Bugün', rkAll: 'Tüm zamanlar', rkYou: 'Sen', rkFoot: (n) => `İlk 20 · ${n} oyuncu`,
        rkNone: 'Henüz listede değilsin. Peteğe dokun, listeye gir.', rkNoneToday: 'Bugün henüz bal toplamadın. Dokun ve yüksel.', rkEmptyToday: 'Bugün henüz kimse bal toplamadı. İlk sen ol!' },
};
let lang = (store.get('lang') || (getHostLanguage?.() || navigator.language || 'en')).slice(0, 2) === 'tr' ? 'tr' : 'en';
const T = (k, ...a) => { const v = TX[lang][k]; return typeof v === 'function' ? v(...a) : v; };
let me = null;
function applyLang() {
  document.documentElement.lang = lang; $('langBtn').textContent = lang === 'tr' ? 'EN' : 'TR';
  document.querySelectorAll('[data-t]').forEach((el) => { const v = TX[lang][el.dataset.t]; if (typeof v === 'string') el.textContent = v; });
  render();
}

const openSheets = [];
function openSheet(id) {
  const el = $(id); if (el.classList.contains('on')) return;
  el.classList.add('on'); openSheets.push(id);
  history.pushState({ hiveSheet: id }, '');
}
function closeTop() { const id = openSheets.pop(); if (id) $(id).classList.remove('on'); }
window.addEventListener('popstate', () => { if (openSheets.length) closeTop(); });
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => history.back()));
document.querySelectorAll('.sheet').forEach((s) => s.addEventListener('click', (e) => { if (e.target === s) history.back(); }));

const api = async (path, body) => {
  const r = await fetch(API + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};
let token = null;
let msgTimer = 0;
const msg = (t, ms = 3500) => { const el = $('msg'); clearTimeout(msgTimer); if (!t) { el.classList.remove('on'); return; } el.textContent = t; el.classList.add('on'); if (ms) msgTimer = setTimeout(() => el.classList.remove('on'), ms); };

const scene = await createScene($('pixi'), { onTap: (x, y) => tap(x, y), onLand: () => sound.land(), onJarFull: () => { sound.withdraw(); buzz(60); } });
const opt = { sound: store.get('sound') !== '0', vibe: store.get('vibe') !== '0' };
sound.setEnabled(opt.sound);
const buzz = (ms) => { if (opt.vibe) { try { navigator.vibrate?.(ms); } catch {} } };

let render = function render() {
  const inGame = !!me;
  $('login').classList.toggle('hidden', inGame);
  $('hud').classList.toggle('hidden', !inGame); $('bottom').classList.toggle('hidden', !inGame); $('rankBtn').classList.toggle('hidden', !inGame);
  if (!me) return;
  const num = (s) => Number(s) || 0;
  $('jar').textContent = me.jar;
  const at = me.nextBatchAt ? new Date(me.nextBatchAt).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : '';
  const wd = $('wdBtn'); wd.disabled = !me.canWithdraw; wd.classList.toggle('hot', !!me.canWithdraw);
  wd.innerHTML = '';
  wd.append(me.canWithdraw ? T('wdN', me.jar) : T('wd'));
  if (num(me.queued) > 0) { const sm = document.createElement('small'); sm.textContent = T('queuedBtn', me.queued, at); wd.append(sm); }
  $('leaf').classList.remove('hidden');
  const ceil = num(me.ceilingToday) || 1;
  const per = num(me.minWithdraw || 1), whole = Math.floor(num(me.jar) / per + 1e-9), frac = num(me.jar) / per - whole;
  scene.setState({ progress: Math.min(1, num(me.earnedToday) / ceil), jarRatio: frac > 0.0001 ? Math.max(0.06, Math.sqrt(frac)) : 0, fullJars: whole, ready: !!me.canWithdraw, bees: 1 + Math.floor(num(me.uraClaimedToday) / 1000) });
  renderHow(me.honeyPerTap, me.minWithdraw);
  const lr = $('leaf').getBoundingClientRect(), sr = $('stage').getBoundingClientRect();
  scene.setDust(num(me.uraClaimedToday) > 0, lr.left - sr.left + lr.width / 2, lr.top - sr.top + lr.height * 0.85);
  $('accAddr').textContent = me.address; $('accPaid').textContent = T('paid', me.paidTotal);
  $('accBox').classList.remove('hidden');
}
const HEX = (inner, fill = 'none') => `<svg viewBox="-30 -30 60 60"><polygon points="0,-26 22.5,-13 22.5,13 0,26 -22.5,13 -22.5,-13" fill="${fill}" stroke="#d97706" stroke-width="3"/>${inner}</svg>`;
const ICON = {
  comb: `<svg viewBox="-30 -30 60 60">${[[0,0],[-15,-9],[15,-9],[-15,9],[15,9],[0,-18],[0,18]].map(([x,y],i)=>`<polygon transform="translate(${x*1.05},${y*1.05}) scale(.34)" points="0,-26 22.5,-13 22.5,13 0,26 -22.5,13 -22.5,-13" fill="${i===0?'#d97706':'#1c140a'}" stroke="#92400e" stroke-width="5"/>`).join('')}</svg>`,
  jar: `<svg viewBox="-30 -30 60 60"><rect x="-16" y="-22" width="32" height="7" rx="2" fill="#2a2433"/><rect x="-20" y="-16" width="40" height="38" rx="9" fill="none" stroke="#a79f8f" stroke-width="2.5"/><rect x="-18" y="4" width="36" height="16" rx="7" fill="#d97706"/></svg>`,
  full: HEX('<text y="7" text-anchor="middle" font-size="19" font-weight="800" fill="#f5efe1" font-family="system-ui">×2</text>', 'rgba(217,119,6,.22)'),
  bee: HEX('<ellipse cx="0" cy="-4" rx="9" ry="6.5" fill="#f59e0b"/><rect x="-3" y="-10" width="2.5" height="12" fill="#1a0d2e"/><rect x="2" y="-10" width="2.5" height="12" fill="#1a0d2e"/><text y="16" text-anchor="middle" font-size="11" font-weight="800" fill="#f5efe1" font-family="system-ui">×1</text>', 'rgba(217,119,6,.12)'),
  leaf: `<img src="ura-leaf.png" alt="" />`,
  wd: `<svg viewBox="-30 -30 60 60"><rect x="-26" y="-12" width="52" height="24" rx="8" fill="#d97706"/><path d="M-6 -2 L0 5 L6 -2 M0 5 L0 -8" stroke="#1a0d2e" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
function renderHow(per, min) {
  const rows = [['comb', 'hComb', T('hCombT', per)], ['jar', 'hJar', T('hJarT', min)], ['full', 'hFull', T('hFullT')], ['bee', 'hBee', T('hBeeT')], ['leaf', 'hLeaf', T('hLeafT')], ['wd', 'hWd', T('hWdT')]];
  $('howList').innerHTML = rows.map(([ic, h, t]) => `<div class="it"><div class="ic">${ICON[ic]}</div><div><b>${T(h)}</b><span>${t}</span></div></div>`).join('');
}

async function refresh() {
  if (!token) return false;
  const r = await api('/api/me?token=' + encodeURIComponent(token)).catch(() => null);
  if (!r || r.status !== 200) return false;
  me = r; render(); return true;
}

async function signIn(address, name) {
  $('loginErr').textContent = ''; $('loginBtn').disabled = true;
  try {
    const device = store.get('device') || Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
    store.set('device', device);
    const r = await api('/api/session', { address, name, device });
    if (!r.token) { $('loginErr').textContent = r.error === 'bad_address' ? T('badAddr') : r.error === 'too_many_sessions' ? T('tooMany') : T('net'); return; }
    token = r.token; store.set('token', token); store.set('address', r.address); store.set('name', r.name || '');
    await refresh();
  } catch { $('loginErr').textContent = T('net'); }
  finally { $('loginBtn').disabled = false; }
}
$('loginBtn').onclick = () => signIn($('addr').value, $('name').value);
['addr', 'name'].forEach((id) => $(id).addEventListener('focus', (e) => setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250)));

const wallet = (() => {
  let ready = null, seq = 0; const waiting = new Map();
  const inFrame = (() => { try { return window.parent !== window; } catch { return true; } })();
  window.addEventListener('message', (e) => {
    const v = e.data; if (e.source !== window.parent || !v || v.tur !== 'hl-nimiq' || v.islem !== 'sonuc') return;
    const w = waiting.get(v.id); if (!w) return; waiting.delete(v.id);
    v.ok ? w.ok(v.sonuc) : w.no(Object.assign(new Error(v.hata?.mesaj || 'wallet'), { code: v.hata?.kod }));
  });
  const viaBridge = () => new Promise((resolve) => {
    if (!inFrame) return resolve(null);
    const on = (e) => { const v = e.data; if (e.source === window.parent && v?.tur === 'hl-nimiq' && v.islem === 'durum') { window.removeEventListener('message', on); clearTimeout(t); resolve(v.var ? {
      listAccounts: () => new Promise((ok, no) => { const id = ++seq; waiting.set(id, { ok, no }); window.parent.postMessage({ tur: 'hl-nimiq', islem: 'cagir', id, yontem: 'listAccounts', args: [] }, '*'); }),
    } : null); } };
    window.addEventListener('message', on);
    const t = setTimeout(() => { window.removeEventListener('message', on); resolve(null); }, 11_000);
    window.parent.postMessage({ tur: 'hl-nimiq', islem: 'sor' }, '*');
  });
  return {
    get: () => (ready ||= (window.nimiq || !inFrame ? init({ timeout: 4000 }).catch(() => null) : viaBridge())),
    async address() {
      const n = await this.get(); if (!n) return null;
      const list = await n.listAccounts();
      return Array.isArray(list) ? (typeof list[0] === 'string' ? list[0] : list[0]?.address) || null : null;
    },
  };
})();
let walletTried = false;
async function walletConnect(auto) {
  if (token || (auto && walletTried)) return; walletTried = true;
  try {
    const a = await wallet.address(); if (!a || token) return;
    $('addr').value = a;
    await signIn(a, $('name').value.trim() || store.get('name') || '');
  } catch { if (!auto) $('loginErr').textContent = T('walletNo'); }
}
wallet.get().then((n) => { if (!n) return; $('useNimiq').classList.remove('hidden'); $('useNimiq').onclick = () => walletConnect(false); });

let queue = [], busy = false, pendingAnswer = null;
function tap(x, y) { if (!me || $('q').style.display === 'flex') return; sound.tap(); if (queue.length < 20) queue.push({ x, y }); pump(); }
async function pump() {
  if (busy || !queue.length) return; busy = true;
  while (queue.length) {
    const { x, y } = queue.shift();
    let r; try { r = await api('/api/tap', { token, answer: pendingAnswer ?? undefined }); } catch { msg(T('net')); queue = []; break; }
    pendingAnswer = null;
    if (r.question) { queue = []; $('q').style.display = 'flex'; $('ans').value = ''; $('ans').placeholder = r.question; msg(T('q'), 0); break; }
    if (r.status === 401) { queue = []; me = null; token = null; store.del('token'); render(); walletTried = false; walletConnect(true); break; }
    if (r.ok) {
      if (r.gained && r.gained !== '0') { scene.drop(x, y, '+' + r.gained); buzz(8); msg(''); }
      me.jar = r.jar; render();
      if (r.reason === 'ceiling') { scene.full(); sound.full(); buzz(40); msg(T('full')); queue = []; }
      if (r.reason === 'budget') { scene.full(); msg(T('budget')); queue = []; }
    }
    await new Promise((z) => setTimeout(z, 65));
  }
  busy = false; refresh().catch(() => {});
}
$('ansBtn').onclick = () => { pendingAnswer = Number($('ans').value); $('q').style.display = 'none'; msg(''); queue = [{ x: innerWidth / 2, y: innerHeight * 0.36 }]; pump(); };
$('ans').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('ansBtn').click(); });

$('wdBtn').onclick = async () => {
  if (!me?.canWithdraw) return;
  $('wdBtn').disabled = true;
  try {
    const r = await api('/api/withdraw', { token });
    if (r.ok) { scene.withdraw(); sound.withdraw(); buzz(30); msg(T('added', r.amount)); }
    else msg(r.error === 'below_minimum' ? T('min', r.minimum) : T('net'));
  } catch { msg(T('net')); }
  await refresh();
};

$('howBtn').onclick = () => openSheet('sheetHow');
let rkScope = store.get('rank') === 'all' ? 'all' : 'today';
const esc = (x) => String(x).replace(/[<>&"]/g, '');
async function renderRank() {
  $('rkToday').classList.toggle('on', rkScope === 'today'); $('rkAll').classList.toggle('on', rkScope === 'all');
  $('rkToday').setAttribute('aria-selected', String(rkScope === 'today')); $('rkAll').setAttribute('aria-selected', String(rkScope === 'all'));
  const r = await api(`/api/leaderboard?scope=${rkScope}${token ? '&token=' + encodeURIComponent(token) : ''}`).catch(() => ({ top: [] }));
  const top = r.top || [], you = (x) => (x.you ? `<span class="tagyou">${T('rkYou')}</span>` : '');
  if (!top.length) { $('lb').innerHTML = `<div class="rempty">${rkScope === 'today' ? T('rkEmptyToday') : T('empty')}</div>`; }
  else {
    const pod = top.slice(0, 3).map((x) => `<div class="pod p${x.pos}${x.you ? ' you' : ''}"><div class="hx">${x.pos}</div><div class="nm">${esc(x.name)}</div><div class="hn">${x.honey} NIM</div></div>`).join('');
    const rows = top.slice(3).map((x) => `<div class="rrow${x.you ? ' you' : ''}"><span class="ps">${x.pos}</span><span class="nm">${esc(x.name)}${you(x)}</span><span class="hn">${x.honey}</span></div>`).join('');
    $('lb').innerHTML = `<div class="podium">${pod}</div>${rows ? `<div class="rlist">${rows}</div>` : ''}`;
  }
  $('rkFoot').textContent = top.length ? T('rkFoot', r.players ?? top.length) : '';
  const me = r.me, el = $('rkMe'); el.className = 'rme';
  if (!me) el.innerHTML = '';
  else if (!me.pos) { el.classList.add('none'); el.textContent = rkScope === 'today' ? T('rkNoneToday') : T('rkNone'); }
  else el.innerHTML = `<span class="ps">${me.pos}.</span><span class="nm">${T('rkYou')} · ${esc(me.name)}</span><span class="hn">${me.honey} NIM</span>`;
}
$('rankBtn').onclick = () => { openSheet('sheetRank'); renderRank(); };
$('rkToday').onclick = () => { rkScope = 'today'; store.set('rank', 'today'); renderRank(); };
$('rkAll').onclick = () => { rkScope = 'all'; store.set('rank', 'all'); renderRank(); };
$('setBtn').onclick = () => { $('optSound').checked = opt.sound; $('optVibe').checked = opt.vibe; openSheet('sheetSet'); };
$('optSound').onchange = (e) => { opt.sound = e.target.checked; sound.setEnabled(opt.sound); store.set('sound', opt.sound ? '1' : '0'); if (opt.sound) sound.tap(); };
$('optVibe').onchange = (e) => { opt.vibe = e.target.checked; store.set('vibe', opt.vibe ? '1' : '0'); buzz(20); };
$('logoutBtn').onclick = () => { token = null; me = null; store.del('token'); $('accBox').classList.add('hidden'); history.back(); render(); };
$('langBtn').onclick = () => { lang = lang === 'tr' ? 'en' : 'tr'; store.set('lang', lang); applyLang(); };

const fitHud = () => { const h = $('hud'); scene.setTopPad(h.classList.contains('hidden') ? 24 : h.offsetTop + h.offsetHeight + 10); };
new ResizeObserver(() => { scene.refit(); fitHud(); }).observe($('stage'));
const _render = render; render = function () { _render(); requestAnimationFrame(() => { scene.refit(); fitHud(); }); };

await store.whenReady();
$('addr').value = store.get('address') || ''; $('name').value = store.get('name') || '';
token = store.get('token');
applyLang();
if (token && !(await refresh())) { token = null; store.del('token'); render(); }
if (!token) walletConnect(true);
setInterval(() => { if (me && !busy) refresh().catch(() => {}); }, 30_000);
