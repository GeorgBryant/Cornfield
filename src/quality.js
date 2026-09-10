// quality.js
//
// Single source of truth for every quality-related value in the scene.
// To add a new quality-controlled feature later (shadow quality, fog
// distance, post-processing, render distance, etc.), just add a new key
// to each preset in QualitySettings below — no other file needs to change.

export const QUALITY_LEVELS = {
  AUTOMATIC: "Automatic",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

// All concrete, per-level values live here.
export const QualitySettings = {
  [QUALITY_LEVELS.LOW]: {
    label: "Low",
    cornCount: 10000,
    dpr: 1,
  },
  [QUALITY_LEVELS.MEDIUM]: {
    label: "Medium",
    cornCount: 30000,
    dpr: 1.25,
  },
  [QUALITY_LEVELS.HIGH]: {
    label: "High",
    cornCount: 100000,
    dpr: 1.5,
  },
};

// Lightweight heuristic, NOT a benchmark. Goal: don't drop a weak laptop
// or phone straight into 60,000 corn plants. Combines a few cheap signals:
//
// - navigator.hardwareConcurrency: logical CPU cores (widely supported)
// - navigator.deviceMemory: approximate RAM in GB (Chrome/Edge only,
//   undefined elsewhere — we fall back to a neutral default)
// - devicePixelRatio: high-DPI screens cost more to render per pixel,
//   so a retina laptop is nudged down slightly relative to a plain 1x screen
// - a simple mobile check, since phones/tablets are usually weaker GPUs
//   than their core/memory numbers alone would suggest
function detectHardwareTier() {
  if (typeof navigator === "undefined") {
    // Non-browser environment (SSR, tests, etc.) — safe middle default.
    return QUALITY_LEVELS.MEDIUM;
  }

  const cores = navigator.hardwareConcurrency || 4;
  const memoryGB = navigator.deviceMemory || 4;
  const pixelRatio =
    typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  const isMobile =
    typeof navigator.userAgentData?.mobile === "boolean"
      ? navigator.userAgentData.mobile
      : /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");

  let score = 0;
  score += cores >= 8 ? 2 : cores >= 4 ? 1 : 0;
  score += memoryGB >= 8 ? 2 : memoryGB >= 4 ? 1 : 0;
  score += pixelRatio >= 2 ? -1 : 0;
  score += isMobile ? -2 : 0;

  if (score <= 0) return QUALITY_LEVELS.LOW;
  if (score <= 2) return QUALITY_LEVELS.MEDIUM;
  return QUALITY_LEVELS.HIGH;
}

// Resolves "automatic" down to a concrete level via detectHardwareTier(),
// or passes an explicit level straight through. Always returns both the
// resolved level name (useful for UI/debugging) and its settings object.
export function resolveQuality(level) {
  const resolvedLevel =
    level === QUALITY_LEVELS.AUTOMATIC ? detectHardwareTier() : level;

  return {
    level: resolvedLevel,
    settings: QualitySettings[resolvedLevel],
  };
}
