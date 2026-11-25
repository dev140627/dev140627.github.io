/* Portfolio motion: headline split, draggable stickers, parallax, a scroll-scrubbed 3D model,
   a 3D project carousel and a scroll-morphing shape. One requestAnimationFrame loop drives it all. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

  /* ---------- Headline: wrap each letter so it can drop in ---------- */
  $$('[data-split]').forEach((line, li) => {
    const text = line.textContent;
    line.textContent = '';
    line.setAttribute('aria-hidden', 'true');
    [...text].forEach((ch, i) => {
      const s = document.createElement('span');
      s.className = 'char drop';
      s.textContent = ch;
      s.style.animationDelay = `${li * 0.12 + i * 0.04}s`;
      line.appendChild(s);
    });
  });
  const lines = $$('.headline .line');

  /* ---------- Sticker board: drag (pointer or arrow keys) + depth parallax ---------- */
  const board = $('#board');
  const portrait = $('#portrait');
  const stickers = $$('.sticker', board);
  /* Keep every sticker fully inside the board's real outline (incl. its rounded / semicircle
     corners), GAP px in from the edge, accounting for each sticker's tilt. */
  const GAP = 12;
  let shape = null; // board size + effective corner radii, refreshed on resize
  const getShape = () => {
    if (shape) return shape;
    const cs = getComputedStyle(board), W = board.clientWidth, H = board.clientHeight;
    const r = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map(k => parseFloat(cs[`border${k}Radius`]) || 0);
    // CSS shrinks all radii by one factor when adjacent radii overlap
    const f = Math.min(1, W / (r[0] + r[1]), H / (r[1] + r[2]), W / (r[2] + r[3]), H / (r[3] + r[0]));
    return (shape = { W, H, r: r.map(v => v * f) });
  };
  const inside = (x, y) => {
    const { W, H, r } = getShape();
    if (x < GAP || y < GAP || x > W - GAP || y > H - GAP) return false;
    // [corner centre x, y, radius, is-right, is-bottom]
    const corners = [[r[0], r[0], r[0], 0, 0], [W - r[1], r[1], r[1], 1, 0], [W - r[2], H - r[2], r[2], 1, 1], [r[3], H - r[3], r[3], 0, 1]];
    for (const [cx, cy, rad, right, bottom] of corners) {
      if (!rad) continue;
      const qx = right ? x > cx : x < cx, qy = bottom ? y > cy : y < cy;
      if (qx && qy && Math.hypot(x - cx, y - cy) > rad - GAP) return false;
    }
    return true;
  };
  const geom = st => st._geom || (st._geom = {
    w: st.offsetWidth, h: st.offsetHeight,
    a: (parseFloat(getComputedStyle(st).getPropertyValue('--r')) || 0) * Math.PI / 180,
  });
  // does the tilted sticker fit with its top-left (untransformed) at (left, top)?
  const fits = (st, left, top) => {
    const { w, h, a } = geom(st), c = Math.cos(a), s = Math.sin(a);
    const mx = left + w / 2, my = top + h / 2;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([sx, sy]) => {
      const x = sx * w / 2, y = sy * h / 2;
      return inside(mx + x * c - y * s, my + x * s + y * c);
    });
  };
  // nearest fitting position on the line from (fromL, fromT), assumed to fit, to (toL, toT)
  const fitAlong = (st, fromL, fromT, toL, toT) => {
    if (fits(st, toL, toT)) return [toL, toT];
    let lo = 0, hi = 1;
    for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; fits(st, fromL + (toL - fromL) * m, fromT + (toT - fromT) * m) ? lo = m : hi = m; }
    return [fromL + (toL - fromL) * lo, fromT + (toT - fromT) * lo];
  };
  // board-centre anchor: a sticker centred there always fits
  const centreOf = st => { const { w, h } = geom(st), { W, H } = getShape(); return [W / 2 - w / 2, H / 2 - h / 2]; };
  // move a wanted position inside: try per-axis sliding first (feels natural when dragging along an edge)
  const confine = (st, fromL, fromT, toL, toT) => {
    if (fits(st, toL, toT)) return [toL, toT];
    if (!fits(st, fromL, fromT)) [fromL, fromT] = centreOf(st);
    let [l, t] = fitAlong(st, fromL, fromT, toL, fromT);
    [l, t] = fitAlong(st, l, t, l, toT);
    return [l, t];
  };
  addEventListener('resize', () => { shape = null; stickers.forEach(st => { st._geom = null; }); });
  stickers.forEach(st => {
    let ox = 0, oy = 0, sx = 0, sy = 0, id = null;
    st._dx = 0; st._dy = 0;
    const set = (x, y) => {
      const L = st.offsetLeft, T = st.offsetTop;
      const [l, t] = confine(st, L + ox, T + oy, L + x, T + y);
      ox = l - L; oy = t - T;
      st._dx = ox; st._dy = oy;
      st.style.setProperty('--dx', ox + 'px');
      st.style.setProperty('--dy', oy + 'px');
    };
    st.addEventListener('pointerdown', e => {
      id = e.pointerId; st.setPointerCapture(id);
      sx = e.clientX - ox; sy = e.clientY - oy;
      st.classList.add('dragging');
    });
    st.addEventListener('pointermove', e => { if (e.pointerId === id) set(e.clientX - sx, e.clientY - sy); });
    const end = e => { if (e.pointerId !== id) return; id = null; st.classList.remove('dragging'); };
    st.addEventListener('pointerup', end);
    st.addEventListener('pointercancel', end);
    st.addEventListener('keydown', e => {
      const k = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[e.key];
      if (k) { e.preventDefault(); set(ox + k[0], oy + k[1]); }
    });
  });

  // pointer position: board-local (for stickers) and window-wide (for the 3D model)
  const boardPtr = { x: 0, y: 0, tx: 0, ty: 0 };
  const winPtr = { x: 0, y: 0, tx: 0, ty: 0 };
  board.addEventListener('pointermove', e => {
    const r = board.getBoundingClientRect();
    boardPtr.tx = (e.clientX - r.left) / r.width - 0.5;
    boardPtr.ty = (e.clientY - r.top) / r.height - 0.5;
  });
  board.addEventListener('pointerleave', () => { boardPtr.tx = boardPtr.ty = 0; });
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    winPtr.tx = e.clientX / innerWidth - 0.5;
    winPtr.ty = e.clientY / innerHeight - 0.5;
  });

  /* ---------- Reveal on enter ---------- */
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }), { threshold: 0.15 });
  $$('[data-reveal]').forEach(el => io.observe(el));

  /* ---------- Toolkit orbit: pins travel round two rings, outer and inner in opposite directions ---------- */
  function createOrbit() {
    const plane = $('#orbit');
    if (!plane) return null;
    const ringOuter = $('#ring-outer');
    const planets = $$('.planet', plane).map(el => ({ el, outer: el.dataset.ring === 'outer', a: +el.dataset.a }));
    let cur = 0;
    return (p, time) => {
      cur = lerp(cur, p, 0.08); // eased so it glides rather than tracking the wheel exactly
      const drift = reduce ? 0 : time * 0.004;    // a very slow idle turn so it never sits dead still
      const rotOuter = cur * 160 + drift;
      const rotInner = -cur * 220 - drift * 1.5;
      const half = plane.offsetWidth / 2;
      planets.forEach(({ el, outer, a }) => {
        const r = half * (outer ? 1 : 0.56);
        const ang = (a + (outer ? rotOuter : rotInner)) * Math.PI / 180;
        el.style.transform = `translate3d(${(half + r * Math.cos(ang)).toFixed(1)}px, ${(half + r * Math.sin(ang)).toFixed(1)}px, 0)`;
      });
      ringOuter.style.transform = `rotate(${rotOuter.toFixed(2)}deg)`;
    };
  }

  /* ---------- 3D carousel ---------- */
  function createCarousel() {
    const stage = $('#carousel'), ring = $('#ring');
    if (!stage) return null;
    // with only a few projects the ring looks empty, so repeat them (copies hidden from screen readers)
    const originals = $$('.card', ring), real = originals.length;
    let copies = 1;
    while (real * copies < 6) copies++;
    for (let c = 1; c < copies; c++) originals.forEach(card => {
      const clone = card.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      ring.appendChild(clone);
    });
    const cards = $$('.card', ring), n = cards.length, step = 360 / n;
    const count = $('#count');
    let R = 300, angle = 0, target = 0, dragging = false, startX = 0, startT = 0, lastX = 0, vel = 0, moved = 0, shown = -1;
    const norm = d => ((d % 360) + 540) % 360 - 180;
    const snap = v => Math.round(v / step) * step;

    function layout() {
      const w = cards[0].offsetWidth;
      R = Math.round(w / 2 / Math.tan(Math.PI / n) + w * 0.14);
      cards.forEach((c, i) => { c.style.transform = `rotateY(${i * step}deg) translateZ(${R}px)`; });
    }
    layout();
    addEventListener('resize', layout);

    const go = d => { target = snap(target) + d * step; };
    $('#prev').addEventListener('click', () => go(-1));
    $('#next').addEventListener('click', () => go(1));
    stage.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    });

    stage.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true; moved = 0; vel = 0;
      startX = lastX = e.clientX; startT = target;
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('dragging');
    });
    stage.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      moved = Math.max(moved, Math.abs(dx));
      vel = e.clientX - lastX; lastX = e.clientX;
      target = startT - dx * 0.22;
    });
    const end = e => {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove('dragging');
      if (moved < 6) { // a tap: bring the tapped card to the front
        const card = document.elementFromPoint(e.clientX, e.clientY)?.closest('.card');
        const i = cards.indexOf(card);
        if (i >= 0) { target = snap(target + norm(i * step - target)); return; }
      }
      target = snap(target - vel * 1.5);
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);

    // horizontal trackpad swipes
    let wheelTimer;
    stage.addEventListener('wheel', e => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      target += e.deltaX * 0.12;
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => { target = snap(target); }, 140);
    }, { passive: false });

    return tilt => {
      angle = reduce ? target : lerp(angle, target, dragging ? 0.35 : 0.1);
      ring.style.transform = `translateZ(${-R}px) rotateX(${tilt}deg) rotateY(${-angle}deg)`;
      cards.forEach((c, i) => {
        const diff = norm(i * step - angle);
        const facing = Math.max(0, Math.cos(diff * Math.PI / 180));
        c.style.opacity = (0.12 + 0.88 * facing ** 1.6).toFixed(3);
        c.classList.toggle('is-front', Math.abs(diff) < step / 2);
      });
      const idx = ((Math.round(target / step) % real) + real) % real;
      if (idx !== shown) {
        shown = idx;
        count.textContent = `${String(idx + 1).padStart(2, '0')} / ${String(real).padStart(2, '0')}`;
      }
    };
  }

  /* ---------- Process timeline (p = 0 → 1 while the section is pinned) ----------
     0 – INTRO      the model and orbit just spin
     INTRO – OUTRO  five equal slots: step i opens and layer i slides out
     OUTRO – 1      layers close up and everything spins again (and keeps spinning as the section leaves) */
  const INTRO = 0.18, OUTRO = 0.86, SLOT = (OUTRO - INTRO) / 5;
  function stepAt(p) { return p < INTRO ? -1 : clamp(Math.floor((p - INTRO) / SLOT), 0, 4); }

  /* ---------- 3D model: the "D" logo as five extruded layers, scrubbed by scroll ---------- */
  function createModel() {
    const wrap = $('#model-wrap'), canvas = $('#model');
    const T = window.THREE;
    const fail = () => { wrap.classList.add('no-webgl'); $('.model-hint', wrap).textContent = '3D view unavailable in this browser'; return null; };
    if (!T || !canvas) return fail();
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) { return fail(); }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(32, 1, 0.1, 100);
    scene.add(new T.HemisphereLight(0xffffff, 0x1a1a22, 0.85));
    const key = new T.DirectionalLight(0xffffff, 1.15); key.position.set(5, 6, 7); scene.add(key);
    const rim = new T.DirectionalLight(0x9b8cff, 0.9); rim.position.set(-6, -3, -5); scene.add(rim);

    // the logo-mark silhouette: square-ish left side, fully round right side
    const h = 1.7, r = h / 2, w = 0.95, q = 0.12;
    const s = new T.Shape();
    s.moveTo(-w + q, -r);
    s.lineTo(0, -r);
    s.absarc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(-w + q, r);
    s.quadraticCurveTo(-w, r, -w, r - q);
    s.lineTo(-w, -r + q);
    s.quadraticCurveTo(-w, -r, -w + q, -r);
    const geo = new T.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 4, curveSegments: 64 });
    geo.center();

    const colors = ['#5ed3c3', '#f2547d', '#f7d046', '#9b8cff', '#a6e36b'];
    const group = new T.Group();
    scene.add(group);
    const layers = colors.map(c => {
      const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ color: new T.Color(c).convertSRGBToLinear(), roughness: 0.42, metalness: 0.08 }));
      group.add(mesh);
      return { mesh, x: 0, s: 1 };
    });


    // a faint shell of dust for depth
    const pts = new Float32Array(360 * 3);
    for (let i = 0; i < 360; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rad = 3 + Math.random() * 2.5;
      const sq = Math.sqrt(1 - u * u);
      pts.set([rad * sq * Math.cos(th), rad * u, rad * sq * Math.sin(th)], i * 3);
    }
    const dustGeo = new T.BufferGeometry();
    dustGeo.setAttribute('position', new T.BufferAttribute(pts, 3));
    const dust = new T.Points(dustGeo, new T.PointsMaterial({ color: 0xece7df, size: 0.025, transparent: true, opacity: 0.5 }));
    scene.add(dust);

    const orbit = new T.Mesh(new T.TorusGeometry(2.25, 0.006, 8, 200), new T.MeshBasicMaterial({ color: 0xece7df, transparent: true, opacity: 0.65 }));
    orbit.rotation.order = 'YXZ'; // spin round the vertical axis, then tilt: reads as the ring swinging round
    scene.add(orbit);

    let visible = false, pT = 0, pC = 0, eT = 0, eC = 0;
    const resize = () => {
      const W = canvas.clientWidth, H = canvas.clientHeight;
      if (!W || !H) return;
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      // on phones the model sits in a short, wide box: back the camera off so the exploded layers fit
      camera.position.set(0, 0, 9 * Math.max(1, (innerWidth < 860 ? 1.25 : 0.9) / camera.aspect));
      camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(canvas);
    resize();
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

    return {
      // p: pinned progress 0 → 1; exit: 0 → 1 while the section scrolls off the top afterwards
      set(p, exit = 0) { pT = p; eT = exit; if (reduce) { pC = p; eC = exit; } },
      tick(time, mx, my) {
        if (!visible) return;
        pC = lerp(pC, pT, 0.1);
        eC = lerp(eC, eT, 0.1);
        const p = pC, TAU = Math.PI * 2;
        const spinIn = smooth(0, INTRO, p);                // 1) one full turn on the way in
        const drift = smooth(INTRO, OUTRO, p);             // 2) a gentle drift while the steps play
        const spinOut = smooth(OUTRO, 1, p) + eC;          // 3) spin again, carrying on as the section leaves
        // layers fan out at the end of the intro and close back up for the final spin
        const ex = smooth(INTRO * 0.7, INTRO, p) * (1 - smooth(OUTRO, OUTRO + 0.06, p));
        const active = p >= INTRO && p < OUTRO ? stepAt(p) : -1;
        group.rotation.y = -0.45 + (TAU + 1.4) * spinIn + 0.3 * drift + TAU * spinOut + mx * 0.3;
        group.rotation.x = -0.12 + 0.18 * Math.sin(spinIn * Math.PI) - 0.18 * Math.sin(Math.min(spinOut, 1) * Math.PI) + my * 0.2;
        group.position.y = reduce ? 0 : Math.sin(time * 0.0012) * 0.06;
        layers.forEach((L, i) => {
          L.x = lerp(L.x, i === active ? 0.75 : 0, 0.12);   // the active layer slides up out of the stack, like a card from a deck
          L.s = lerp(L.s, i === active ? 1.06 : 1, 0.12);
          L.mesh.position.set(0, L.x, (i - 2) * (0.24 + ex * 0.62));
          L.mesh.scale.setScalar(L.s);
        });
        // the orbit swings round with the intro and outro spins, and sits still-ish during the steps
        orbit.rotation.set(1.2 - 0.25 * Math.sin(spinIn * Math.PI) + 0.25 * Math.sin(Math.min(spinOut, 1) * Math.PI),
          TAU * spinIn + 0.4 * drift + TAU * spinOut + mx * 0.2, 0);
        dust.rotation.y = p * 1.4 + (reduce ? 0 : time * 0.00003);
        renderer.render(scene, camera);
      },
    };
  }

  const orbit = createOrbit();
  const carousel = createCarousel();
  const model = createModel();

  /* ---------- About: keep the paragraph no wider than the lead statement's longest line ---------- */
  const lead = $('.about-body .lead'), aboutPara = $('.about-body p:not(.lead)');
  const fitAbout = () => {
    if (!lead || !aboutPara) return;
    const range = document.createRange();
    range.selectNodeContents(lead);
    const box = lead.getBoundingClientRect();
    const scale = box.width / lead.offsetWidth || 1;   // undo the reveal animation's transform
    const widest = Math.max(...[...range.getClientRects()].map(r => r.right - box.left)) / scale;
    if (widest > 0) aboutPara.style.maxWidth = Math.floor(widest) + 'px';
  };
  fitAbout();
  addEventListener('resize', fitAbout);
  document.fonts && document.fonts.ready.then(fitAbout);

  /* ---------- Process copy (steps + progress bar) ---------- */
  const process = $('#process');
  const steps = $$('#steps li');
  const bar = $('#progress-bar');
  let activeStep = -1;
  const setStep = i => {
    if (i === activeStep) return;
    activeStep = i;
    steps.forEach((li, j) => li.classList.toggle('is-active', j === i));
  };

  const marquee = $('#marquee');
  const about = $('#about');
  const work = $('#work');
  const contactTitle = $('#contact-title');
  let lastY = scrollY, skew = 0;

  if (reduce) { // static, readable states
    model && model.set(0.55);
    steps.forEach(li => li.classList.add('is-active'));
  }

  function frame(time) {
    const y = scrollY, vh = innerHeight;

    if (!reduce) {
      // hero: headline lines slide apart, stickers move at their own depth, portrait morphs
      const hp = clamp(y / vh, 0, 1.5);
      const spread = innerWidth < 520 ? 9 : 14; // the headline nearly fills a phone, so it parts less
      if (lines[0]) lines[0].style.transform = `translate3d(${-hp * spread}%, 0, 0)`;
      if (lines[1]) lines[1].style.transform = `translate3d(${hp * spread}%, 0, 0)`;

      boardPtr.x = lerp(boardPtr.x, boardPtr.tx, 0.08);
      boardPtr.y = lerp(boardPtr.y, boardPtr.ty, 0.08);
      const br = board.getBoundingClientRect();
      if (br.bottom > 0) {
        stickers.forEach(st => {
          const d = +st.dataset.depth || 0.5;
          // parallax is limited so drag + drift together never push a sticker past the board edge
          const left = st.offsetLeft + st._dx, top = st.offsetTop + st._dy;
          const wantX = boardPtr.x * d * 50, wantY = boardPtr.y * d * 50 - Math.min(y * d * 0.2, 70 * d);
          const [fl, ft] = fits(st, left, top)
            ? fitAlong(st, left, top, left + wantX, top + wantY)
            : confine(st, ...centreOf(st), left + wantX, top + wantY);
          const px = fl - left, py = ft - top;
          st.style.setProperty('--px', px.toFixed(1) + 'px');
          st.style.setProperty('--py', py.toFixed(1) + 'px');
        });
        const bp = clamp((vh - br.top) / (vh + br.height));
        portrait.style.setProperty('--m', smooth(0.4, 0.85, bp).toFixed(3));
      }

      // marquee leans with scroll speed
      skew = lerp(skew, clamp((y - lastY) * 0.35, -10, 10), 0.1);
      marquee.style.setProperty('--skew', `${(-skew).toFixed(2)}deg`);

      // process: 0 → 1 while the section is pinned
      const pr = process.getBoundingClientRect();
      const pp = clamp(-pr.top / (pr.height - vh));
      const exit = clamp(-(pr.bottom - vh) / vh);            // 0 → 1 as the section scrolls away
      if (!reduce) {
        model && model.set(pp, exit);
        // the last step stays open through the final spin
        setStep(pp >= OUTRO ? 4 : stepAt(pp));
      }
      bar.style.setProperty('--p', pp.toFixed(4));


      // contact: title tips up into place
      const cr = contactTitle.getBoundingClientRect();
      const ct = smooth(0, 1, clamp((vh - cr.top) / (vh * 0.6)));
      contactTitle.style.transform = `perspective(900px) translateY(${((1 - ct) * 70).toFixed(1)}px) rotateX(${((1 - ct) * 55).toFixed(1)}deg)`;
      contactTitle.style.opacity = (0.15 + 0.85 * ct).toFixed(3);
    }
    lastY = y;

    // about: orbits turn as the section crosses the viewport (only worked out while it's on screen)
    if (orbit) {
      const ar = about.getBoundingClientRect();
      if (ar.bottom > 0 && ar.top < vh) orbit(reduce ? 0.3 : smooth(0.1, 0.9, clamp((vh - ar.top) / (vh + ar.height))), time);
    }

    // carousel tilts slightly as it passes through the viewport
    if (carousel) {
      const wr = work.getBoundingClientRect();
      const wp = clamp((vh - wr.top) / (vh + wr.height));
      carousel(reduce ? 0 : (0.5 - wp) * 14);
    }

    winPtr.x = lerp(winPtr.x, winPtr.tx, 0.05);
    winPtr.y = lerp(winPtr.y, winPtr.ty, 0.05);
    model && model.tick(time, reduce ? 0 : winPtr.x, reduce ? 0 : winPtr.y);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
