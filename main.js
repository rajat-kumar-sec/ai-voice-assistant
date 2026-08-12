import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

// ---------- DOM ----------
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const robot = document.getElementById('robot');
const mouth = document.getElementById('mouth');
const antenna = document.getElementById('antennaLight');
const leftEye = document.getElementById('leftEye');
const rightEye = document.getElementById('rightEye');
const chestCore = document.getElementById('chestCore');
const bubble = document.getElementById('speechBubble');
const bubbleText = document.getElementById('bubbleText');
const chatLog = document.getElementById('chatLog');
const micBtn = document.getElementById('micBtn');
const sendBtn = document.getElementById('sendBtn');
const textInput = document.getElementById('textInput');

// ---------- STATE ----------
let generator = null;       // transformers.js text-generation
let modelReady = false;
let isThinking = false;
let isListening = false;
let recognition = null;
const history = [];
let currentUtterance = null;

const SYSTEM_PROMPT =
  'Aap ek helpful, friendly AI assistant hain. Aap Hindi, Hinglish aur English me baat karte hain. ' +
  'Hamesha poora, detailed aur helpful jawab dijiye. Jawab chhota aur saaf rakhiye agar question aasaan ho. ' +
  'Agar user Hinglish me bolta hai to aap bhi Hinglish me jawab dein.';

// ---------- STATUS ----------
function setStatus(text, cls) {
  statusText.textContent = text;
  statusDot.className = 'status-dot' + (cls ? ' ' + cls : '');
}

function setThinking(on) {
  isThinking = on;
  if (on) {
    chestCore.classList.add('thinking');
    antenna.classList.add('talking');
    setStatus('AI soch raha hai...', 'thinking');
  } else {
    chestCore.classList.remove('thinking');
    antenna.classList.remove('talking');
    setStatus('AI ready - Mic dabayein aur bolen', 'ready');
  }
}

// ---------- CHAT ----------
function addMsg(text, isUser) {
  const div = document.createElement('div');
  div.className = 'msg ' + (isUser ? 'user' : 'ai');
  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = isUser ? '👤 Aap' : '🤖 AI';
  div.appendChild(tag);
  div.appendChild(document.createTextNode(text));
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// ---------- BUBBLE ----------
function showBubble(text) {
  bubbleText.textContent = text;
}
function showBubbleTyping() {
  bubbleText.textContent = '...';
}

// ---------- SPEECH RECOGNITION ----------
function setupRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    alert('Ye browser speech recognition support nahi karta. Chrome/Edge use karein.');
    return false;
  }
  recognition = new SR();
  recognition.lang = 'hi-IN';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add('recording');
    antenna.classList.add('listening');
    leftEye.classList.add('listening');
    setStatus('Sun raha hoon... bolen', 'listening');
    showBubble('🎤 Sun raha hoon... bolen');
  };

  recognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) final = res[0].transcript.trim();
      else interim += res[0].transcript;
    }
    if (interim) {
      showBubble('🎤 ' + interim);
    }
    if (final) {
      showBubble('Samajh gaya: ' + final);
      stopListening();
      askAI(final);
    }
  };

  recognition.onerror = (e) => {
    stopListening();
    let msg = 'Kuch suna nahi, dobara try karein';
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      msg = 'Mic permission chahiye - browser settings me allow karein';
    }
    setStatus(msg, 'ready');
    showBubble(msg);
  };

  recognition.onend = () => {
    if (isListening && !isThinking) {
      // auto-continue listening briefly
    }
    isListening = false;
    micBtn.classList.remove('recording');
    antenna.classList.remove('listening');
    leftEye.classList.remove('listening');
  };
  return true;
}

function startListening() {
  if (!modelReady) {
    const m = 'Pahle AI model load hone do';
    setStatus(m, 'ready');
    showBubble(m);
    return;
  }
  if (isThinking) {
    const m = 'AI soch raha hai, thodi der rukein';
    showBubble(m);
    return;
  }
  if (!recognition) {
    const ok = setupRecognition();
    if (!ok) return;
  }
  try {
    recognition.start();
  } catch (e) {
    // already started
  }
}

function stopListening() {
  if (recognition) {
    try { recognition.stop(); } catch (e) {}
  }
  isListening = false;
  micBtn.classList.remove('recording');
  antenna.classList.remove('listening');
  leftEye.classList.remove('listening');
}

// ---------- TTS ----------
function getVoice() {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find(v => v.lang && v.lang.toLowerCase().startsWith('hi')) ||
    voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en-in')) ||
    voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en')) ||
    voices[0] || null
  );
}

function stopSpeaking() {
  speechSynthesis.cancel();
  endMouthAnim();
}

function speak(text) {
  speechSynthesis.cancel();
  const clean = text.slice(0, 600);
  const utterance = new SpeechSynthesisUtterance(clean);
  const v = getVoice();
  if (v) utterance.voice = v;
  utterance.lang = (v && v.lang) ? v.lang : 'hi-IN';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  currentUtterance = utterance;
  showBubble(clean);
  startMouthAnim();
  utterance.onend = () => {
    endMouthAnim();
    currentUtterance = null;
  };
  utterance.onerror = () => {
    endMouthAnim();
    currentUtterance = null;
  };
  speechSynthesis.speak(utterance);
}

// ---------- MOUTH ANIMATION ----------
let mouthTimer = null;
let mouthMaskRandom = null;

function startMouthAnim() {
  stopMouthAnim();
  mouth.classList.add('talking');
  antenna.classList.add('talking');
  // random flap speed for realism
  mouthMaskRandom = setInterval(() => {
    if (speechSynthesis.speaking) {
      mouth.classList.toggle('talking', Math.random() > 0.2);
    }
  }, 120);
}

