const startButton = document.querySelector("#startButton");
const demoButton = document.querySelector("#demoButton");
const stopButton = document.querySelector("#stopButton");
const sendButton = document.querySelector("#sendButton");
const voiceToggle = document.querySelector("#voiceToggle");
const earsToggle = document.querySelector("#earsToggle");
const presenceInput = document.querySelector("#presenceInput");
const scanStatus = document.querySelector("#scanStatus");
const permissionNote = document.querySelector("#permissionNote");
const inputBadge = document.querySelector("#inputBadge");
const cameraBadge = document.querySelector("#cameraBadge");
const aiBadge = document.querySelector("#aiBadge");
const earsBadge = document.querySelector("#earsBadge");
const composerNote = document.querySelector("#composerNote");
const conversationState = document.querySelector("#conversationState");
const ghostScreen = document.querySelector("#ghostScreen");
const ghostCaption = document.querySelector("#ghostCaption");
const ghostFeed = document.querySelector("#ghostFeed");
const latestGhostLine = document.querySelector("#latestGhostLine");
const cameraFeed = document.querySelector("#cameraFeed");
const cameraCanvas = document.querySelector("#cameraCanvas");
const cameraFallback = document.querySelector("#cameraFallback");
const framingValue = document.querySelector("#framingValue");
const spectrumBarsContainer = document.querySelector("#spectrumBars");

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const spectrumBars = [];
const transcriptHistory = [];
const typingTimestamps = [];
const recentVolumes = [];
const recentCentroids = [];
const recentVisualMotion = [];
const recentFocus = [];
const recentBalanceOffsets = [];
const recentVisualPresence = [];
const recentMotionSides = [];

const state = {
  mode: "idle",
  aiAvailable: false,
  aiModel: "",
  audioContext: null,
  analyser: null,
  audioStream: null,
  videoStream: null,
  sourceNode: null,
  frequencyData: null,
  timeData: null,
  rafId: null,
  previousLumaFrame: null,
  videoReady: false,
  voiceEnabled: false,
  availableVoices: [],
  selectedVoice: null,
  earsEnabled: false,
  speechInputAvailable: Boolean(SpeechRecognitionCtor),
  restartingRecognition: false,
  recognition: null,
  conversationBusy: false,
  initiativeInFlight: false,
  sessionId: createSessionId(),
  lastSpokenLine: "",
  lastSpokenAt: 0,
  captionTimer: 0,
  lastGesture: "None",
  lastGestureAt: 0,
  lastUserActivityAt: 0,
  lastGhostInitiativeAt: 0,
  nextInitiativeAt: 0,
  userTurns: 0,
  lastMetrics: {
    confidence: 18,
    pressure: 16,
    momentum: 22,
    clarity: 30,
    focus: 24,
    presence: 12,
    volume: 0,
    centroid: 0.25,
    cadence: 0,
    motion: 0.12,
    brightness: 0.34,
    framing: "Centered",
    visual: "Camera offline",
    gesture: "None",
  },
};

const cameraContext = cameraCanvas.getContext("2d", { willReadFrequently: true });

initialize();

async function initialize() {
  buildSpectrum();
  renderTranscript([]);
  renderGhostState("Listening", "Start the call, then talk to Ghost like it is a person on the other side.");
  refreshSpeechVoices();
  updateStatus();
  updateVoiceButton();
  updateEarsButton();
  updateComposerState();
  attachEvents();
  await checkBackend();
}

function attachEvents() {
  startButton.addEventListener("click", startLiveCall);
  demoButton.addEventListener("click", startDemoMode);
  stopButton.addEventListener("click", stopCall);
  sendButton.addEventListener("click", sendCurrentMessage);
  voiceToggle.addEventListener("click", toggleVoice);
  earsToggle.addEventListener("click", toggleEars);
  presenceInput.addEventListener("input", updateComposerState);
  presenceInput.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      sendCurrentMessage();
    }
  });
  document.addEventListener("keydown", handleTypingSignal, true);

  cameraFeed.addEventListener("loadeddata", () => {
    state.videoReady = true;
    cameraFallback.hidden = true;
  });

  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = refreshSpeechVoices;
  }
}

async function checkBackend() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) throw new Error("Health check failed");
    const data = await response.json();
    state.aiAvailable = Boolean(data?.ai);
    state.aiModel = data?.model || "";
  } catch {
    state.aiAvailable = false;
    state.aiModel = "";
  }
  updateStatus();
  updateComposerState();
}

function refreshSpeechVoices() {
  if (!window.speechSynthesis) return;

  const voices = window.speechSynthesis.getVoices();
  state.availableVoices = voices;
  state.selectedVoice = pickBestVoice(voices);
  updateVoiceButton();
}

function buildSpectrum() {
  for (let index = 0; index < 22; index += 1) {
    const bar = document.createElement("span");
    bar.style.height = `${14 + (index % 4) * 4}%`;
    spectrumBars.push(bar);
    spectrumBarsContainer.appendChild(bar);
  }
}

