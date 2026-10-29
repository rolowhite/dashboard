import * as THREE from "three";

const REPO = "rolowhite/qwen_based_CSV-plotting-tool_3.3.0";
// Giscus: fill CATEGORY_ID from https://giscus.app after enabling Discussions (see README).
const GISCUS = { repoId: "R_kgDOVZsf_w", category: "Reviews", categoryId: "" };
const STORE_COLORS = ["#2a78d6", "#1baf7a", "#eda100"]; // the app's Studio palette
const HOVER = new THREE.Color("#f2764b");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- data: one dot per CSV row ---------- */

function parseCsv(text) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map(l => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])))
    .map(r => ({ date: r.date, store: r.store, sales: +r.sales, customers: +r.customers, temperature: +r.temperature }));
}

const norm = (v, lo, hi) => (v - lo) / (hi - lo || 1);
const range = (rows, k) => [Math.min(...rows.map(r => r[k])), Math.max(...rows.map(r => r[k]))];

// four layouts (table, scatter, histogram, line), each a Float32Array of xyz
function layouts(rows) {
  const n = rows.length, stores = [...new Set(rows.map(r => r.store))];
  const si = rows.map(r => stores.indexOf(r.store));
  const [s0, s1] = range(rows, "sales"), [t0, t1] = range(rows, "temperature"), [c0, c1] = range(rows, "customers");
  const days = rows.map(r => Date.parse(r.date) / 864e5), [d0, d1] = [Math.min(...days), Math.max(...days)];
  const out = [0, 1, 2, 3].map(() => new Float32Array(n * 3));
  const put = (k, i, x, y, z) => out[k].set([x, y, z], i * 3);

  // 7-day rolling mean per store, like the app's line plot of this file
  const smooth = rows.map((r, i) => {
    let sum = 0, k = 0;
    for (let j = i; j > i - 7 && j >= 0 && si[j] === si[i]; j--) { sum += rows[j].sales; k++; }
    return sum / k;
  });
  const [m0, m1] = [Math.min(...smooth), Math.max(...smooth)];
  const COLS = 39, ROWS = Math.ceil(n / COLS), tilt = 1.0;
  const BINS = 24, stack = new Map(), binOf = r => Math.min(BINS - 1, Math.floor(norm(r.sales, s0, s1) * BINS));
  rows.forEach((r, i) => { const key = binOf(r) * 10 + si[i]; stack.set(key, (stack.get(key) || 0) + 1); });
  const tallest = Math.max(...stack.values()), dy = 2.5 / tallest, height = new Map();

  rows.forEach((r, i) => {
    const col = i % COLS, row = Math.floor(i / COLS), y = (ROWS / 2 - row) * 0.12;
    put(0, i, (col - (COLS - 1) / 2) * 0.11, y * Math.cos(tilt), -y * Math.sin(tilt));
    put(1, i, norm(r.temperature, t0, t1) * 4 - 2, norm(r.sales, s0, s1) * 2.4 - 1.2, norm(r.customers, c0, c1) * 2 - 1);
    const key = binOf(r) * 10 + si[i], h = height.get(key) || 0;
    height.set(key, h + 1);
    put(2, i, -2 + (binOf(r) + 0.5) * (4 / BINS), -1.25 + h * dy, (si[i] - 1) * 0.35);
    put(3, i, norm(days[i], d0, d1) * 4 - 2, norm(smooth[i], m0, m1) * 2.4 - 1.2, (si[i] - 1) * 0.6);
  });
  return { out, si };
}

/* ---------- scroll: stage 0..3 follows the step nearest the middle of the screen ---------- */

const stepEls = [...document.querySelectorAll(".step")];
let stage = 0;

function readScroll() {
  const mid = innerHeight / 2;
  const c = stepEls.map(s => { const r = s.getBoundingClientRect(); return r.top + r.height / 2 - mid; });
  let s = 0;
  if (c.at(-1) <= 0) s = c.length - 1;
  else if (c[0] <= 0) for (let i = 0; i < c.length - 1; i++) if (c[i] <= 0 && c[i + 1] > 0) s = i + -c[i] / (c[i + 1] - c[i]);
  stage = s;
  stepEls.forEach((el, i) => el.classList.toggle("on", Math.round(s) === i && c[0] < mid));
}
addEventListener("scroll", readScroll, { passive: true });
addEventListener("resize", readScroll);
readScroll();

