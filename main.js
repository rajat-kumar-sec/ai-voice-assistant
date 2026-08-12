import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

// ============================================================
//  DOM
// ============================================================
const canvas = document.getElementById('bg');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const loadPanel = document.getElementById('loadPanel');
const loadPct = document.getElementById('loadPct');
const loadMsg = document.getElementById('loadMsg');
const loadBarFill = document.getElementById('loadBarFill');
const loadFile = document.getElementById('loadFile');
const chatLog = document.getElementById('chatLog');
const micBtn = document.getElementById('micBtn');
const sendBtn = document.getElementById('sendBtn');
const textInput = document.getElementById('textInput');
const robotName = document.getElementById('robotName');
const chatClose = document.getElementById('chatClose');
const modeBtn = document.getElementById('modeBtn');

// ============================================================
//  MODEL SELECTION (phone-friendly defaults)
// ============================================================
const MODELS = {
  smart: {
    label: 'SMART · Qwen2.5-0.5B',
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    note: 'Badtar khayal, ~750MB model',
  },
  fast: {
    label: 'FAST · SmolLM2-360M',
    id: 'onnx-community/SmolLM2-360M-Instruct-ONNX',
    dtype: 'q4',
    note: 'Tez, halka (~386MB), phone par stable',
  },
};
// PHONIC FIX: phone par sirf FAST model chalta hai.
// Pehle localStorage me 'smart' bacha hua tha, toh mobile par bhi 749MB download hota
// tha -> complete ho kar memory OOM -> reload loop. Ab mobile par SMART block hai.
const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ||
                 ((navigator.maxTouchPoints || 0) > 0 && /Mobi/i.test(navigator.userAgent)) ||
                 (/Android|iPhone/i.test(navigator.platform || ''));
let modelKey = isMobile ? 'fast' : (localStorage.getItem('nova_model') || 'smart');
if (!MODELS[modelKey] || (isMobile && modelKey !== 'fast')) modelKey = isMobile ? 'fast' : 'smart';

// Browser cache ko persist manayein: partial download reload ke baad resume ho, dobara 0 se na ho
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ============================================================
//  THREE.JS SCENE (performance-aware)
// ============================================================
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 1.1, 7);
camera.lookAt(0, 1.2, 0);

let webglOK = true;
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  let pixelCap = devicePixelRatio && devicePixelRatio > 1 ? 1.25 : 1;
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isMobile ? 1 : 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
} catch (e) {
  webglOK = false;
  console.warn('NOVA: WebGL unavailable, running 2D fallback', e);
}
let pixelCap = 1.5;

let lowPerf = isMobile;   // mobile phones get light rendering by default
let starCount = isMobile ? 350 : 800;
let orbCount  = isMobile ? 3 : 6;

// ---------- background stars ----------
const starGeo = new THREE.BufferGeometry();
const sp = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i += 3) {
  sp[i]     = (Math.random() - 0.5) * 60;
  sp[i + 1] = (Math.random() - 0.5) * 40;
  sp[i + 2] = (Math.random() - 0.5) * 40 - 10;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x88ccff, size: 0.06, transparent: true, opacity: 0.85, depthWrite: false }));
scene.add(stars);

// ---------- rotating particle torus ----------
const field = new THREE.Points(
  new THREE.BufferGeometry(),
  new THREE.PointsMaterial({ color: 0x00f0ff, size: 0.025, transparent: true, opacity: 0.8, depthWrite: false })
);
const fg = field.geometry;
const fga = new Float32Array(300 * 3);
for (let i = 0; i < 300 * 3; i += 3) {
  const r = 2.1 + Math.random() * 0.7, a = Math.random() * Math.PI * 2;
  fga[i] = Math.cos(a) * r; fga[i + 1] = (Math.random() - 0.5) * 0.9; fga[i + 2] = Math.sin(a) * r;
}
fg.setAttribute('position', new THREE.BufferAttribute(fga, 3));
scene.add(field);

// ============================================================
//  ROBOT
// ============================================================
const robot = new THREE.Group();
scene.add(robot);
const bodyCol = new THREE.MeshStandardMaterial({ color: 0x1a2140, metalness: 0.85, roughness: 0.35 });
const darkCol = new THREE.MeshStandardMaterial({ color: 0x0b0f22, metalness: 0.6, roughness: 0.5 });
const glowMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 2.2, metalness: 0.3, roughness: 0.2 });