async function startLiveCall() {
  stopCall();

  if (!navigator.mediaDevices?.getUserMedia) {
    permissionNote.textContent = "This browser does not expose mic or camera access. Demo mode is still available.";
    return;
  }

  try {
    const audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      permissionNote.textContent = "Live audio analysis is not supported in this browser.";
      audioStream.getTracks().forEach((track) => track.stop());
      return;
    }

    const audioContext = new AudioContextCtor();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.84;

    const sourceNode = audioContext.createMediaStreamSource(audioStream);
    sourceNode.connect(analyser);

    let videoStream = null;
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
      });
      cameraFeed.srcObject = videoStream;
      cameraFallback.hidden = true;
    } catch {
      cameraFeed.srcObject = null;
      cameraFallback.hidden = false;
      cameraFallback.textContent = "camera blocked";
    }

    state.mode = "live";
    state.audioContext = audioContext;
    state.analyser = analyser;
    state.audioStream = audioStream;
    state.videoStream = videoStream;
    state.sourceNode = sourceNode;
    state.frequencyData = new Uint8Array(analyser.frequencyBinCount);
    state.timeData = new Float32Array(analyser.fftSize);
    state.previousLumaFrame = null;
    state.videoReady = Boolean(videoStream);
    state.sessionId = createSessionId();
    state.lastSpokenLine = "";
    state.lastUserActivityAt = Date.now();
    state.lastGhostInitiativeAt = 0;
    state.nextInitiativeAt = 0;
    state.userTurns = 0;
    state.initiativeInFlight = false;

    await resetServerConversation();
    renderTranscript([]);

    permissionNote.textContent =
      "Ghost is live. Speak naturally and it should respond like a real call.";
    renderGhostState("Live", "Talk to Ghost or type a message below to start the conversation.");
    updateStatus();
    updateComposerState();
    enableVoiceIfAvailable();
    enableEarsIfAvailable();
    startLoop();
  } catch {
    permissionNote.textContent = "Microphone access was blocked. Demo mode can still show the visual side.";
  }
}

async function startDemoMode() {
  stopCall();
  state.mode = "demo";
  state.sessionId = createSessionId();
  state.lastSpokenLine = "";
  state.lastUserActivityAt = Date.now();
  state.lastGhostInitiativeAt = 0;
  state.nextInitiativeAt = 0;
  state.userTurns = 0;
  state.initiativeInFlight = false;
  await resetServerConversation();
  renderTranscript([]);

  permissionNote.textContent =
    "Demo mode is live. Ghost can still talk, but the signal is synthetic instead of coming from your mic and camera.";
  renderGhostState("Demo", "Type to Ghost here, or switch to a live call for the full experience.");
  cameraFallback.hidden = false;
  cameraFallback.textContent = "demo feed";
  updateStatus();
  updateComposerState();
  enableVoiceIfAvailable();
  startLoop();
}

function stopCall() {
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }

  if (state.audioStream) {
    state.audioStream.getTracks().forEach((track) => track.stop());
  }

  if (state.videoStream) {
    state.videoStream.getTracks().forEach((track) => track.stop());
  }

  if (state.sourceNode) {
    try {
      state.sourceNode.disconnect();
    } catch {}
  }

  if (state.audioContext && state.audioContext.state !== "closed") {
    state.audioContext.close().catch(() => {});
  }

  stopGhostSpeech();
  stopRecognition();

  cameraFeed.srcObject = null;
  cameraFallback.hidden = false;
  cameraFallback.textContent = "camera idle";

  state.mode = "idle";
  state.audioContext = null;
  state.analyser = null;
  state.audioStream = null;
  state.videoStream = null;
  state.sourceNode = null;
  state.frequencyData = null;
  state.timeData = null;
  state.previousLumaFrame = null;
  state.videoReady = false;
  state.conversationBusy = false;
  state.earsEnabled = false;
  state.initiativeInFlight = false;
  recentVolumes.length = 0;
  recentCentroids.length = 0;
  recentVisualMotion.length = 0;
  recentFocus.length = 0;
  recentBalanceOffsets.length = 0;
  recentVisualPresence.length = 0;
  recentMotionSides.length = 0;
  state.lastGesture = "None";
  state.lastGestureAt = 0;
  state.lastUserActivityAt = 0;
  state.lastGhostInitiativeAt = 0;
  state.nextInitiativeAt = 0;
  state.userTurns = 0;

  renderGhostState("Listening", "Start the call, then talk to Ghost like it is a person on the other side.");
  resetFaceMotion();
  setSpectrum(new Array(spectrumBars.length).fill(0.14));
  updateStatus();
  updateEarsButton();
  updateComposerState();
}

function startLoop() {
  const loop = () => {
    const metrics =
      state.mode === "live" ? sampleLiveMetrics() : state.mode === "demo" ? sampleDemoMetrics() : null;

    if (metrics) {
      state.lastMetrics = metrics;
      updateFace(metrics);
      maybeReactToGesture(metrics);
      maybeTriggerGhostInitiative(metrics);
      framingValue.textContent = metrics.framing;
    }

    if (state.mode !== "idle") {
      state.rafId = requestAnimationFrame(loop);
    }
  };

  loop();
}