/* ---------- scene ---------- */

async function startScene() {
  const canvas = document.getElementById("scene");
  let rows, renderer;
  try {
    const res = await fetch("assets/store_sales.csv");
    if (!res.ok) throw new Error(res.status);
    rows = parseCsv(await res.text());
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    canvas.remove(); // the page works without the dots
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x121214, 6, 12);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0, 0.7, 6.4);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2b2b30, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(3, 4, 5);
  scene.add(sun);

  const { out: targets, si } = layouts(rows);
  const n = rows.length;
  const group = new THREE.Group();
  scene.add(group);
  const grid = new THREE.GridHelper(8, 32, 0x3a3a41, 0x232327);
  grid.material.transparent = true;
  grid.position.y = -1.35;
  group.add(grid);

  const dots = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.036, 1),
    new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1, transparent: true }),
    n,
  );
  dots.frustumCulled = false; // three caches the instance bounds, and the dots keep moving
  const colors = STORE_COLORS.map(c => new THREE.Color(c));
  for (let i = 0; i < n; i++) dots.setColorAt(i, colors[si[i]]);
  group.add(dots);

  // per-dot stagger so the cloud flows instead of moving as one block
  const delay = Float32Array.from({ length: n }, () => Math.random());
  const pos = new Float32Array(n * 3), push = new Float32Array(n * 3), vel = new Float32Array(n * 3);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();

  const inside = document.getElementById("inside");
  let shown = 0, hovered = -1, wide = true, past = 0;

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    wide = w > 900;
  }
  addEventListener("resize", resize);
  resize();

  const ease = t => t * t * (3 - 2 * t);
  const clock = new THREE.Clock();
  const mouse = new THREE.Vector2(9, 9), look = new THREE.Vector2(), ZERO = new THREE.Vector2();

  function frame() {
    requestAnimationFrame(frame);
    // dim the dots once the reader is past the story, and stop drawing when they are hidden
    past = Math.max(0, Math.min(1, 1 - inside.getBoundingClientRect().top / innerHeight));
    if (past === 1 && Math.abs(stage - shown) < 1e-3) return;
    const t = clock.getElapsedTime();
    shown = reduced ? stage : shown + (stage - shown) * 0.08;
    const k = Math.min(2, Math.floor(shown)), f = shown - k, a = targets[k], b = targets[k + 1];

    dots.material.opacity = (1 - past * 0.88) * (wide ? 1 : 0.4);
    grid.material.opacity = 1 - past;
    group.position.x = wide ? 1.35 + 0.55 * (1 - Math.min(1, shown)) : 0;
    group.position.y = wide ? 0 : 0.3;
    group.scale.setScalar(wide ? 1 : 0.62);
    if (!reduced) {
      look.lerp(mouse.x < 9 ? mouse : ZERO, 0.04);
      group.rotation.y = Math.sin(t * 0.15) * 0.25 + look.x * 0.18 - 0.35 * (1 - Math.min(1, shown));
      group.rotation.x = -look.y * 0.08;
    }

    for (let i = 0; i < n; i++) {
      const lt = ease(Math.max(0, Math.min(1, (f - delay[i] * 0.3) / 0.7)));
      for (let j = 0; j < 3; j++) {
        const o = i * 3 + j;
        vel[o] = vel[o] * 0.88 - push[o] * 0.06; // spring back after a click
        push[o] += vel[o];
        pos[o] = a[o] + (b[o] - a[o]) * lt + push[o];
      }
      sc.setScalar(i === hovered ? 2.4 : 1);
      dots.setMatrixAt(i, m.compose(p.fromArray(pos, i * 3), q, sc));
    }
    dots.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  /* hover: the app's value ball, a tooltip on the nearest row */
  const ray = new THREE.Raycaster(), tip = document.getElementById("tip");
  const fmt = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  function pick(e) {
    mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    let id = -1;
    if (past < 0.5) { // the dots are faded under the later sections
      ray.setFromCamera(mouse, camera);
      dots.boundingSphere = null; // recomputed from the current layout
      const hit = ray.intersectObject(dots)[0];
      if (hit) id = hit.instanceId;
    }
    if (id !== hovered) {
      if (hovered >= 0) dots.setColorAt(hovered, colors[si[hovered]]);
      if (id >= 0) dots.setColorAt(id, HOVER);
      dots.instanceColor.needsUpdate = true;
      hovered = id;
    }
    if (id < 0) return void (tip.hidden = true);
    const r = rows[id];
    tip.innerHTML = `<b>Store ${r.store}, ${day.format(new Date(r.date))}</b><br>sales ${fmt.format(r.sales)}<br>customers ${r.customers}<br>temperature ${fmt.format(r.temperature)} °C`;
    tip.style.left = e.clientX + "px";
    tip.style.top = e.clientY + "px";
    tip.hidden = false;
  }
  canvas.addEventListener("pointermove", pick);
  canvas.addEventListener("pointerleave", () => { tip.hidden = true; mouse.set(9, 9); });

  /* click: a ripple pushes nearby dots away, then they spring back */
  canvas.addEventListener("pointerdown", e => {
    pick(e);
    if (reduced || past >= 0.5) return;
    ray.setFromCamera(mouse, camera);
    const local = group.worldToLocal(ray.ray.at(camera.position.length(), new THREE.Vector3()));
    for (let i = 0; i < n; i++) {
      const dx = pos[i * 3] - local.x, dy = pos[i * 3 + 1] - local.y, dz = pos[i * 3 + 2] - local.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 1.4) {
        const s = (1.4 - d) * 0.09 / (d || 1);
        vel[i * 3] += dx * s; vel[i * 3 + 1] += dy * s; vel[i * 3 + 2] += dz * s;
      }
    }
  });
}