const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.35, 24), bodyCol); neck.position.y = 0.95; robot.add(neck);
const head = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.9, 0.92), bodyCol); head.position.y = 1.62; robot.add(head);
const rim = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.02, 12, 48), glowMat); rim.position.y = 1.62; rim.rotation.x = Math.PI / 2; robot.add(rim);
const visor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.12), darkCol); visor.position.set(0, 1.68, 0.46); robot.add(visor);

const eyeMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 3 });
const eyeGeo = new THREE.SphereGeometry(0.13, 20, 20);
const leftEye = new THREE.Mesh(eyeGeo, eyeMat); leftEye.position.set(-0.22, 1.7, 0.52);
const rightEye = new THREE.Mesh(eyeGeo, eyeMat); rightEye.position.set(0.22, 1.7, 0.52);
robot.add(leftEye, rightEye);

const mouthBars = [];
const mouthGroup = new THREE.Group(); mouthGroup.position.set(0, 1.44, 0.52); robot.add(mouthGroup);
for (let i = 0; i < 7; i++) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xff2d95, emissive: 0xff2d95, emissiveIntensity: 1.8 }));
  bar.position.x = (i - 3) * 0.09; mouthGroup.add(bar); mouthBars.push(bar);
}

const finMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 1.5 });
const finGeo = new THREE.ConeGeometry(0.28, 0.5, 4);
const finL = new THREE.Mesh(finGeo, finMat); finL.position.set(0.78, 1.66, 0); finL.rotation.z = Math.PI;
const finR = new THREE.Mesh(finGeo, finMat); finR.position.set(-0.78, 1.66, 0);
robot.add(finL, finR);

const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), bodyCol); antenna.position.y = 2.3;
const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), glowMat); antennaTip.position.y = 2.52;
robot.add(antenna, antennaTip);

const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.55, 24), bodyCol); body.position.y = 0.5; robot.add(body);
const core = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 20),
  new THREE.MeshStandardMaterial({ color: 0x7b2dff, emissive: 0x7b2dff, emissiveIntensity: 2.5 })); core.position.set(0, 0.55, 0.34); robot.add(core);

const ringMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 1, transparent: true, opacity: 0.6 });
const baseRing = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.015, 8, 64), ringMat); baseRing.rotation.x = -Math.PI / 2; baseRing.position.y = 0.04;
const baseRing2 = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.012, 8, 64), ringMat); baseRing2.rotation.x = -Math.PI / 2; baseRing2.position.y = 0.02;
robot.add(baseRing, baseRing2);

// orbiting orbs
const orbGroup = new THREE.Group(); scene.add(orbGroup);
const orbs = [];
for (let i = 0; i < orbCount; i++) {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0),
    new THREE.MeshStandardMaterial({ color: 0x7b2dff, emissive: 0x7b2dff, emissiveIntensity: 2, transparent: true, opacity: 0.85 }));
  m.userData.angle = (i / orbCount) * Math.PI * 2;
  m.userData.r = 1.55 + (i % 3) * 0.18;
  m.userData.speed = 0.5 + Math.random() * 0.4;
  orbs.push(m); orbGroup.add(m);
}

scene.add(new THREE.AmbientLight(0x334, 0.6));
const L1 = new THREE.PointLight(0x00f0ff, 2.5, 12); L1.position.set(3, 3, 4); scene.add(L1);
const L2 = new THREE.PointLight(0xff2d95, 2.2, 12); L2.position.set(-3, 1, 3); scene.add(L2);
if (!lowPerf) { const L3 = new THREE.PointLight(0x7b2dff, 2.0, 12); L3.position.set(0, -2, 5); scene.add(L3); }

// ============================================================
//  STATE
// ============================================================
let generator = null, modelReady = false, isThinking = false, isListening = false;
let recognition = null, speakActive = false;
const history = [];

const SYSTEM_PROMPT =
  'Aap NOVA hain - ek futuristic, friendly AI companion. Aap Hindi, Hinglish aur English me baat karte hain. ' +
  'Hamesha poora, helpful aur thoda smart/fun jawab dijiye. Jawab chhota aur saaf rakhiye agar question aasaan ho. ' +
  'Agar user Hinglish me bolta hai to aap bhi Hinglish me jawab dein.';

const MOUTH_MODE = { idle: 0, listening: 1, thinking: 2, talking: 3 };
let mouthMode = MOUTH_MODE.idle;

