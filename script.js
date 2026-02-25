const presets = {
  classical: { label: "Classical", minutes: 90, increment: 30 },
  rapid: { label: "Rapid", minutes: 15, increment: 10 },
  standard: { label: "Standard", minutes: 10, increment: 0 },
  blitz: { label: "Blitz", minutes: 5, increment: 3 },
  bullet: { label: "Bullet", minutes: 1, increment: 1 },
};

const state = {
  baseMinutes: presets.rapid.minutes,
  incrementSeconds: presets.rapid.increment,
  times: [0, 0],
  incrementMs: presets.rapid.increment * 1000,
  activePlayer: null,
  running: false,
  lastTick: null,
  raf: null,
  presetKey: "rapid",
};

const CLICK_POOL_SIZE = 4;
const CLICK_ASSET = "click.mp3";

const appEl = document.querySelector(".app");
const playerButtons = [...document.querySelectorAll(".player")];
const timeEls = [document.getElementById("time-0"), document.getElementById("time-1")];
const incrementEls = [
  document.getElementById("increment-0"),
  document.getElementById("increment-1"),
];
const statusEl = document.getElementById("status");
const startPauseBtn = document.getElementById("startPause");
const resetBtn = document.getElementById("reset");
const swapBtn = document.getElementById("swap");
const presetButtons = [...document.querySelectorAll(".preset")];
const customForm = document.getElementById("custom-form");
const resetModal = document.getElementById("resetModal");
const confirmResetBtn = document.getElementById("confirmReset");
const cancelResetBtn = document.getElementById("cancelReset");
const clickPool = Array.from({ length: CLICK_POOL_SIZE }, () => {
  const audio = new Audio(CLICK_ASSET);
  audio.preload = "auto";
  return audio;
});
let clickPoolIndex = 0;

function init() {
  applyPreset(state.presetKey);
  bindEvents();
  render();
  updateLayoutState();
  window.addEventListener("beforeunload", handleBeforeUnload);
}

function bindEvents() {
  playerButtons.forEach((btn) => {
    btn.addEventListener("pointerdown", () => handlePlayerTapStart(Number(btn.dataset.player)));
    btn.addEventListener("click", () => handlePlayerTap(Number(btn.dataset.player)));
  });

  presetButtons.forEach((btn) => {
    btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
  });

  customForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(customForm);
    const minutes = Number(formData.get("minutes"));
    const increment = Number(formData.get("increment"));
    if (Number.isFinite(minutes) && Number.isFinite(increment)) {
      applyCustom(minutes, increment);
    }
  });

  startPauseBtn.addEventListener("click", toggleStart);
  resetBtn.addEventListener("click", requestReset);
  swapBtn.addEventListener("click", swapPlayers);
  confirmResetBtn.addEventListener("click", confirmReset);
  cancelResetBtn.addEventListener("click", closeResetModal);
  resetModal.addEventListener("click", (event) => {
    if (event.target === resetModal) {
      closeResetModal();
    }
  });
}

function requestReset() {
  openResetModal();
}

function confirmReset() {
  closeResetModal();
  stopClock();
  resetClock();
}

function applyPreset(key) {
  const preset = presets[key];
  if (!preset) return;
  state.presetKey = key;
  state.baseMinutes = preset.minutes;
  state.incrementSeconds = preset.increment;
  state.incrementMs = preset.increment * 1000;
  stopClock();
  resetClock();
  setStatus(`${preset.label} loaded`);
  customForm.minutes.value = preset.minutes;
  customForm.increment.value = preset.increment;
  highlightPreset();
}

function applyCustom(minutes, increment) {
  state.presetKey = "custom";
  state.baseMinutes = Math.max(1, minutes);
  state.incrementSeconds = Math.max(0, increment);
  state.incrementMs = state.incrementSeconds * 1000;
  stopClock();
  resetClock();
  setStatus("Custom control loaded");
  highlightPreset();
}

function resetClock() {
  const base = state.baseMinutes * 60 * 1000;
  state.times = [base, base];
  state.activePlayer = null;
  state.lastTick = null;
  render();
  updateActiveClasses();
  startPauseBtn.textContent = "Start";
  setStatus("Ready");
}