/* ---------- page interactions ---------- */

function steps() {
  for (const btn of document.querySelectorAll(".step-jump"))
    btn.addEventListener("click", () => btn.closest(".step").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" }));
}

function tabs() {
  const list = [...document.querySelectorAll(".tabs [role=tab]")];
  const panel = document.getElementById("shot"), img = panel.querySelector("img"), cap = panel.querySelector("figcaption");
  const select = tab => {
    list.forEach(t => { const on = t === tab; t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1; });
    panel.setAttribute("aria-labelledby", tab.id);
    img.src = tab.dataset.src;
    img.alt = tab.dataset.alt;
    cap.textContent = tab.dataset.note;
    img.classList.remove("swap");
    void img.offsetWidth; // restart the animation
    img.classList.add("swap");
  };
  list.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", e => {
      const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      const next = list[(i + d + list.length) % list.length];
      next.focus();
      select(next);
    });
  });
}

function downloads() {
  const status = document.querySelector(".download .status");
  for (const a of document.querySelectorAll(".js-download"))
    a.addEventListener("click", () => {
      a.classList.remove("halo");
      void a.offsetWidth;
      a.classList.add("halo");
      a.querySelector("span").textContent = "Download started";
      status.textContent = "Download started. Unzip it, then run the starter for your computer below.";
    });
}

function reviews() {
  const host = document.querySelector(".giscus");
  if (!GISCUS.categoryId) {
    host.hidden = true;
    document.querySelector(".giscus-off").hidden = false;
    return;
  }
  const s = document.createElement("script");
  Object.entries({
    src: "https://giscus.app/client.js", "data-repo": REPO, "data-repo-id": GISCUS.repoId,
    "data-category": GISCUS.category, "data-category-id": GISCUS.categoryId, "data-mapping": "specific",
    "data-term": "Reviews of CSV Plot Studio", "data-reactions-enabled": "1", "data-emit-metadata": "0",
    "data-input-position": "top", "data-theme": "transparent_dark", "data-lang": "en", "data-loading": "lazy",
    crossorigin: "anonymous",
  }).forEach(([k, v]) => s.setAttribute(k, v));
  s.async = true;
  host.append(s);
}

steps();
tabs();
downloads();
reviews();
startScene();
