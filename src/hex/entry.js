import { HexScene } from "./hex.js";

/*
 * Mounts the refine.studio hexagon background behind the Keycloak login card.
 *
 * keycloak.v2 loads theme scripts as classic <script> tags in <head>, so this
 * file is bundled as an IIFE and waits for the DOM.
 *
 * Fallbacks, as on the website:
 * - no WebGL: nothing is mounted, and refine.css shows the still image
 * - prefers-reduced-motion: one still frame, no loop
 */

const DARK_CLASS = "pf-v5-theme-dark";

function webglAvailable() {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
  } catch {
    return false;
  }
}

function mount() {
  if (!webglAvailable()) return;

  const canvas = document.createElement("canvas");
  canvas.className = "rk-hex";
  canvas.setAttribute("aria-hidden", "true");
  canvas.setAttribute("role", "presentation");
  document.body.prepend(canvas);

  let scene;
  try {
    scene = new HexScene(canvas);
  } catch (error) {
    canvas.remove();
    console.warn("refine theme: the hexagon background could not start.", error);
    return;
  }

  const root = document.documentElement;
  root.classList.add("rk-has-hex");
  const applyTheme = () => scene.setTheme(root.classList.contains(DARK_CLASS) ? "dark" : "light");
  applyTheme();

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0;
  let last = 0;

  const still = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    scene.render(0);
  };

  const loop = (now) => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    if (!document.hidden) scene.render(dt);
    frame = requestAnimationFrame(loop);
  };

  const start = () => {
    if (reduceMotion.matches) {
      still();
    } else if (!frame) {
      last = 0;
      frame = requestAnimationFrame(loop);
    }
  };

  // The template sets the dark class after this script runs, and again on OS changes.
  new MutationObserver(() => {
    applyTheme();
    if (reduceMotion.matches) still();
  }).observe(root, { attributes: true, attributeFilter: ["class"] });

  window.addEventListener("resize", () => {
    scene.resize();
    if (reduceMotion.matches) still();
  });
  reduceMotion.addEventListener("change", start);

  start();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