function sampleLiveMetrics() {
  const analyser = state.analyser;
  analyser.getByteFrequencyData(state.frequencyData);
  analyser.getFloatTimeDomainData(state.timeData);

  let rmsSum = 0;
  let sum = 0;
  let weighted = 0;
  let low = 0;
  let mid = 0;
  let high = 0;

  for (let index = 0; index < state.timeData.length; index += 1) {
    const sample = state.timeData[index];
    rmsSum += sample * sample;
  }

  for (let index = 0; index < state.frequencyData.length; index += 1) {
    const value = state.frequencyData[index] / 255;
    sum += value;
    weighted += value * index;
    if (index < state.frequencyData.length * 0.25) low += value;
    else if (index < state.frequencyData.length * 0.65) mid += value;
    else high += value;
  }

  const visual = sampleCameraMetrics();
  const rms = Math.sqrt(rmsSum / state.timeData.length);
  const volume = clamp(rms * 4.6, 0, 1);
  const centroid = sum ? weighted / (sum * state.frequencyData.length) : 0;
  const now = Date.now();
  const cadence = getTypingCadence(now);
  const typingBoost = clamp(cadence / 220, 0, 1);

  recentVolumes.push(volume);
  recentCentroids.push(centroid);
  if (recentVolumes.length > 45) recentVolumes.shift();
  if (recentCentroids.length > 45) recentCentroids.shift();

  const volumeVariance = averageDeviation(recentVolumes);
  const centroidVariance = averageDeviation(recentCentroids);
  const clarity = clamp(
    (mid / Math.max(low + high + mid, 0.0001)) * 76 + (1 - centroidVariance) * 18 + visual.focus * 12,
    0,
    100
  );
  const confidence = clamp(volume * 44 + typingBoost * 18 + visual.focus * 26 + (1 - volumeVariance) * 18, 0, 100);
  const pressure = clamp(volumeVariance * 68 + high * 18 + typingBoost * 8 + visual.motion * 16, 0, 100);
  const momentum = clamp(volume * 28 + typingBoost * 40 + visual.motion * 22 + (1 - centroidVariance) * 16, 0, 100);
  const focus = clamp(visual.focus * 58 + (1 - visual.motion) * 12 + typingBoost * 10 + 12, 0, 100);
  const presence = clamp(
    confidence * 0.28 + momentum * 0.26 + clarity * 0.18 + focus * 0.24 - pressure * 0.1 + 8,
    0,
    100
  );

  setSpectrum(Array.from(state.frequencyData.slice(0, spectrumBars.length), (value) => value / 255));

  return {
    confidence: Math.round(confidence),
    pressure: Math.round(pressure),
    momentum: Math.round(momentum),
    clarity: Math.round(clarity),
    focus: Math.round(focus),
    presence: Math.round(presence),
    volume,
    centroid,
    cadence,
    motion: visual.motion,
    brightness: visual.brightness,
    framing: visual.framing,
    visual: visual.visual,
    gesture: visual.gesture,
  };
}

function sampleCameraMetrics() {
  if (!state.videoStream || !state.videoReady || !cameraFeed.videoWidth || !cameraFeed.videoHeight) {
    return {
      motion: 0.08,
      brightness: 0.32,
      focus: 0.24,
      framing: "No camera",
      visual: "Camera offline",
      gesture: "None",
    };
  }

  cameraContext.drawImage(cameraFeed, 0, 0, cameraCanvas.width, cameraCanvas.height);
  const frame = cameraContext.getImageData(0, 0, cameraCanvas.width, cameraCanvas.height).data;

  let totalBrightness = 0;
  let leftBrightness = 0;
  let rightBrightness = 0;
  let centerBrightness = 0;
  let centerCount = 0;
  let motion = 0;
  let leftMotion = 0;
  let rightMotion = 0;
  let centerMotion = 0;
  const currentLumaFrame = new Float32Array(cameraCanvas.width * cameraCanvas.height);

  for (let y = 0; y < cameraCanvas.height; y += 1) {
    for (let x = 0; x < cameraCanvas.width; x += 1) {
      const pixelIndex = (y * cameraCanvas.width + x) * 4;
      const index = y * cameraCanvas.width + x;
      const luma =
        (frame[pixelIndex] * 0.2126 + frame[pixelIndex + 1] * 0.7152 + frame[pixelIndex + 2] * 0.0722) / 255;

      currentLumaFrame[index] = luma;
      totalBrightness += luma;
      if (x < cameraCanvas.width / 2) leftBrightness += luma;
      else rightBrightness += luma;

      if (
        x > cameraCanvas.width * 0.25 &&
        x < cameraCanvas.width * 0.75 &&
        y > cameraCanvas.height * 0.18 &&
        y < cameraCanvas.height * 0.82
      ) {
        centerBrightness += luma;
        centerCount += 1;
      }

      if (state.previousLumaFrame) {
        const delta = Math.abs(luma - state.previousLumaFrame[index]);
        motion += delta;
        if (x < cameraCanvas.width / 2) leftMotion += delta;
        else rightMotion += delta;
        if (
          x > cameraCanvas.width * 0.25 &&
          x < cameraCanvas.width * 0.75 &&
          y > cameraCanvas.height * 0.18 &&
          y < cameraCanvas.height * 0.82
        ) {
          centerMotion += delta;
        }
      }
    }
  }

  state.previousLumaFrame = currentLumaFrame;

  const pixelCount = cameraCanvas.width * cameraCanvas.height;
  const brightness = totalBrightness / pixelCount;
  const center = centerCount ? centerBrightness / centerCount : brightness;
  const left = leftBrightness / (pixelCount / 2);
  const right = rightBrightness / (pixelCount / 2);
  const balance = 1 - clamp(Math.abs(left - right) * 1.9, 0, 1);
  const offset = clamp(right - left, -1, 1);
  const motionScore = clamp((motion / pixelCount) * 4.6, 0, 1);
  const sideMotionBias =
    leftMotion + rightMotion > 0 ? clamp((rightMotion - leftMotion) / (leftMotion + rightMotion), -1, 1) : 0;
  const centeredMotionScore = centerCount ? clamp(centerMotion / centerCount / 0.14, 0, 1) : 0;
  const focusScore = clamp(center * 0.45 + balance * 0.32 + (1 - motionScore) * 0.23, 0, 1);
  const presenceScore = clamp(center * 0.62 + balance * 0.2 + brightness * 0.18, 0, 1);

  recentVisualMotion.push(motionScore);
  recentFocus.push(focusScore);
  recentBalanceOffsets.push(offset);
  recentVisualPresence.push(presenceScore);
  recentMotionSides.push(
    motionScore > 0.08 && Math.abs(sideMotionBias) > 0.12 ? (sideMotionBias > 0 ? 1 : -1) : 0
  );
  if (recentVisualMotion.length > 40) recentVisualMotion.shift();
  if (recentFocus.length > 40) recentFocus.shift();
  if (recentBalanceOffsets.length > 24) recentBalanceOffsets.shift();
  if (recentVisualPresence.length > 40) recentVisualPresence.shift();
  if (recentMotionSides.length > 18) recentMotionSides.shift();

  const framing =
    balance > 0.84 ? "Centered" : left > right ? "Left drift" : "Right drift";
  const avgMotion = averageRecent(recentVisualMotion);
  const avgFocus = averageRecent(recentFocus);
  const avgPresence = averageRecent(recentVisualPresence);
  const waveScore = countDirectionalSwings(recentMotionSides);
  const gesture =
    avgPresence > 0.3 && centeredMotionScore > 0.2 && avgMotion > 0.1 && waveScore >= 2
      ? "Waving"
      : avgMotion > 0.15
        ? "Moving in frame"
        : avgPresence > 0.42
          ? "Visible on camera"
          : "Hard to read";
  const visual =
    gesture === "Waving"
      ? "I can see a wave in frame."
      : gesture === "Moving in frame"
        ? "I can see you moving on camera."
        : gesture === "Visible on camera"
          ? "I can see you clearly."
          : "Your camera feed is faint right now.";

  return {
    motion: avgMotion,
    brightness,
    focus: avgFocus,
    framing,
    visual,
    gesture,
  };
}

