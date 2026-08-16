import { api, initTheme } from '/auth.js';
import { icon } from '/icons.js';

try {
  initTheme();
} catch {
  /* theme is optional when storage is blocked */
}

const terminal = document.getElementById('terminal');
const lines = [
  { type: 'prompt', text: '$ nmap -sV target.lab' },
  { type: 'output', text: 'PORT   STATE SERVICE' },
  { type: 'output', text: '22/tcp open  ssh' },
  { type: 'output', text: '80/tcp open  http' },
  { type: 'output', text: '443/tcp open https' },
  { type: 'prompt', text: '$ ./exploit.py --target 10.0.0.1' },
  { type: 'output', text: '[+] Shell obtained!' },
  { type: 'output', text: '[+] Bounty +150 pts' },
];

let lineIdx = 0, charIdx = 0, currentEl = null;

function typeTerminal() {
  if (!terminal) return;
  if (lineIdx >= lines.length) {
    setTimeout(() => { terminal.innerHTML = ''; lineIdx = 0; charIdx = 0; typeTerminal(); }, 4000);
    return;
  }
  const line = lines[lineIdx];
  if (charIdx === 0) {
    currentEl = document.createElement('div');
    if (line.type === 'prompt') currentEl.innerHTML = '<span class="prompt">$ </span><span class="cmd"></span>';
    else currentEl.className = 'output';
    terminal.appendChild(currentEl);
  }
  const target = line.type === 'prompt' ? currentEl.querySelector('.cmd') : currentEl;
  if (charIdx < line.text.length) {
    const text = line.type === 'prompt' ? line.text.slice(2) : line.text;
    target.textContent = text.slice(0, ++charIdx);
    setTimeout(typeTerminal, 30 + Math.random() * 40);
  } else { lineIdx++; charIdx = 0; setTimeout(typeTerminal, 400); }
}
typeTerminal();

(function initIcosahedron() {
  const canvas = document.getElementById('icosahedron');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  let W, H, angleX = 0, angleY = 0;
  const phi = (1 + Math.sqrt(5)) / 2;
  const vertices = [[-1,phi,0],[1,phi,0],[-1,-phi,0],[1,-phi,0],[0,-1,phi],[0,1,phi],[0,-1,-phi],[0,1,-phi],[phi,0,-1],[phi,0,1],[-phi,0,-1],[-phi,0,1]];
  const edges = [[0,1],[0,5],[0,7],[0,10],[0,11],[1,5],[1,7],[1,8],[1,9],[2,3],[2,4],[2,6],[2,10],[2,11],[3,4],[3,6],[3,8],[3,9],[4,9],[4,11],[5,9],[5,11],[6,7],[6,10],[7,8],[8,9],[10,11]];
  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function rotate(v, ax, ay) {
    let [x, y, z] = v;
    const cy = Math.cos(ay), sy = Math.sin(ay);
    let nx = x * cy - z * sy; z = x * sy + z * cy; x = nx;
    const cx = Math.cos(ax), sx = Math.sin(ax);
    return [x, y * cx - z * sx, y * sx + z * cx];
  }
  function project(v) {
    const f = 4 / (4 + v[2] * 0.3);
    return [W/2 + v[0]*Math.min(W,H)*0.22*f, H/2 + v[1]*Math.min(W,H)*0.22*f];
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#00ff88';
    const projected = vertices.map(v => { const r = rotate(v, angleX, angleY); return { pos: project(r), z: r[2] }; });
    edges.forEach(([a,b]) => {
      const pa = projected[a], pb = projected[b];
      ctx.beginPath(); ctx.moveTo(pa.pos[0], pa.pos[1]); ctx.lineTo(pb.pos[0], pb.pos[1]);
      ctx.strokeStyle = accent; ctx.globalAlpha = 0.2 + ((pa.z+pb.z)/2+2)/5*0.6; ctx.lineWidth = 1; ctx.stroke();
    });
    projected.forEach(p => {
      ctx.beginPath(); ctx.arc(p.pos[0], p.pos[1], 2.5, 0, Math.PI*2);
      ctx.fillStyle = accent; ctx.globalAlpha = 0.3+(p.z+2)/5*0.7; ctx.fill();
    });
    ctx.globalAlpha = 1; angleX += 0.003; angleY += 0.005; requestAnimationFrame(draw);
  }
  resize(); draw(); window.addEventListener('resize', resize);
})();

function animateCounters() {
  document.querySelectorAll('.stat-num').forEach(el => {
    const target = parseInt(el.dataset.count, 10), start = performance.now();
    function update(now) {
      const p = Math.min((now-start)/2000, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1-p, 3)));
      if (p < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  });
}

document.querySelectorAll('.feature-card,.program-card,.section-header,.about-text,.bounty-content,.leaderboard,.contact-info,.contact-form,.cta-inner').forEach(el => {
  el.classList.add('reveal');
  new IntersectionObserver(([e]) => { if (e.isIntersecting) e.target.classList.add('visible'); }, { threshold: 0.15 }).observe(el);
});
const heroStats = document.querySelector('.hero-stats');
if (heroStats) new IntersectionObserver(([e]) => { if (e.isIntersecting) animateCounters(); }, { threshold: 0.5 }).observe(heroStats);

async function loadLeaderboard() {
  const el = document.getElementById('leaderboard');
  if (!el) return;
  try {
    const { leaderboard } = await api('/leaderboard');
    const top = (leaderboard || []).slice(0, 5);
    if (!top.length) {
      el.innerHTML = '<li class="leaderboard-empty">Рейтинг поки порожній</li>';
      return;
    }
    el.innerHTML = top.map(u => `<li><span class="rank">${String(u.rank).padStart(2, '0')}</span><span class="name">@${escHtml(u.handle)}</span><span class="pts">${u.bounty_points.toLocaleString('uk-UA')}</span></li>`).join('');
  } catch {
    el.innerHTML = '<li class="leaderboard-empty">Рейтинг тимчасово недоступний</li>';
  }
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

loadLeaderboard();

document.getElementById('contact-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const original = btn.textContent;
  const fd = new FormData(e.target);
  btn.disabled = true; btn.textContent = 'Надсилання...';
  try {
    await api('/applications', {
      method: 'POST',
      body: JSON.stringify({
        name: fd.get('name'),
        email: fd.get('email'),
        direction_id: parseInt(fd.get('direction_id'), 10),
        message: fd.get('message'),
      }),
    });
    btn.innerHTML = `${icon('check', 'ico ico--sm')}Заявку прийнято`; e.target.reset();
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 3000);
  } catch (err) {
    btn.textContent = err.message;
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 3000);
  }
});
