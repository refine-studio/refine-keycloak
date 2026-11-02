/*
 * Light, dark or system mode for the login pages, after refine-ui's ThemeSwitcher.
 *
 * keycloak.v2 sets the dark class on <html> from prefers-color-scheme, in a
 * render-blocking module script that runs after this classic script. A saved
 * choice must win, so a MutationObserver puts the class back each time that
 * script changes it. Observer callbacks run before the next paint, so the
 * page never shows the wrong mode.
 *
 * Icons: lucide sun, moon and monitor (ISC licence).
 */
(function () {
  "use strict";

  var STORAGE_KEY = "refine-login-mode";
  var DARK_CLASS = "pf-v5-theme-dark";
  var root = document.documentElement;
  var systemDark = window.matchMedia("(prefers-color-scheme: dark)");

  var MODES = [
    {
      value: "light",
      label: "Light",
      icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    },
    {
      value: "dark",
      label: "Dark",
      icon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    },
    {
      value: "system",
      label: "System",
      icon: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
    },
  ];

  function readMode() {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      return saved === "light" || saved === "dark" ? saved : "system";
    } catch (error) {
      return "system";
    }
  }

  function saveMode(mode) {
    try {
      if (mode === "system") window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, mode);
    } catch (error) {
      // Storage is blocked. The choice still holds until the next page.
    }
  }

  var mode = readMode();

  function wantsDark() {
    return mode === "dark" || (mode === "system" && systemDark.matches);
  }

  function apply() {
    if (root.classList.contains(DARK_CLASS) !== wantsDark()) {
      root.classList.toggle(DARK_CLASS, wantsDark());
    }
    root.style.colorScheme = wantsDark() ? "dark" : "light";
  }

  apply();
  new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ["class"] });
  systemDark.addEventListener("change", apply);

  function mount() {
    var group = document.createElement("div");
    group.className = "rk-mode";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Colour mode");

    MODES.forEach(function (option) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "rk-mode__item";
      button.title = option.label;
      button.dataset.mode = option.value;
      button.innerHTML =
        '<svg aria-hidden="true" role="presentation" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        option.icon +
        '</svg><span class="pf-v5-screen-reader">' +
        option.label +
        "</span>";
      button.addEventListener("click", function () {
        mode = option.value;
        saveMode(mode);
        apply();
        sync();
      });
      group.appendChild(button);
    });

    function sync() {
      Array.prototype.forEach.call(group.children, function (button) {
        button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
      });
    }

    sync();
    document.body.appendChild(group);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
