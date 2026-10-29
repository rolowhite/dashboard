import * as THREE from "three";

const REPO = "rolowhite/qwen_based_CSV-plotting-tool_3.3.0";
// Giscus: fill CATEGORY_ID from https://giscus.app after enabling Discussions (see README).
const GISCUS = { repoId: "R_kgDOVZsf_w", category: "Reviews", categoryId: "" };
const COLORS = ["#2a78d6", "#1baf7a", "#eda100", "#f2764b"]; // the app's Studio palette and its coral
// one formation per scroll anchor: a random scatter, then a model name per section
const MODELS = ["Linear\nregression", "Random\nforest", "k-means", "Neural\nnetwork", "Gradient\nboosting", "Decision\ntree", "PCA"];
// how the dots move in each formation: 0 walk the grid, 1 wave, 2 orbit, 3 flow field, 4 drift
const MODES = [0, 1, 2, 3, 4, 1, 2, 3];
const N = 3600, GRID = 0.25;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = t => t * t * (3 - 2 * t);
const clamp01 = t => Math.max(0, Math.min(1, t));

/* ---------- text to points: N samples of a model name, width 1, centred ---------- */

function textPoints(label) {
  const W = 1200, H = 520, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.fillStyle = "#fff";
  g.font = "600 170px 'IBM Plex Sans', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const lines = label.split("\n");
  lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * 190));
  const px = g.getImageData(0, 0, W, H).data, hits = [];
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) if (px[(y * W + x) * 4 + 3] > 128) {
    hits.push(x, y);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const w = x1 - x0 || 1, out = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const k = Math.floor(Math.random() * (hits.length / 2)) * 2;
    out[i * 2] = (hits[k] - (x0 + x1) / 2) / w;
    out[i * 2 + 1] = -(hits[k + 1] - (y0 + y1) / 2) / w;
  }
  return out;
}

/* ---------- scroll: stage follows the anchor nearest the middle of the screen ---------- */

const stepEls = [...document.querySelectorAll(".step")];
const anchors = [document.querySelector(".hero"), ...stepEls, ...["inside", "download", "reviews"].map(id => document.getElementById(id))];
let stage = 0;

function readScroll() {
  const mid = innerHeight / 2;
  // the hero and the steps count from their centre, the later sections from their top
  const c = anchors.map((el, i) => { const r = el.getBoundingClientRect(); return (i <= stepEls.length ? r.top + r.height / 2 : r.top) - mid; });
  let s = 0;
  if (c.at(-1) <= 0) s = c.length - 1;
  else if (c[0] <= 0) for (let i = 0; i < c.length - 1; i++) if (c[i] <= 0 && c[i + 1] > 0) s = i + -c[i] / (c[i + 1] - c[i]);
  stage = s;
  stepEls.forEach((el, i) => el.classList.toggle("on", Math.round(s) === i + 1));
}
addEventListener("scroll", readScroll, { passive: true });
addEventListener("resize", readScroll);
readScroll();

/* ---------- scene ---------- */