// ============================================================
//  ANIMATION LOOP
// ============================================================
const clock = new THREE.Clock();
let blinkTimer = 0;
let frameCount = 0, fpsTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  if (!webglOK) return;
  const t = clock.getElapsedTime();
  const dt = clock.getDelta();

  // measure FPS once after start to auto-downgrade
  frameCount++; fpsTimer += dt;
  if (fpsTimer >= 2 && frameCount >= 30) {
    const fps = frameCount / fpsTimer;
    if (!isMobile && fps < 28) {
      // heavy laptop: drop to light mode
      renderer.setPixelRatio(1);
      stars.material.opacity = 0.4;
      stars.material.size = 0.05;
      orbGroup.visible = false;
      baseRing2.visible = false;
      lowPerf = true;
      console.log('NOVA: reduced rendering for performance');
    }
    frameCount = 0; fpsTimer = 0;
  }

  stars.rotation.y += 0.0002;
  field.rotation.y += 0.0012;

  robot.position.y = Math.sin(t * 0.8) * 0.16;
  const breathe = 1 + Math.sin(t * 1.6) * 0.02;
  robot.scale.set(breathe, breathe, breathe);
  head.rotation.y = Math.sin(t * 0.5) * 0.12;
  robot.rotation.y = Math.sin(t * 0.3) * 0.2 + field.rotation.y * 2;

  baseRing.rotation.z = t;
  baseRing2.rotation.z = -t * 0.6;

  for (const o of orbs) {
    o.userData.angle += 0.005 * o.userData.speed;
    o.position.set(
      Math.cos(o.userData.angle) * o.userData.r,
      1.0 + Math.sin(o.userData.angle * 2 + t) * 0.25,
      Math.sin(o.userData.angle) * o.userData.r
    );
    o.rotation.x += 0.03; o.rotation.y += 0.04;
  }

  blinkTimer += dt;
  if (blinkTimer > Math.random() * 4 + 2) {
    blinkTimer = 0;
    leftEye.scale.y = 0.12; rightEye.scale.y = 0.12;
    setTimeout(() => { leftEye.scale.y = 1; rightEye.scale.y = 1; }, 110);
  }

  animateMouth(t);

  if (mouthMode === MOUTH_MODE.listening) { eyeMat.emissive.setHex(0xff4d4d); antennaTip.material.emissive.setHex(0xff4d4d); }
  else if (mouthMode === MOUTH_MODE.talking) { eyeMat.emissive.setHex(0xff2d95); antennaTip.material.emissive.setHex(0xff2d95); }
  else if (mouthMode === MOUTH_MODE.thinking) { eyeMat.emissive.setHex(0x7b2dff); antennaTip.material.emissive.setHex(0x7b2dff); }
  else { eyeMat.emissive.setHex(0x00f0ff); antennaTip.material.emissive.setHex(0x00f0ff); }

  const pulse = (Math.sin(t * 6) + 1) / 2;
  core.material.emissiveIntensity = mouthMode === MOUTH_MODE.thinking ? 2 + pulse * 2 : 2.5;

  renderer.render(scene, camera);
}

function animateMouth(t) {
  if (mouthMode === MOUTH_MODE.listening) {
    for (let i = 0; i < mouthBars.length; i++) mouthBars[i].scale.y = Math.abs(Math.sin(t * 8 + i)) * 0.5 + 0.15;
  } else if (mouthMode === MOUTH_MODE.talking) {
    for (let i = 0; i < mouthBars.length; i++) mouthBars[i].scale.y = Math.abs(Math.sin(t * (14 + i * 2) + i * 1.3)) * 1.6 + 0.3;
  } else if (mouthMode === MOUTH_MODE.thinking) {
    for (let i = 0; i < mouthBars.length; i++) {
      const shift = (t * 4) % 1;
      const idx = (i + shift * mouthBars.length) % mouthBars.length;
      mouthBars[i].scale.y = Math.abs(idx - mouthBars.length / 2) < mouthBars.length / 3 ? 0.8 : 0.1;
    }
  } else {
    for (let i = 0; i < mouthBars.length; i++) mouthBars[i].scale.y = 0.7 + Math.sin(t * 2 + i) * 0.15;
  }
}

// ============================================================
//  HELPERS
// ============================================================
function setStatus(text, cls) { statusText.textContent = text; statusDot.className = 'pip' + (cls ? ' ' + cls : ''); }

function addMsg(text, isUser) {
  const div = document.createElement('div');
  div.className = 'msg ' + (isUser ? 'user' : 'ai');
  const tag = document.createElement('span'); tag.className = 'tag';
  tag.textContent = isUser ? '◈ YOU' : '◈ NOVA';
  div.appendChild(tag);
  div.appendChild(document.createTextNode(text));
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}
function addError(text) { addMsg(text, false); }