function toggleStart() {
  if (state.running) {
    stopClock();
    setStatus("Paused");
    startPauseBtn.textContent = "Resume";
    return;
  }

  if (state.activePlayer === null) {
    state.activePlayer = 0;
  }
  state.running = true;
  state.lastTick = null;
  startPauseBtn.textContent = "Pause";
  setStatus("Playing");
  updateActiveClasses();
  updateLayoutState();
  scheduleTick();
}

function stopClock() {
  state.running = false;
  updateLayoutState();
  if (state.raf) {
    cancelAnimationFrame(state.raf);
    state.raf = null;
  }
}

function scheduleTick() {
  state.raf = requestAnimationFrame(step);
}

function step(timestamp) {
  if (!state.running) return;
  if (state.lastTick == null) {
    state.lastTick = timestamp;
  }
  const delta = timestamp - state.lastTick;
  state.lastTick = timestamp;

  if (state.activePlayer != null) {
    const player = state.activePlayer;
    state.times[player] = Math.max(0, state.times[player] - delta);
    if (state.times[player] === 0) {
      flagPlayer(player);
      return;
    }
  }

  render();
  scheduleTick();
}

function handlePlayerTap(playerIndex) {
  if (!state.running || state.activePlayer !== playerIndex) return;
  if (state.times[playerIndex] === 0) return;
  state.times[playerIndex] += state.incrementMs;
  state.activePlayer = playerIndex === 0 ? 1 : 0;
  state.lastTick = null;
  updateActiveClasses();
  render();
}

function handlePlayerTapStart(playerIndex) {
  if (!state.running || state.activePlayer !== playerIndex) return;
  playClickSound();
}

function swapPlayers() {
  [state.times[0], state.times[1]] = [state.times[1], state.times[0]];
  if (state.activePlayer != null) {
    state.activePlayer = state.activePlayer === 0 ? 1 : 0;
  }
  updateActiveClasses();
  render();
}

function render() {
  timeEls.forEach((el, idx) => {
    el.textContent = formatTime(state.times[idx]);
  });
  incrementEls.forEach((el) => {
    el.textContent = `+${state.incrementSeconds}s`;
  });
}

function updateActiveClasses() {
  playerButtons.forEach((btn, idx) => {
    const isActive = state.activePlayer === idx && state.running;
    const isInactive = state.running && state.activePlayer !== idx;
    btn.classList.toggle("player--active", isActive);
    btn.classList.toggle("player--flagged", state.times[idx] === 0);
    btn.classList.toggle("player--inactive", isInactive);
  });
}

function updateLayoutState() {
  appEl.classList.toggle("app--playing", state.running);
  document.body.classList.toggle("app-playing", state.running);
}

function openResetModal() {
  if (appEl.classList.contains("app--confirming")) {
    return;
  }
  appEl.classList.add("app--confirming");
  resetModal.setAttribute("aria-hidden", "false");
  cancelResetBtn.focus();
  document.addEventListener("keydown", handleResetModalKey);
}

function closeResetModal() {
  if (!appEl.classList.contains("app--confirming")) {
    return;
  }
  appEl.classList.remove("app--confirming");
  resetModal.setAttribute("aria-hidden", "true");
  document.removeEventListener("keydown", handleResetModalKey);
}

function handleResetModalKey(event) {
  if (event.key === "Escape") {
    closeResetModal();
  }
}

function handleBeforeUnload(event) {
  if (!state.running) {
    return;
  }
  event.preventDefault();
  event.returnValue = "";
}

function highlightPreset() {
  presetButtons.forEach((btn) => {
    btn.classList.toggle("preset--active", btn.dataset.preset === state.presetKey);
  });
}

function setStatus(text) {
  statusEl.textContent = text;
}

function flagPlayer(player) {
  stopClock();
  updateActiveClasses();
  const loser = player === 0 ? "White" : "Black";
  const winner = player === 0 ? "Black" : "White";
  setStatus(`${loser} flagged. ${winner} wins.`);
  startPauseBtn.textContent = "Restart";
}

function formatTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function playClickSound() {
  const audio = clickPool[clickPoolIndex];
  clickPoolIndex = (clickPoolIndex + 1) % clickPool.length;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

init();