function sampleDemoMetrics() {
  const now = performance.now() * 0.0012;
  const cadence = getTypingCadence(Date.now());
  const volume = clamp(0.42 + Math.sin(now * 2.2) * 0.18 + Math.sin(now * 0.6) * 0.08, 0.08, 0.92);
  const centroid = clamp(0.38 + Math.sin(now * 1.4 + 1.8) * 0.16, 0.08, 0.85);
  const motion = clamp(0.28 + Math.sin(now * 1.8) * 0.16 + Math.sin(now * 0.4) * 0.06, 0.06, 0.9);
  const focusRaw = clamp(0.58 + Math.sin(now * 0.9 + 0.8) * 0.14 - motion * 0.08, 0.16, 0.95);
  const typingBoost = clamp(cadence / 220, 0, 1);
  const confidence = clamp(50 + Math.sin(now * 1.6) * 18 + typingBoost * 10 + focusRaw * 12, 0, 100);
  const pressure = clamp(26 + Math.sin(now * 2.8 + 1.2) * 16 + typingBoost * 10 + motion * 10, 0, 100);
  const momentum = clamp(58 + Math.sin(now * 1.9 + 0.7) * 20 + typingBoost * 14 + motion * 12, 0, 100);
  const clarity = clamp(62 + Math.sin(now * 1.2 + 2.4) * 14 - typingBoost * 6 + focusRaw * 8, 0, 100);
  const focus = clamp(focusRaw * 100, 0, 100);
  const presence = clamp(
    confidence * 0.28 + momentum * 0.28 + clarity * 0.18 + focus * 0.2 - pressure * 0.1,
    0,
    100
  );
  const framing = Math.sin(now * 0.72) > 0.33 ? "Centered" : Math.sin(now * 0.72) > -0.1 ? "Left drift" : "Right drift";

  setSpectrum(
    spectrumBars.map((_, index) =>
      clamp(0.18 + Math.sin(now * 3.1 + index * 0.42) * 0.22 + Math.sin(now * 0.9 + index * 0.18) * 0.12, 0.04, 0.96)
    )
  );

  return {
    confidence: Math.round(confidence),
    pressure: Math.round(pressure),
    momentum: Math.round(momentum),
    clarity: Math.round(clarity),
    focus: Math.round(focus),
    presence: Math.round(presence),
    volume,
    centroid,
    cadence,
    motion,
    brightness: 0.52,
    framing,
    visual: motion > 0.52 ? "Demo movement is visible." : "Demo frame is steady.",
    gesture: motion > 0.66 ? "Waving" : motion > 0.42 ? "Moving in frame" : "Visible on camera",
  };
}

function updateFace(metrics) {
  const mood = getGhostMood(metrics);
  renderGhostState(mood.title, mood.line);
  ghostScreen.classList.remove("mood-locked", "mood-calm", "mood-pressure", "mood-curious");
  ghostScreen.classList.add(mood.className);
  ghostScreen.classList.toggle("listening", state.mode !== "idle" && !ghostScreen.classList.contains("speaking"));
  applyFaceMotion(metrics);
}

function renderGhostState(title, line) {
  ghostScreen.dataset.state = title;
  ghostScreen.setAttribute("aria-label", `${title}. ${line}`);
}