function stopMouthAnim() {
  if (mouthMaskRandom) { clearInterval(mouthMaskRandom); mouthMaskRandom = null; }
  mouth.classList.remove('talking', 'talking-slow');
  antenna.classList.remove('talking');
}

function endMouthAnim() {
  stopMouthAnim();
}

// ---------- AI GENERATION ----------
async function loadModel() {
  setStatus('AI model download/load ho raha hai (~500 MB, WiFi use karein)...', 'downloading');
  showBubble('Pahli baar: AI model load ho raha hai. Ye sirf ek baar hoga.');
  try {
    const MB = 1024 * 1024;
    let modelTotal = 0, modelLoaded = 0;

    generator = await pipeline('text-generation', 'onnx-community/Qwen2.5-0.5B-Instruct', {
      dtype: 'q4',
      progress_callback: (data) => {
        // transformers.js v3: data = { status, file, progress: { loaded, total } }
        try {
          if (!data) return;
          if (data.progress && data.progress.total) {
            modelTotal = data.progress.total;
            modelLoaded = data.progress.loaded;
          } else if (typeof data.total === 'number') {
            modelTotal = data.total;
            modelLoaded = typeof data.loaded === 'number' ? data.loaded : 0;
          }
          if (data.file) {
            let file = String(data.file).split('/').pop();
            if (file.length > 32) file = '...' + file.slice(-29);
            const dlMB = modelLoaded / MB;
            const totMB = modelTotal / MB;
            const pct = modelTotal > 0 ? Math.round((modelLoaded / modelTotal) * 100) : 0;
            const status = data.status ? '[' + data.status + '] ' : '';
            setStatus(
              status + 'Downloading: ' + pct + '% (' + dlMB.toFixed(1) + '/' + totMB.toFixed(1) + ' MB)\n' + file,
              'downloading'
            );
            showBubble('⬇️ Downloading: ' + pct + '% (' + dlMB.toFixed(1) + '/' + totMB.toFixed(1) + ' MB)');
          }
        } catch (e) {
          console.warn('progress parse:', e);
        }
      },
    });
    modelReady = true;
    setStatus('✅ AI ready - Mic dabayein aur bolen', 'ready');
    showBubble('Namaste! Main aapka AI assistant hoon. Mic dabayein aur bolen.');
    addMsg('AI model ready hai. Hindi/Hinglish/English me baat kar sakte hain.', false);
  } catch (e) {
    console.error(e);
    setStatus('❌ Model load failed: ' + e.message, 'downloading');
    showBubble('Model load nahi hua. Internet check karke page refresh karein.');
  }
}

async function askAI(userText) {
  if (!modelReady || !generator) {
    const m = 'AI model abhi ready nahi hai';
    showBubble(m);
    return;
  }
  if (isThinking) return;

  setThinking(true);
  addMsg(userText, true);
  showBubbleTyping();
  history.push({ role: 'user', content: userText });

  // build string prompt (Qwen chat format) - same as Android version
  let prompt = "<|im_start|>system\n" + SYSTEM_PROMPT + "<|im_end|>\n";
  const recent = history.slice(-8);
  for (const msg of recent) {
    const role = msg.role === 'user' ? 'user' : 'assistant';
    prompt += "<|im_start|>" + role + "\n" + msg.content + "<|im_end|>\n";
  }
  prompt += "<|im_start|>assistant\n";

  try {
    const output = await generator(prompt, {
      max_new_tokens: 256,
      temperature: 0.7,
      top_p: 0.95,
      do_sample: true,
    });

    // robustly extract the generated_text as a string
    let raw = null;
    if (Array.isArray(output)) {
      raw = output[0]?.generated_text;
    } else if (output && typeof output === 'object') {
      raw = output.generated_text ?? output.text ?? output.output_text;
    } else {
      raw = output;
    }
    if (raw === null || raw === undefined) raw = JSON.stringify(output);
    let text = String(raw);

    // take everything after the last "<|im_start|>assistant" marker
    const marker = '<|im_start|>assistant';
    const mIdx = text.lastIndexOf(marker);
    let answer;
    if (mIdx >= 0) {
      answer = text.slice(mIdx + marker.length);
      const endIdx = answer.search(/<\|im_end\|>|<\|endoftext\|>|<\/?s>/);
      if (endIdx >= 0) answer = answer.slice(0, endIdx);
    } else {
      // fallback: strip any known markers
      answer = text;
    }
    answer = answer.replace(/<\|im_end\|>/g, '').replace(/<\|endoftext\|>/g, '').replace(/<\|im_start\|>/g, '').trim();

    if (!answer) answer = 'Mujhe samajh nahi aaya, thoda aur batao.';

    history.push({ role: 'assistant', content: answer });
    if (history.length > 16) history.splice(0, history.length - 16);

    setThinking(false);
    addMsg(answer, false);
    speak(answer);
  } catch (e) {
    console.error(e);
    setThinking(false);
    const m = 'Error: ' + e.message;
    addMsg(m, false);
    showBubble(m);
  }
}

// ---------- UI EVENTS ----------
micBtn.addEventListener('click', startListening);
sendBtn.addEventListener('click', () => {
  const t = textInput.value.trim();
  if (t) {
    textInput.value = '';
    askAI(t);
  }
});
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const t = textInput.value.trim();
    if (t) {
      textInput.value = '';
      askAI(t);
    }
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') stopSpeaking();
});

// ---------- INIT ----------
if (speechSynthesis) {
  speechSynthesis.getVoices(); // warm up
}
setupRecognition();
loadModel();