// ============================================================
//  LOAD MODEL (auto-picks model for device)
// ============================================================
async function loadModel() {
  const MB = 1024 * 1024;
  const model = MODELS[modelKey];
  localStorage.setItem('nova_model', modelKey);
  let modelTotal = 0, modelLoaded = 0;
  setStatus('Downloading ' + model.label + '...', 'downloading');
  loadMsg.textContent = 'Downloading · ' + model.note;
  try {
    generator = await pipeline('text-generation', model.id, {
      dtype: model.dtype || 'q4',
      progress_callback: (data) => {
        try {
          if (!data) return;
          if (data.progress && data.progress.total) { modelTotal = data.progress.total; modelLoaded = data.progress.loaded; }
          else if (typeof data.total === 'number') { modelTotal = data.total; modelLoaded = typeof data.loaded === 'number' ? data.loaded : 0; }
          const pct = modelTotal > 0 ? Math.min(100, Math.max(0, Math.round(modelLoaded / modelTotal * 100))) : 0;
          loadPct.textContent = pct + '%';
          loadBarFill.style.width = pct + '%';
          const dl = (modelLoaded / MB).toFixed(1), tot = (modelTotal / MB).toFixed(1);
          if (data.file) {
            let f = String(data.file).split('/').pop(); if (f.length > 34) f = '...' + f.slice(-31);
            loadFile.textContent = f;
          }
          loadMsg.textContent = 'Downloading Neural Core · ' + dl + '/' + tot + ' MB';
        } catch (e) { console.warn(e); }
      },
    });
    modelReady = true;
    loadPanel.classList.add('hidden');
    setStatus('ONLINE · SAY HELLO', 'ready');
    addMsg('NOVA online (' + model.label + '). Namaste! Hindi / Hinglish / English me baat karein.', false);
  } catch (e) {
    console.error(e);
    setStatus('❌ Neural core load failed', 'downloading');
    loadMsg.textContent =
      'Model download fail: ' + String(e && e.message || e).slice(0, 160) +
      '. Internet ON rakhein & page dobara kholen.';
  }
}

// ============================================================
//  SPEECH
// ============================================================
function setupRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return false;
  recognition = new SR();
  recognition.lang = 'hi-IN';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;
  recognition.onstart = () => { isListening = true; micBtn.classList.add('recording'); setStatus('LISTENING...', 'listening'); mouthMode = MOUTH_MODE.listening; };
  recognition.onresult = (event) => {
    let final = '', interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) final = r[0].transcript.trim(); else interim += r[0].transcript;
    }
    if (final) { stopListening(); setStatus('PROCESSING...', 'thinking'); askAI(final); }
  };
  recognition.onerror = (e) => {
    stopListening();
    const m = (e.error === 'not-allowed' || e.error === 'service-not-allowed')
      ? 'Mic permission chahiye - browser settings me allow karein' : 'Kuch suna nahi, dobara try karein';
    setStatus(m, 'ready');
  };
  recognition.onend = () => { if (!isThinking) { isListening = false; micBtn.classList.remove('recording'); if (mouthMode === MOUTH_MODE.listening) mouthMode = MOUTH_MODE.idle; } };
  return true;
}
function startListening() {
  if (!modelReady) return setStatus('NEURAL CORE LOADING...', 'downloading');
  if (isThinking) return;
  if (!recognition) { const ok = setupRecognition(); if (!ok) return alert('Speech recognition unsupported. Use Chrome/Edge.'); }
  try { recognition.start(); } catch (e) {}
}
function stopListening() {
  isListening = false; micBtn.classList.remove('recording');
  if (recognition) { try { recognition.stop(); } catch (e) {} }
  if (mouthMode === MOUTH_MODE.listening) mouthMode = MOUTH_MODE.idle;
}

function getVoice() {
  const vs = speechSynthesis.getVoices();
  return vs.find(v => v.lang && v.lang.toLowerCase().startsWith('hi')) ||
         vs.find(v => v.lang && v.lang.toLowerCase().startsWith('en-in')) ||
         vs.find(v => v.lang && v.lang.toLowerCase().startsWith('en')) || vs[0] || null;
}
const stopSpeaking = () => { speechSynthesis.cancel(); mouthMode = MOUTH_MODE.idle; };
function speak(text) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.slice(0, 500));
  const v = getVoice(); if (v) u.voice = v;
  u.lang = v && v.lang ? v.lang : 'hi-IN'; u.rate = 1.0;
  u.onstart = () => { mouthMode = MOUTH_MODE.talking; };
  u.onend = () => { mouthMode = MOUTH_MODE.idle; };
  u.onerror = () => { mouthMode = MOUTH_MODE.idle; };
  speechSynthesis.speak(u);
}