function applyFaceMotion(metrics) {
  const tilt =
    (metrics.motion - 0.16) * 16 +
    (metrics.framing === "Left drift" ? -4 : metrics.framing === "Right drift" ? 4 : 0);
  const lift = -2 - metrics.motion * 10;
  const glow = 1 + metrics.presence / 220;
  const eyeScale = clamp(0.82 + metrics.clarity / 170 + metrics.volume * 0.14, 0.82, 1.18);
  const browShift = clamp(metrics.pressure / 28 - metrics.focus / 75, -2, 3);

  ghostScreen.style.setProperty("--ghost-tilt", `${tilt.toFixed(2)}deg`);
  ghostScreen.style.setProperty("--ghost-lift", `${lift.toFixed(2)}px`);
  ghostScreen.style.setProperty("--ghost-glow", glow.toFixed(2));
  ghostScreen.style.setProperty("--ghost-eye-scale", eyeScale.toFixed(2));
  ghostScreen.style.setProperty("--ghost-brow-shift", `${browShift.toFixed(2)}px`);
}

function maybeReactToGesture(metrics) {
  if (state.mode === "idle" || state.conversationBusy) return;

  const now = Date.now();
  const isFreshWave =
    metrics.gesture === "Waving" &&
    (state.lastGesture !== "Waving" || now - state.lastGestureAt > 5000);

  if (isFreshWave) {
    const line = buildGestureReaction(metrics);
    appendTranscript("assistant", line);
    speakGhost(line);
    state.lastGestureAt = now;
  }

  state.lastGesture = metrics.gesture;
}

function buildGestureReaction(metrics) {
  if (metrics.gesture === "Waving") {
    return "There you go. I saw the wave that time.";
  }

  if (metrics.gesture === "Moving in frame") {
    return "I can see you moving around in frame now.";
  }

  return metrics.visual || "I can see you.";
}

function getGhostMood(metrics) {
  if (metrics.gesture === "Waving") {
    return {
      title: "Saw That",
      line: "Ghost caught the wave. The camera read came through clearly.",
      className: "mood-locked",
    };
  }
  if (metrics.focus > 72 && metrics.confidence > 60 && metrics.pressure < 42) {
    return {
      title: "Locked On",
      line: "You look centered. Ghost has a very clean line on you right now.",
      className: "mood-locked",
    };
  }
  if (metrics.pressure > 62) {
    return {
      title: "Pressure",
      line: "Ghost can feel strain in the signal. You are landing, but not softly.",
      className: "mood-pressure",
    };
  }
  if (metrics.clarity > 68) {
    return {
      title: "Calm",
      line: "The signal is clean and readable. Ghost can follow you without guessing.",
      className: "mood-calm",
    };
  }
  return {
    title: "Listening",
    line: "Ghost is watching your face, voice, and timing. Say something when you want an answer.",
    className: "mood-curious",
  };
}

function setSpectrum(values) {
  values.forEach((value, index) => {
    const bar = spectrumBars[index];
    const height = 12 + value * 88;
    bar.style.height = `${height}%`;
    bar.style.opacity = String(clamp(0.45 + value * 0.7, 0.36, 1));
    bar.style.background =
      value > 0.7
        ? "linear-gradient(180deg, rgba(255,159,118,0.98), rgba(137,171,255,0.22))"
        : "linear-gradient(180deg, rgba(137,242,208,0.95), rgba(137,171,255,0.22))";
  });
}

async function sendCurrentMessage() {
  const message = presenceInput.value.trim();
  if (!message || state.mode === "idle" || state.conversationBusy) return;

  presenceInput.value = "";
  updateComposerState();
  await processConversationInput(message);
}

async function processConversationInput(message) {
  state.lastUserActivityAt = Date.now();
  state.userTurns += 1;
  scheduleNextInitiative();
  appendTranscript("user", message);

  if (state.aiAvailable) {
    await sendToApi(message);
    return;
  }

  const reply = buildLocalConversationReply(message, state.lastMetrics);
  appendTranscript("assistant", reply);
  speakGhost(reply);
  updateComposerState();
}

function maybeTriggerGhostInitiative(metrics) {
  if (state.mode === "idle" || state.conversationBusy || state.initiativeInFlight) return;
  if (!state.userTurns) return;
  if (ghostScreen.classList.contains("speaking")) return;

  const now = Date.now();
  const silenceMs = now - state.lastUserActivityAt;
  if (silenceMs < 12000) return;
  if (state.nextInitiativeAt && now < state.nextInitiativeAt) return;
  if (now - state.lastGhostInitiativeAt < 24000) return;

  void triggerGhostInitiative(metrics);
}

async function triggerGhostInitiative(metrics) {
  state.initiativeInFlight = true;
  state.conversationBusy = true;
  updateComposerState();

  try {
    let line = "";

    if (state.aiAvailable) {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: state.sessionId,
          mode: "initiative",
          message:
            "Take one natural initiative turn. Offer a relevant follow-up question, quick observation, or one light joke if it truly fits. Keep it short and call-like.",
          signal: {
            label: getGhostMood(metrics).title,
            confidence: metrics.confidence,
            pressure: metrics.pressure,
            momentum: metrics.momentum,
            clarity: metrics.clarity,
            focus: metrics.focus,
            presence: metrics.presence,
            motion: Math.round(metrics.motion * 100),
            framing: metrics.framing,
            cadence: metrics.cadence,
            visual: metrics.visual,
            gesture: metrics.gesture,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Ghost initiative failed");
      }

      state.sessionId = data.sessionId || state.sessionId;
      line = data.reply;
    } else {
      line = buildLocalInitiative(metrics);
    }

    if (line) {
      appendTranscript("assistant", line);
      speakGhost(line);
      state.lastGhostInitiativeAt = Date.now();
      scheduleNextInitiative(22000, 36000);
    }
  } catch {
    scheduleNextInitiative(20000, 32000);
  } finally {
    state.initiativeInFlight = false;
    state.conversationBusy = false;
    updateComposerState();
  }
}