async function startScene() {
  const canvas = document.getElementById("scene");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    canvas.remove(); // the page works without the dots
    return;
  }
  await document.fonts.ready; // the names are drawn in IBM Plex
  const names = MODELS.map(textPoints);

  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x121214, 6, 12);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0, 0.3, 6.4);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2b2b30, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(3, 4, 5);
  scene.add(sun);

  const group = new THREE.Group();
  scene.add(group);
  const grid = new THREE.GridHelper(10, 40, 0x3a3a41, 0x232327);
  grid.material.transparent = true;
  grid.position.y = -2;
  group.add(grid);

  const dots = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.018, 1),
    new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1, transparent: true }),
    N,
  );
  dots.frustumCulled = false; // three caches the instance bounds, and the dots keep moving
  const colors = COLORS.map(c => new THREE.Color(c));
  for (let i = 0; i < N; i++) dots.setColorAt(i, colors[Math.random() < 0.1 ? 3 : i % 3]);
  group.add(dots);

  const rnd = Float32Array.from({ length: N * 3 }, () => Math.random() * 2 - 1);
  const delay = Float32Array.from({ length: N }, () => Math.random());
  const pos = new Float32Array(N * 3), push = new Float32Array(N * 3), vel = new Float32Array(N * 3);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  let targets = [], wide = true;

  // places the scatter and the names for this screen: beside the steps on wide screens, centred later on
  function layout() {
    const sx = wide ? 3.6 : 1.3, sy = wide ? 2.1 : 2.3;
    const scatter = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) scatter.set([rnd[i * 3] * sx, rnd[i * 3 + 1] * sy, rnd[i * 3 + 2] * 1.5], i * 3);
    targets = [scatter, ...names.map((pts, k) => {
      const beside = wide && k < stepEls.length, w = wide ? (beside ? 3.2 : 4.6) : 1.9;
      const cx = beside ? 1.75 : 0, cy = wide ? 0 : 0.9, out = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) out.set([cx + pts[i * 2] * w, cy + pts[i * 2 + 1] * w, rnd[i * 3 + 2] * 0.03], i * 3);
      return out;
    })];
  }

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    wide = w > 900;
    layout();
  }
  addEventListener("resize", resize);
  resize();

  // one cell along x or y, chosen per dot and per hop
  const hop = (i, seg) => {
    const d = Math.floor((Math.abs(Math.sin(i * 12.9898 + seg * 78.233) * 43758.5453) % 1) * 4);
    return [d === 0 ? 1 : d === 1 ? -1 : 0, d === 2 ? 1 : d === 3 ? -1 : 0];
  };
  // the dot's own movement in a formation, written into o (amplitude 1)
  function move(mode, i, t, x, y, o) {
    const a = rnd[i * 3] * 3.14, b = rnd[i * 3 + 1] * 3.14;
    if (mode === 0) { // walk the grid: out along a grid line to the next node, back, then another line
      const u = t * 0.5 + delay[i] * 4, seg = Math.floor(u), f = u - seg, [dx, dy] = hop(i, seg);
      const out = ease(clamp01(f * 3)) - ease(clamp01(f * 3 - 1.5));
      o[0] = dx * out; o[1] = dy * out; o[2] = 0;
    } else if (mode === 1) { o[0] = 0; o[1] = Math.sin(x * 2.2 - t * 1.8); o[2] = Math.cos(x * 2.2 - t * 1.8) * 0.5; }
    else if (mode === 2) { o[0] = Math.cos(t * 1.4 + a); o[1] = Math.sin(t * 1.4 + a); o[2] = 0; }
    else if (mode === 3) { o[0] = Math.sin(y * 2.5 + t * 0.9); o[1] = Math.cos(x * 2.5 + t * 0.9); o[2] = 0; }
    else { o[0] = Math.sin(t * 0.9 + a) * Math.cos(t * 0.37 + b); o[1] = Math.sin(t * 0.7 + b) * Math.cos(t * 0.41 + a); o[2] = Math.sin(t * 0.5 + a); }
  }
  const amp = k => (k === 0 ? GRID : 0.012); // the scatter roams, the names only shimmer

  const clock = new THREE.Clock(), oa = [0, 0, 0], ob = [0, 0, 0];
  const mouse = new THREE.Vector2(9, 9), look = new THREE.Vector2(), ZERO = new THREE.Vector2();
  let shown = 0;

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, clock.getDelta()), t = reduced ? 0 : clock.elapsedTime;
    shown = reduced ? stage : shown + (stage - shown) * (1 - Math.exp(-dt * 4));
    const k = Math.min(targets.length - 2, Math.floor(shown)), f = shown - k, a = targets[k], b = targets[k + 1];

    // the hero scatter sits under the headline, the later sections are text-heavy: both get quieter dots
    dots.material.opacity = (1 - 0.5 * clamp01(1 - shown) - 0.62 * clamp01(shown - stepEls.length)) * (wide ? 1 : 0.45);
    grid.material.opacity = 1 - clamp01(shown - stepEls.length);
    if (!reduced) {
      look.lerp(mouse.x < 9 ? mouse : ZERO, 0.04);
      group.rotation.y = Math.sin(t * 0.15) * 0.12 + look.x * 0.15;
      group.rotation.x = -look.y * 0.06;
    }

    for (let i = 0; i < N; i++) {
      const lt = ease(clamp01((f - delay[i] * 0.3) / 0.7));
      const x = a[i * 3] + (b[i * 3] - a[i * 3]) * lt, y = a[i * 3 + 1] + (b[i * 3 + 1] - a[i * 3 + 1]) * lt;
      move(MODES[k], i, t, x, y, oa);
      move(MODES[k + 1], i, t, x, y, ob);
      const s0 = amp(k) * (1 - lt), s1 = amp(k + 1) * lt;
      for (let j = 0; j < 3; j++) {
        const o = i * 3 + j;
        vel[o] = vel[o] * 0.88 - push[o] * 0.06; // spring back after a click
        push[o] += vel[o];
        pos[o] = a[o] + (b[o] - a[o]) * lt + oa[j] * s0 + ob[j] * s1 + push[o];
      }
      dots.setMatrixAt(i, m.compose(p.fromArray(pos, i * 3), q, one));
    }
    dots.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  /* click: a ripple pushes nearby dots away, then they spring back */
  const ray = new THREE.Raycaster();
  const toNdc = e => mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  addEventListener("pointermove", toNdc, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => mouse.set(9, 9));
  canvas.addEventListener("pointerdown", e => {
    if (reduced) return;
    ray.setFromCamera(toNdc(e), camera);
    const local = group.worldToLocal(ray.ray.at(camera.position.length(), new THREE.Vector3()));
    for (let i = 0; i < N; i++) {
      const dx = pos[i * 3] - local.x, dy = pos[i * 3 + 1] - local.y, dz = pos[i * 3 + 2] - local.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 1.4) {
        const s = (1.4 - d) * 0.09 / (d || 1);
        vel[i * 3] += dx * s; vel[i * 3 + 1] += dy * s; vel[i * 3 + 2] += dz * s;
      }
    }
  });
}