// ============================================================
//  AI GENERATION
// ============================================================
async function askAI(userText) {
  if (!modelReady || !generator || isThinking) return;
  isThinking = true;
  mouthMode = MOUTH_MODE.thinking;
  setStatus('PROCESSING...', 'thinking');
  addMsg(userText, true);
  history.push({ role: 'user', content: userText });

  let prompt = "<|im_start|>system\n" + SYSTEM_PROMPT + "<|im_end|>\n";
  for (const m of history.slice(-8)) prompt += "<|im_start|>" + m.role + "\n" + m.content + "<|im_end|>\n";
  prompt += "<|im_start|>assistant\n";

  try {
    const output = await generator(prompt, { max_new_tokens: 256, temperature: 0.7, top_p: 0.95, do_sample: true });
    let raw = Array.isArray(output) ? output[0]?.generated_text
      : (output && typeof output === 'object' ? (output.generated_text ?? output.text ?? output.output_text) : output);
    if (raw == null) raw = JSON.stringify(output);
    const text = String(raw);
    const marker = "<|im_start|>assistant";
    let answer;
    const mIdx = text.lastIndexOf(marker);
    if (mIdx >= 0) {
      answer = text.slice(mIdx + marker.length);
      const end = answer.search(/<\|im_end\|>|<\|endoftext\|>|<\/?s>/);
      if (end >= 0) answer = answer.slice(0, end);
    } else answer = text;
    answer = answer.replace(/<\|im_end\|>/g, '').replace(/<\|endoftext\|>/g, '').replace(/<\|im_start\|>/g, '').trim();
    if (!answer) answer = 'Mujhe samajh nahi aaya, thoda aur batao.';

    history.push({ role: 'assistant', content: answer });
    if (history.length > 16) history.splice(0, history.length - 16);
    isThinking = false;
    setStatus('ONLINE · SAY HELLO', 'ready');
    addMsg(answer, false);
    speak(answer);
  } catch (e) {
    console.error(e); isThinking = false;
    setStatus('ERROR', 'ready');
    addError('Error: ' + e.message);
  }
}

// ============================================================
//  MODEL MODE SWITCH
// ============================================================
modeBtn.addEventListener('click', () => {
  if (isThinking || !modelReady) return;
  if (isMobile && modelKey === 'fast') {
    loadMsg.textContent = 'Phone par SMART model nahi — memory crash/lag hota hai. Sirf FAST available.';
    setStatus('FAST ONLY ON PHONE', 'ready');
    return;
  }
  const next = modelKey === 'smart' ? 'fast' : 'smart';
  modelKey = next;
  localStorage.setItem('nova_model', modelKey);
  modeBtn.textContent = MODELS[modelKey].label;
  if (generator) {
    location.reload(); // reload so new model loads
  }
});

// ============================================================
//  GLOBAL FALLBACK: page band na ho, friendly message dikhe
// ============================================================
addEventListener('error', e => {
  try {
    setStatus('⚠ PROBLEM: ' + String(e.message || '').slice(0, 60), 'downloading');
  } catch (err) {}
});
addEventListener('unhandledrejection', e => {
  try {
    setStatus('⚠ PROBLEM: ' + String(e.reason && e.reason.message || e.reason || '').slice(0, 60), 'downloading');
  } catch (err) {}
});

// ============================================================
//  UI
// ============================================================
micBtn.addEventListener('click', startListening);
sendBtn.addEventListener('click', () => { const v = textInput.value.trim(); if (v) { textInput.value = ''; askAI(v); } });
textInput.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = textInput.value.trim(); if (v) { textInput.value = ''; askAI(v); } } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') stopSpeaking(); });
chatClose.addEventListener('click', () => chatLog.closest('.chat-panel').classList.add('hidden'));
robotName.addEventListener('click', () => chatLog.closest('.chat-panel').classList.remove('hidden'));

addEventListener('resize', () => {
  if (!webglOK) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowPerf ? 1 : pixelCap));
});

// init
modeBtn.textContent = MODELS[modelKey].label;
if (speechSynthesis) speechSynthesis.getVoices();
setupRecognition();
animate();
loadModel();