async function sendToApi(message) {
  state.conversationBusy = true;
  updateComposerState();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: state.sessionId,
        message,
        signal: {
          label: getGhostMood(state.lastMetrics).title,
          confidence: state.lastMetrics.confidence,
          pressure: state.lastMetrics.pressure,
          momentum: state.lastMetrics.momentum,
          clarity: state.lastMetrics.clarity,
          focus: state.lastMetrics.focus,
          presence: state.lastMetrics.presence,
          motion: Math.round(state.lastMetrics.motion * 100),
          framing: state.lastMetrics.framing,
          cadence: state.lastMetrics.cadence,
          visual: state.lastMetrics.visual,
          gesture: state.lastMetrics.gesture,
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || "Ghost could not answer");
    }

    state.sessionId = data.sessionId || state.sessionId;
    appendTranscript("assistant", data.reply);
    speakGhost(data.reply);
  } catch (error) {
    appendTranscript(
      "assistant",
      error instanceof Error
        ? `I tried to answer, but the connection failed: ${error.message}`
        : "I tried to answer, but the connection failed."
    );
  } finally {
    state.conversationBusy = false;
    updateComposerState();
  }
}

function buildLocalConversationReply(message, metrics) {
  const lower = message.toLowerCase();
  const mood = getGhostMood(metrics);
  const visualLine = metrics.visual || "I only have a weak visual line right now.";

  if (lower.includes("can you see me") || lower.includes("do you see me")) {
    return `${visualLine} ${metrics.gesture === "Waving" ? "You just waved and it registered." : `Your framing looks ${metrics.framing.toLowerCase()}.`}`;
  }
  if (lower.includes("am i waving") || lower.includes("did you see that")) {
    return metrics.gesture === "Waving"
      ? "Yeah, I caught that. The wave came through on camera."
      : `${visualLine} If you want me to catch a wave, make a bigger side-to-side motion inside the frame.`;
  }

  if (lower.includes("how do i look") || lower.includes("how am i coming across")) {
    return `${mood.line} ${visualLine} If you want a stronger read, settle the frame and keep your voice even.`;
  }
  if (lower.includes("what do you think") || lower.includes("what are you seeing")) {
    return `${mood.line} ${visualLine} Right now your presence is ${metrics.presence}, and your focus is ${metrics.focus}.`;
  }
  if (lower.includes("hello") || lower.includes("hey") || lower.includes("hi")) {
    return "I am here. Talk to me normally and I will answer off what I hear and see.";
  }

  if (mood.title === "Pressure") {
    return "You are definitely coming through, but the strain is getting there first. Try one calmer sentence.";
  }
  if (mood.title === "Locked On") {
    return metrics.gesture === "Waving"
      ? "I saw that wave. You are coming through clearly now."
      : "This is the strongest visual line I have had on you so far. Keep going.";
  }
  if (mood.title === "Calm") {
    return "You sound controlled enough that I can actually follow what you mean.";
  }

  return "I hear you. Give me a little more and I can answer you more precisely.";
}

function buildLocalInitiative(metrics) {
  if (metrics.gesture === "Waving") {
    return "You have a more playful presence when you break the stillness like that.";
  }
  if (metrics.pressure > 60) {
    return "You sound like you are carrying something heavier than the words themselves. Want to say the sharper version of it?";
  }
  if (metrics.clarity > 68 && metrics.focus > 60) {
    return "You are coming through clearly now. What part of this matters most to you?";
  }
  if (metrics.motion > 0.2) {
    return "You keep moving like you already know the answer is nearby.";
  }
  return "I am still with you. What are you not saying yet?";
}

function renderTranscript(items) {
  transcriptHistory.length = 0;
  items.forEach((item) => transcriptHistory.push(item));
  paintTranscript();
}

function appendTranscript(role, text) {
  transcriptHistory.push({ role, text });
  if (transcriptHistory.length > 18) {
    transcriptHistory.splice(0, transcriptHistory.length - 18);
  }
  if (role === "assistant") {
    if (latestGhostLine) {
      latestGhostLine.textContent = text;
    }
    showGhostCaption(text);
  }
  paintTranscript();
}

function paintTranscript() {
  if (!ghostFeed) return;
  ghostFeed.innerHTML = "";
  transcriptHistory.forEach((item) => {
    const article = document.createElement("article");
    article.className = `ghost-message message-${item.role}`;

    const title = document.createElement("strong");
    title.textContent = item.role === "user" ? "You" : "Ghost";

    const body = document.createElement("p");
    body.textContent = item.text;

    article.append(title, body);
    ghostFeed.appendChild(article);
  });
  ghostFeed.scrollTop = ghostFeed.scrollHeight;
}

function showGhostCaption(text) {
  if (!ghostCaption) return;

  ghostCaption.textContent = text;
  ghostCaption.classList.add("visible");

  if (state.captionTimer) {
    window.clearTimeout(state.captionTimer);
  }

  state.captionTimer = window.setTimeout(() => {
    ghostCaption.classList.remove("visible");
  }, 5200);
}

