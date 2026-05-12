// ─── STATE ───────────────────────────────────────────────────────────────────
let capturedImageDataURL = null;
let stream = null;

// Model campaign images used as pose references for Gemini.
// POSE 1: back view (confirmed UUID)
// POSE 2: front 3/4 view — update UUID below once you have it from browser DevTools
const POSES = [
  {
    poseUrl:  'images/model-back.jpg',
    imgEl:    () => document.getElementById('gallery-img-back'),
    badgeEl:  () => document.getElementById('gemini-badge-back'),
    label:    'back view',
  },
  {
    poseUrl:  'images/model-back.jpg', // ← swap UUID here for front view
    imgEl:    () => document.getElementById('gallery-img-front'),
    badgeEl:  () => document.getElementById('gemini-badge-front'),
    label:    'front view',
  },
];

// ─── DOM REFS ─────────────────────────────────────────────────────────────────
const modal     = document.getElementById('tryon-modal');
const screens   = {
  camera:     document.getElementById('screen-camera'),
  processing: document.getElementById('screen-processing'),
  error:      document.getElementById('screen-error'),
};
const videoEl    = document.getElementById('camera-feed');
const canvasEl   = document.getElementById('camera-canvas');
const statusEl   = document.getElementById('processing-status');
const errorMsgEl = document.getElementById('error-message');
const toastEl    = document.getElementById('toast');

// ─── OPEN MODAL ───────────────────────────────────────────────────────────────
function openModal() {
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  showScreen('camera');
  startCamera();
}

document.getElementById('open-tryon').addEventListener('click', openModal);
document.getElementById('open-tryon-gallery').addEventListener('click', openModal);

// ─── CLOSE MODAL ──────────────────────────────────────────────────────────────
function closeModal() {
  modal.classList.remove('active');
  document.body.style.overflow = '';
  stopCamera();
}

['close-modal', 'close-modal-2', 'close-modal-4'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', closeModal);
});
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
});

// ─── SCREEN SWITCHER ──────────────────────────────────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

// ─── CAMERA ───────────────────────────────────────────────────────────────────
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    videoEl.srcObject = stream;
  } catch {
    showError('Camera access denied. Please allow camera access and try again.');
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
    videoEl.srcObject = null;
  }
}

// ─── CAPTURE ──────────────────────────────────────────────────────────────────
document.getElementById('capture-btn').addEventListener('click', async () => {
  if (!stream) return;
  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;
  canvasEl.width = w;
  canvasEl.height = h;
  const ctx = canvasEl.getContext('2d');
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, w, h);
  capturedImageDataURL = canvasEl.toDataURL('image/jpeg', 0.92);
  stopCamera();
  showScreen('processing');
  // Brief processing screen for UX, then hand off to background generation
  await delay(800);
  runTryOn(); // intentionally not awaited — runs in background after modal closes
});

