# AI Voice Assistant (Web)

Ek free web-based AI voice assistant jisme ek **animated human-like robot** hai — jab AI bolta hai to robot ka **mouth move** karta hai.

- 🎤 **Voice input** — Hindi / Hinglish / English bolo (browser ka Speech Recognition)
- 🔊 **Voice output** — robot bolta hai (Hindi voice)
- 🧠 **On-device AI** — Qwen2.5-0.5B browser me chalta hai (transformers.js)
- 💯 **100% free** — koi API key nahi, koi paid service nahi. Model download ke baad offline.
- 🤖 **Animated robot** — aankhein blink, chest glow, mouth talking animation

## Kaise chalu karein

```
index.html ko browser me kholo (Chrome/Edge best)
```

Ya local server se:

```
python -m http.server 8080
# browser me: http://localhost:8080
```

> **Note:** Pahli baar page kholne par ~500 MB ka AI model browser me download hota hai (sirf ek baar). Iske baad offline chalta hai.

## Files

- `index.html` — page structure + robot layout
- `style.css` — robot animation, UI styling
- `main.js` — speech recognition, TTS, on-device AI, mouth sync

## AI model

[onnx-community/Qwen2.5-0.5B-Instruct](https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct) (Apache 2.0, free, open-source)