function handleTypingSignal(event) {
  if (state.mode === "idle") return;
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;

  const key = event.key;
  const isTypingKey =
    key.length === 1 || key === "Backspace" || key === "Enter" || key === "Tab" || key === " ";

  if (!isTypingKey) return;

  const now = Date.now();
  typingTimestamps.push(now);
  pruneTypingTimestamps(now);
}

function pruneTypingTimestamps(now) {
  while (typingTimestamps.length && now - typingTimestamps[0] > 12000) {
    typingTimestamps.shift();
  }
}

function getTypingCadence(now) {
  pruneTypingTimestamps(now);
  return Math.round((typingTimestamps.length / 12) * 60);
}

function updateStatus() {
  scanStatus.textContent = state.mode === "idle" ? "call idle" : state.mode === "demo" ? "demo live" : "call live";
  aiBadge.textContent = state.aiAvailable ? "api online" : "api offline";
  inputBadge.textContent = state.mode === "idle" ? "mic offline" : "mic live";
  cameraBadge.textContent =
    state.mode === "idle"
      ? "camera offline"
      : state.mode === "demo"
        ? "camera demo"
        : state.videoStream
          ? "camera live"
          : "camera blocked";
  earsBadge.textContent = state.earsEnabled ? "ears on" : "ears off";
}

function updateComposerState() {
  const hasText = Boolean(presenceInput.value.trim());
  sendButton.disabled = !hasText || state.mode === "idle" || state.conversationBusy;

  if (state.conversationBusy) {
    composerNote.textContent = "Ghost is answering...";
    conversationState.textContent = "Ghost is thinking.";
    return;
  }

  if (state.mode === "idle") {
    composerNote.textContent = "Start the call first, then talk or type to Ghost.";
    conversationState.textContent = "Waiting for you.";
    return;
  }

  composerNote.textContent = state.aiAvailable
    ? `Ghost is connected to ${state.aiModel || "the API"}.`
    : "Ghost is in local mode. Add an API key for deeper replies.";
  conversationState.textContent = state.earsEnabled
    ? "Ghost is listening to your voice."
    : "Ghost is ready for a typed message.";
}

async function resetServerConversation() {
  try {
    await fetch("/api/reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: state.sessionId,
      }),
    });
  } catch {}
}

function toggleVoice() {
  state.voiceEnabled = !state.voiceEnabled && Boolean(window.speechSynthesis);
  if (!window.speechSynthesis) {
    state.voiceEnabled = false;
  }
  if (!state.voiceEnabled) {
    stopGhostSpeech();
  }
  updateVoiceButton();
}

function enableVoiceIfAvailable() {
  if (!window.speechSynthesis || state.voiceEnabled) return;
  state.voiceEnabled = true;
  updateVoiceButton();
}

function updateVoiceButton() {
  if (!window.speechSynthesis) {
    voiceToggle.disabled = true;
    voiceToggle.textContent = "Ghost voice unavailable";
    return;
  }

  voiceToggle.disabled = false;
  voiceToggle.textContent = state.voiceEnabled
    ? `Ghost voice on${state.selectedVoice ? "" : " (basic)"}`
    : "Ghost voice off";
  voiceToggle.classList.toggle("voice-on", state.voiceEnabled);
}

function toggleEars() {
  if (!state.speechInputAvailable) {
    permissionNote.textContent = "Browser speech recognition is not available here, so Ghost cannot listen to your words directly.";
    updateEarsButton();
    return;
  }

  if (state.earsEnabled) {
    state.earsEnabled = false;
    stopRecognition();
  } else {
    state.earsEnabled = true;
    startRecognition();
  }

  updateEarsButton();
  updateComposerState();
  updateStatus();
}

function enableEarsIfAvailable() {
  if (!state.speechInputAvailable || state.earsEnabled || state.mode === "idle") {
    updateEarsButton();
    updateStatus();
    return;
  }

  state.earsEnabled = true;
  startRecognition();
  updateEarsButton();
  updateStatus();
}

function updateEarsButton() {
  if (!state.speechInputAvailable) {
    earsToggle.disabled = true;
    earsToggle.textContent = "Ghost ears unavailable";
    return;
  }

  earsToggle.disabled = state.mode === "idle";
  earsToggle.textContent = state.earsEnabled ? "Ghost ears on" : "Ghost ears off";
  earsToggle.classList.toggle("voice-on", state.earsEnabled);
}

function createRecognition() {
  if (!SpeechRecognitionCtor) return null;

  const recognition = new SpeechRecognitionCtor();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onresult = async (event) => {
    const result = event.results[event.results.length - 1];
    if (!result || !result.isFinal) return;
    const transcript = Array.from(result, (option) => option.transcript).join(" ").trim();
    if (!transcript) return;
    await processConversationInput(transcript);
  };

  recognition.onerror = () => {
    if (state.earsEnabled && state.mode !== "idle" && !state.restartingRecognition) {
      scheduleRecognitionRestart();
    }
  };

  recognition.onend = () => {
    if (state.earsEnabled && state.mode !== "idle" && !state.restartingRecognition) {
      scheduleRecognitionRestart();
    }
  };

  return recognition;
}