/* ---------- the grid readout: the nearest grid node and its coordinates follow the mouse ---------- */

function gridReadout() {
  const box = document.getElementById("cross"), label = box.querySelector("b"), STEP = 48; // the body's grid
  if (!matchMedia("(pointer: fine)").matches) return box.remove();
  let last = null;
  const place = () => {
    const gx = Math.round(last.clientX / STEP), gy = Math.round((last.clientY + scrollY) / STEP);
    box.style.setProperty("--x", gx * STEP + "px");
    box.style.setProperty("--y", gy * STEP - scrollY + "px");
    label.textContent = `x ${gx}, y ${gy}`;
    box.classList.toggle("flip", gx * STEP > innerWidth - 140); // keep the label on screen
    box.hidden = false;
  };
  addEventListener("pointermove", e => { if (e.pointerType === "mouse") { last = e; place(); } }, { passive: true });
  addEventListener("scroll", () => last && place(), { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { box.hidden = true; last = null; });
}

/* ---------- page interactions ---------- */

function steps() {
  for (const btn of document.querySelectorAll(".step-jump"))
    btn.addEventListener("click", () => btn.closest(".step").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" }));
}

function tabs() {
  const list = [...document.querySelectorAll(".tabs [role=tab]")];
  const panel = document.getElementById("shot"), img = panel.querySelector("img"), cap = panel.querySelector("figcaption");
  const ind = document.querySelector(".tab-ind");
  // the coral pill slides under the chosen tab
  const slide = () => {
    const tab = list.find(t => t.getAttribute("aria-selected") === "true");
    ind.style.transform = `translate(${tab.offsetLeft}px, ${tab.offsetTop}px)`;
    ind.style.width = tab.offsetWidth + "px";
  };
  addEventListener("resize", slide);
  slide();
  const select = tab => {
    list.forEach(t => { const on = t === tab; t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1; });
    slide();
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

// every button: a light panel slides across it after a click
function buttons() {
  const status = document.querySelector(".download .status");
  for (const a of document.querySelectorAll(".btn"))
    a.addEventListener("click", () => {
      a.classList.remove("slide");
      void a.offsetWidth; // restart the animation
      a.classList.add("slide");
      if (!a.classList.contains("js-download")) return;
      a.querySelector(".label > span").textContent = "Download started";
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
buttons();
gridReadout();
reviews();
startScene();