// ─── GEMINI VIRTUAL TRY-ON (runs all poses in sequence) ──────────────────────
async function runTryOn() {
  const userBase64 = capturedImageDataURL.split(',')[1];

  closeModal();
  showToast('Generating your looks… this takes about 30 seconds');

  let anySuccess = false;

  for (let i = 0; i < POSES.length; i++) {
    const pose = POSES[i];

    // Scroll the gallery to show the slot being generated
    const slotEl = pose.imgEl()?.closest('.gallery-cell');
    if (slotEl) {
      slotEl.classList.add('generating');
    }

    let poseBase64;
    try {
      poseBase64 = await fetchImageAsBase64(pose.poseUrl);
    } catch {
      console.warn(`[Gemini] Could not load pose image ${i + 1}, skipping.`);
      if (slotEl) slotEl.classList.remove('generating');
      continue;
    }

    const prompt = [
      'You are a fashion virtual try-on AI for Burberry.',
      'You are given two images:',
      '  Image 1 — a photo of the user (face and body reference).',
      `  Image 2 — a Burberry campaign photo of a model wearing the Knight Stamp Cotton Hoodie (${pose.label} pose, lighting, background, and product reference).`,
      '',
      'Generate a single photorealistic image that replaces the model in Image 2 with the user from Image 1.',
      '',
      'Rules:',
      `• Adopt the EXACT ${pose.label} pose, camera angle, framing, lighting, and background from Image 2.`,
      '• Use the user\'s face, skin tone, hair, and body proportions from Image 1.',
      '• The user wears the same Burberry Knight Stamp Cotton Hoodie (cornflower blue) exactly as the model in Image 2.',
      '• Match the hoodie\'s fabric drape, shadows, and fit to the campaign image.',
      '• The result must look like a professional Burberry campaign photo with the user as the model.',
      '• Output only the image — no text, no borders, no watermarks.',
    ].join('\n');

    try {
      const res = await fetch('/.netlify/functions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userBase64, poseBase64, poseLabel: pose.label }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `API error ${res.status}`);
      }

      const data = await res.json();
      console.log(`[Gemini] pose ${i + 1} response:`, JSON.stringify(data, null, 2));

      const parts      = data?.candidates?.[0]?.content?.parts ?? [];
      const imagePart  = parts.find(p => p.inline_data || p.inlineData);
      const textPart   = parts.find(p => p.text);
      const finishReason = data?.candidates?.[0]?.finishReason;

      if (!imagePart) {
        const detail = textPart?.text
          ? `Pose ${i + 1}: model replied with text: "${textPart.text.slice(0, 120)}"`
          : `Pose ${i + 1} stopped (${finishReason}). Check console.`;
        console.warn('[Gemini]', detail);
        if (slotEl) slotEl.classList.remove('generating');
        continue;
      }

      const imageData = imagePart.inline_data ?? imagePart.inlineData;
      const mimeType  = imageData.mime_type ?? imageData.mimeType;
      const dataURL   = `data:${mimeType};base64,${imageData.data}`;

      applyResultToSlot(pose, dataURL);
      anySuccess = true;

    } catch (err) {
      console.error(`[Gemini] pose ${i + 1} error:`, err);
      if (slotEl) slotEl.classList.remove('generating');
    }
  }

  if (anySuccess) {
    showToast('Your looks are ready — scroll the gallery to see them');
  } else {
    showToast('Generation failed. Check the console (F12) for details.');
  }
}

// ─── APPLY RESULT TO A GALLERY SLOT ──────────────────────────────────────────
function applyResultToSlot(pose, dataURL) {
  const imgEl    = pose.imgEl();
  const badgeEl  = pose.badgeEl();
  const slotEl   = imgEl?.closest('.gallery-cell');

  if (!imgEl) return;

  imgEl.style.transition = 'opacity 0.35s';
  imgEl.style.opacity = '0';

  setTimeout(() => {
    imgEl.src = dataURL;
    imgEl.style.opacity = '1';
    if (badgeEl) badgeEl.classList.remove('hidden');
    if (slotEl)  slotEl.classList.remove('generating');
  }, 360);
}

// ─── RETRY / RETAKE ───────────────────────────────────────────────────────────
document.getElementById('retry-btn').addEventListener('click', () => {
  showScreen('camera');
  startCamera();
});

// ─── ADD TO BAG ───────────────────────────────────────────────────────────────
document.getElementById('add-to-bag').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const countEl = document.querySelector('.bag-count');
  countEl.textContent = parseInt(countEl.textContent, 10) + 1;
  btn.textContent = 'Added';
  btn.style.background = '#1a6b1a';
  setTimeout(() => {
    btn.textContent = 'Add to Bag';
    btn.style.background = '';
  }, 2200);
});

// ─── GALLERY SCROLL COUNTER ──────────────────────────────────────────────────
const galleryScroll  = document.getElementById('gallery-scroll');
const galleryCounter = document.getElementById('gallery-counter');
const galleryRows    = document.querySelectorAll('.gallery-row');

if (galleryScroll) {
  galleryScroll.addEventListener('scroll', () => {
    let visible = 1;
    galleryRows.forEach((row, i) => {
      const rect = row.getBoundingClientRect();
      const containerRect = galleryScroll.getBoundingClientRect();
      if (rect.top < containerRect.bottom - 80) visible = i + 1;
    });
    galleryCounter.textContent = `${visible} / ${galleryRows.length}`;
  });
}

// ─── SIZE / SWATCH INTERACTION ────────────────────────────────────────────────
document.querySelectorAll('.size-btn:not(.disabled)').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});
document.querySelectorAll('.swatch').forEach((s, i) => {
  s.addEventListener('click', () => {
    document.querySelectorAll('.swatch').forEach(sw => sw.classList.remove('active'));
    s.classList.add('active');
  });
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

function showError(msg) {
  if (errorMsgEl) errorMsgEl.textContent = msg;
  showScreen('error');
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toastEl.classList.add('visible'));
  });
  setTimeout(() => {
    toastEl.classList.remove('visible');
    setTimeout(() => toastEl.classList.add('hidden'), 300);
  }, 3500);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchImageAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