function startRecognition() {
  if (!state.speechInputAvailable || state.mode === "idle") return;

  try {
    stopRecognition();
    state.recognition = createRecognition();
    if (!state.recognition) return;
    state.recognition.start();
  } catch {
    permissionNote.textContent = "Ghost could not start voice listening in this browser. You can still type to talk.";
    state.earsEnabled = false;
  }

  updateEarsButton();
  updateStatus();
  updateComposerState();
}

function stopRecognition() {
  if (!state.recognition) return;
  try {
    state.restartingRecognition = true;
    state.recognition.onend = null;
    state.recognition.onerror = null;
    state.recognition.onresult = null;
    state.recognition.stop();
  } catch {}
  state.recognition = null;
  state.restartingRecognition = false;
}

function scheduleRecognitionRestart() {
  state.restartingRecognition = true;
  window.setTimeout(() => {
    state.restartingRecognition = false;
    if (state.earsEnabled && state.mode !== "idle") {
      startRecognition();
    }
  }, 500);
}

function speakGhost(line) {
  if (!state.voiceEnabled || !window.speechSynthesis || state.mode === "idle") {
    return;
  }

  const now = Date.now();
  if (line === state.lastSpokenLine && now - state.lastSpokenAt < 4500) {
    return;
  }

  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    window.speechSynthesis.cancel();
  }

  const shouldResumeEars = state.earsEnabled;
  if (shouldResumeEars) {
    stopRecognition();
  }

  const utterance = new SpeechSynthesisUtterance(prepareSpeechText(line));
  utterance.rate = 1;
  utterance.pitch = 0.9;
  utterance.volume = 0.92;
  if (state.selectedVoice) {
    utterance.voice = state.selectedVoice;
    if (state.selectedVoice.lang) {
      utterance.lang = state.selectedVoice.lang;
    }
  }
  ghostScreen.classList.remove("listening");
  ghostScreen.classList.add("speaking");
  utterance.onend = () => {
    ghostScreen.classList.remove("speaking");
    ghostScreen.classList.toggle("listening", state.mode !== "idle");
    if (shouldResumeEars && state.mode !== "idle") {
      startRecognition();
    }
  };
  utterance.onerror = () => {
    ghostScreen.classList.remove("speaking");
    ghostScreen.classList.toggle("listening", state.mode !== "idle");
    if (shouldResumeEars && state.mode !== "idle") {
      startRecognition();
    }
  };
  window.speechSynthesis.speak(utterance);
  state.lastSpokenLine = line;
  state.lastSpokenAt = now;
}

function stopGhostSpeech() {
  ghostScreen.classList.remove("speaking");
  ghostScreen.classList.toggle("listening", state.mode !== "idle");
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function resetFaceMotion() {
  ghostScreen.classList.remove("listening");
  ghostScreen.style.setProperty("--ghost-tilt", "0deg");
  ghostScreen.style.setProperty("--ghost-lift", "0px");
  ghostScreen.style.setProperty("--ghost-glow", "1");
  ghostScreen.style.setProperty("--ghost-eye-scale", "1");
  ghostScreen.style.setProperty("--ghost-brow-shift", "0px");
  if (ghostCaption) {
    ghostCaption.classList.remove("visible");
    ghostCaption.textContent = "";
  }
  if (latestGhostLine) {
    latestGhostLine.textContent = "Ghost will answer here.";
  }
  if (state.captionTimer) {
    window.clearTimeout(state.captionTimer);
    state.captionTimer = 0;
  }
}

function scheduleNextInitiative(minDelay = 16000, maxDelay = 28000) {
  const span = Math.max(maxDelay - minDelay, 0);
  state.nextInitiativeAt = Date.now() + minDelay + Math.round(Math.random() * span);
}

function createSessionId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `ghost-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function prepareSpeechText(line) {
  return String(line)
    .replace(/\s+/g, " ")
    .replace(/\s*[:;]\s*/g, ". ")
    .replace(/\s*[-–—]\s*/g, ", ")
    .trim();
}

function pickBestVoice(voices) {
  if (!Array.isArray(voices) || !voices.length) return null;

  const preferredPatterns = [
    /aria/i,
    /jenny/i,
    /guy/i,
    /davis/i,
    /zira/i,
    /samantha/i,
    /google us english/i,
    /natural/i,
  ];

  const englishVoices = voices.filter((voice) => /en/i.test(voice.lang || ""));
  const ordered = englishVoices.length ? englishVoices : voices;

  for (const pattern of preferredPatterns) {
    const match = ordered.find((voice) => pattern.test(voice.name || ""));
    if (match) return match;
  }

  const local = ordered.find((voice) => voice.localService);
  return local || ordered[0] || null;
}

function averageDeviation(values) {
  if (!values.length) return 0;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const deviation =
    values.reduce((total, value) => total + Math.abs(value - mean), 0) / values.length;
  return clamp(deviation * 4.2, 0, 1);
}

function averageRecent(values) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function countBalanceSwings(values) {
  let swings = 0;
  let previousDirection = 0;

  for (const value of values) {
    const direction = Math.abs(value) < 0.06 ? 0 : value > 0 ? 1 : -1;
    if (!direction) continue;
    if (previousDirection && direction !== previousDirection) {
      swings += 1;
    }
    previousDirection = direction;
  }

  return swings;
}

function countDirectionalSwings(values) {
  let swings = 0;
  let previousDirection = 0;

  for (const direction of values) {
    if (!direction) continue;
    if (previousDirection && direction !== previousDirection) {
      swings += 1;
    }
    previousDirection = direction;
  }

  return swings;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
