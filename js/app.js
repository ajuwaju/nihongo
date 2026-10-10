// Shared shell: theme, the lock screen, the profile picker, and helpers every page uses.
// Runs entirely in the browser. Requests go only to this site's own files (and to
// server/app.py when it is running on the same origin).
(function () {
  "use strict";

  var root = document.documentElement;
  var App = { page: document.body.getAttribute("data-page") || "", levels: ["N5", "N4", "N3", "N2", "N1"] };
  var readyPromise = null;

  // ---------- tiny dom helpers ----------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function h(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function escape(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  App.el = el; App.h = h; App.escape = escape;

  // ---------- theme ----------
  (function theme() {
    var button = document.getElementById("theme-toggle");
    function read() { try { return localStorage.getItem("theme"); } catch (e) { return null; } }
    function write(v) { try { localStorage.setItem("theme", v); } catch (e) { /* fine */ } }
    function current() { return root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); }
    function apply(t) { root.setAttribute("data-theme", t); if (button) { button.setAttribute("aria-pressed", String(t === "dark")); button.textContent = t === "dark" ? "light" : "dark"; } }
    var saved = read();
    if (saved === "dark" || saved === "light") apply(saved); else if (button) apply(current());
    if (button) button.addEventListener("click", function () { var n = current() === "dark" ? "light" : "dark"; apply(n); write(n); });
  })();

  // ---------- phone menu ----------
  (function menu() {
    var b = document.getElementById("nav-toggle"), m = document.querySelector(".masthead"); if (!b || !m) return;
    b.addEventListener("click", function () { var open = m.classList.toggle("open"); b.setAttribute("aria-expanded", String(open)); b.textContent = open ? "close" : "menu"; });
  })();

  // ---------- masthead clock (local time, nothing sent anywhere) ----------
  (function clock() {
    var node = document.getElementById("sys-time"); if (!node) return;
    function tick() { var d = new Date(); node.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) { return String(n).padStart(2, "0"); }).join(":"); }
    tick(); setInterval(tick, 1000);
    var tz = document.getElementById("sys-tz"); if (tz) { var off = -new Date().getTimezoneOffset() / 60; tz.textContent = "UTC" + (off >= 0 ? "+" : "") + off; }
  })();

  // ---------- nav current page ----------
  document.querySelectorAll(".masthead-nav a").forEach(function (a) {
    var href = a.getAttribute("href").split("#")[0];
    if (href === location.pathname.split("/").pop() || (href === "index.html" && /\/$/.test(location.pathname))) a.setAttribute("aria-current", "page");
  });

  // ---------- furigana ----------
  // Text uses {漢字|かんじ}. furi() renders ruby, plain() keeps the kanji, kana() keeps the reading.
  var FURI = /\{([^{}|]+)\|([^{}]+)\}/g;
  App.furi = function (text, opts) {
    opts = opts || {};
    var out = escape(text).replace(FURI, function (_, k, r) { return "<ruby>" + k + "<rt>" + r + "</rt></ruby>"; });
    if (opts.paras) out = out.split(/\n\s*\n/).map(function (p) { return "<p>" + p.replace(/\n/g, "<br>") + "</p>"; }).join("");
    else if (opts.br) out = out.replace(/\n/g, "<br>");
    return out;
  };
  App.plain = function (text) { return String(text || "").replace(FURI, "$1"); };
  App.kana = function (text) { return String(text || "").replace(FURI, "$2"); };

  // ---------- randomness ----------
  App.shuffle = function (arr) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  App.sample = function (arr, n, exclude) {
    var pool = arr.filter(function (x) { return !exclude || !exclude(x); });
    return App.shuffle(pool).slice(0, n);
  };
  App.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  App.uniq = function (arr) { return arr.filter(function (x, i) { return arr.indexOf(x) === i; }); };

  // ---------- toast ----------
  var toastTimer = null;
  App.toast = function (msg) {
    var old = document.querySelector(".toast"); if (old) old.remove();
    var t = el("div", "toast", msg); document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.remove(); }, 2200);
  };

  // ---------- level tabs ----------
  App.levelTabs = function (container, opts) {
    opts = opts || {};
    container.innerHTML = "";
    var current = opts.current || "N5";
    App.levels.forEach(function (lv) {
      var b = el("button"); b.type = "button"; b.textContent = lv;
      if (opts.counts && opts.counts[lv] !== undefined) b.appendChild(el("small", null, opts.counts[lv] + (opts.unit ? " " + opts.unit : "")));
      b.setAttribute("aria-pressed", String(lv === current));
      b.addEventListener("click", function () {
        container.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        if (Store.progress) { Store.progress.settings.level = lv; Store.save(); }
        opts.onChange(lv);
      });
      container.appendChild(b);
    });
  };
  App.modes = function (container, list, current, onChange) {
    container.innerHTML = "";
    list.forEach(function (m) {
      var b = el("button", null, m.label); b.type = "button"; b.setAttribute("aria-pressed", String(m.id === current));
      b.addEventListener("click", function () {
        container.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true"); onChange(m.id);
      });
      container.appendChild(b);
    });
  };

  // ---------- speech (the computer's own Japanese voice; nothing is sent anywhere) ----------
  var synth = window.speechSynthesis;
  var voiceList = [];
  function refreshVoices() {
    if (!synth) return [];
    voiceList = synth.getVoices().filter(function (v) { return /^ja/i.test(v.lang); });
    // prefer voices that live on this device; some browsers offer cloud voices which would send the text away
    var local = voiceList.filter(function (v) { return v.localService; });
    if (local.length) voiceList = local;
    return voiceList;
  }
  if (synth) { refreshVoices(); synth.onvoiceschanged = refreshVoices; }
  App.voices = function () { return voiceList.length ? voiceList : refreshVoices(); };
  App.speak = function (text, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      if (!synth) return reject(new Error("no speech"));
      var voices = App.voices();
      if (!voices.length) return reject(new Error("no japanese voice"));
      var u = new SpeechSynthesisUtterance(App.plain(text));
      u.lang = "ja-JP";
      var want = opts.voice && voices.filter(function (v) { return v.name === opts.voice; })[0];
      u.voice = want || voices[opts.alt && voices.length > 1 ? 1 : 0];
      u.rate = opts.rate || 0.9;
      u.pitch = opts.pitch || 1;
      u.onend = function () { resolve(); };
      u.onerror = function (e) { if (e.error === "interrupted" || e.error === "canceled") resolve(); else reject(new Error(e.error)); };
      synth.speak(u);
    });
  };
  App.stopSpeaking = function () { if (synth) synth.cancel(); };
  window.addEventListener("pagehide", App.stopSpeaking);

  // a small round "hear it" button
  App.speakButton = function (text, opts) {
    var b = el("button", "play-sm", "♪"); b.type = "button"; b.title = "hear it"; b.setAttribute("aria-label", "hear it");
    b.addEventListener("click", function (e) { e.stopPropagation(); e.preventDefault(); App.say(text, opts); });
    return b;
  };
  App.say = function (text, opts) {
    var s = Store.progress ? Store.progress.settings : {};
    return App.speak(text, Object.assign({ rate: s.rate || 0.9, voice: s.voice }, opts || {})).catch(function () { App.toast("no japanese voice on this device"); });
  };
  // site-wide furigana switch (the button sits in the menu; pages read body.no-furigana)
  App.applyFurigana = function () {
    var on = !Store.progress || Store.progress.settings.furigana !== false;
    document.body.classList.toggle("no-furigana", !on);
    var b = document.getElementById("furi-toggle"); if (b) { b.textContent = on ? "ふりがな on" : "ふりがな off"; b.setAttribute("aria-pressed", String(on)); }
  };
  (function furiButton() {
    var b = document.getElementById("furi-toggle"); if (!b) return;
    b.addEventListener("click", function () {
      if (!Store.progress) return;
      Store.progress.settings.furigana = Store.progress.settings.furigana === false; Store.save(); App.applyFurigana();
      document.querySelectorAll(".jp-body").forEach(function (n) { n.classList.toggle("no-furigana", Store.progress.settings.furigana === false); });
    });
  })();

  // ---------- notes from anywhere ----------
  App.noteButton = function (link, label) {
    var b = el("button", "btn small quiet", label || "add a note"); b.type = "button";
    b.addEventListener("click", function () {
      var n = Store.addNote({ title: link.label || "", tags: link.tags || [], link: { kind: link.kind, id: link.id, label: link.label, href: link.href } });
      location.href = "notes.html#" + n.id;
    });
    return b;
  };

  // ---------- dates ----------
  App.fmtDate = function (t) { var d = new Date(t); return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); };
  App.fmtDue = function (d) {
    var diff = d - Date.now();
    if (diff <= 0) return "due now";
    if (diff < 3600000) return "in " + Math.max(1, Math.round(diff / 60000)) + " min";
    if (diff < 86400000) return "in " + Math.round(diff / 3600000) + " h";
    return "in " + Math.round(diff / 86400000) + " d";
  };
  App.pct = function (a, b) { return b ? Math.round(100 * a / b) : 0; };

  // ---------- the gate: password, then profile ----------
  function gateCard(inner) {
    var g = document.getElementById("gate");
    if (!g) { g = el("div", "gate"); g.id = "gate"; g.setAttribute("role", "dialog"); g.setAttribute("aria-modal", "true"); document.body.appendChild(g); }
    g.innerHTML = "";
    var card = el("div", "gate-card");
    card.appendChild(h('<p class="type small">a private study room</p>'));
    card.appendChild(h('<h1 class="signature">nihongo</h1>'));
    card.appendChild(h('<p class="jp-sub">日本語の部屋</p>'));
    card.appendChild(inner);
    g.appendChild(card);
    document.body.classList.add("reader-open");
    return card;
  }
  function closeGate() { var g = document.getElementById("gate"); if (g) g.remove(); document.body.classList.remove("reader-open"); }

  function askPassword() {
    return new Promise(function (resolve) {
      var form = h('<form novalidate><p class="type">type the password you were given to open the study files.</p>' +
        '<div class="field"><label for="gate-pw">password</label><input id="gate-pw" type="password" autocomplete="current-password" required></div>' +
        '<label class="check"><input type="checkbox" id="gate-remember" checked> keep this device unlocked</label>' +
        '<p class="error" aria-live="polite"></p>' +
        '<div class="btn-row"><button class="btn primary" type="submit">open</button></div></form>');
      gateCard(form);
      var input = form.querySelector("#gate-pw"), err = form.querySelector(".error"), btn = form.querySelector("button");
      setTimeout(function () { input.focus(); }, 50);
      form.addEventListener("submit", function (e) {
        e.preventDefault(); err.textContent = ""; btn.disabled = true; btn.textContent = "checking";
        Vault.unlock(input.value, form.querySelector("#gate-remember").checked).then(function () { resolve(); })
          .catch(function (ex) { err.textContent = /wrong/.test(ex.message) ? "that is not it. try again." : ex.message; btn.disabled = false; btn.textContent = "open"; input.select(); });
      });
    });
  }

  function askProfile() {
    if (Store.mode === "server") return askAccount();
    return new Promise(function (resolve) {
      function render() {
        var wrap = el("div");
        wrap.appendChild(h('<p class="type">who is studying? progress is saved to this browser under your name. a four-digit pin is optional and only keeps others in this house out.</p>'));
        var grid = el("div", "profiles");
        Store.listProfiles().forEach(function (p) {
          var card = el("button", "profile"); card.type = "button";
          card.appendChild(el("span", "face jp", p.name.slice(0, 1)));
          card.appendChild(el("span", "name", p.name));
          card.appendChild(el("span", "meta", p.pin ? "pin" : "open"));
          card.addEventListener("click", function () {
            if (!p.pin) { Store.openProfile(p.id).then(function () { Store.rememberOpened(p.id, true); resolve(); }); return; }
            var f = h('<form novalidate><p class="type">pin for <b>' + escape(p.name) + '</b></p><div class="field"><label for="pin">pin</label><input id="pin" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></div><label class="check"><input type="checkbox" id="pin-stay" checked> stay signed in on this device</label><p class="error"></p><div class="btn-row"><button class="btn primary" type="submit">open</button><button class="btn quiet" type="button" data-back>back</button></div></form>');
            gateCard(f); setTimeout(function () { f.querySelector("#pin").focus(); }, 50);
            f.querySelector("[data-back]").addEventListener("click", render);
            f.addEventListener("submit", function (e) {
              e.preventDefault();
              Store.openProfile(p.id, f.querySelector("#pin").value).then(function () { Store.rememberOpened(p.id, f.querySelector("#pin-stay").checked); resolve(); }).catch(function (ex) { f.querySelector(".error").textContent = ex.message; });
            });
          });
          grid.appendChild(card);
        });
        var add = el("button", "profile new"); add.type = "button";
        add.appendChild(el("span", "face", "+")); add.appendChild(el("span", "name", "new")); add.appendChild(el("span", "meta", "start fresh"));
        add.addEventListener("click", function () {
          var f = h('<form novalidate><div class="field"><label for="pname">your name</label><input id="pname" maxlength="24" autocomplete="nickname" required></div>' +
            '<div class="field"><label for="ppin">pin (optional, 4 digits)</label><input id="ppin" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></div>' +
            '<p class="error"></p><div class="btn-row"><button class="btn primary" type="submit">make it</button><button class="btn quiet" type="button" data-back>back</button></div></form>');
          gateCard(f); setTimeout(function () { f.querySelector("#pname").focus(); }, 50);
          f.querySelector("[data-back]").addEventListener("click", render);
          f.addEventListener("submit", function (e) {
            e.preventDefault();
            Store.createProfile(f.querySelector("#pname").value, f.querySelector("#ppin").value).then(function () { Store.rememberOpened(Store.current.id, true); resolve(); }).catch(function (ex) { f.querySelector(".error").textContent = ex.message; });
          });
        });
        grid.appendChild(add);
        wrap.appendChild(grid);
        var imp = h('<p class="type small">moving from another device? <label class="pointer pinklink">import a backup file<input type="file" accept="application/json" class="sr"></label></p>');
        imp.querySelector("input").addEventListener("change", function (ev) {
          var file = ev.target.files[0]; if (!file) return;
          file.text().then(function (txt) {
            var obj = JSON.parse(txt);
            return Store.createProfile(obj.name || "imported", "").then(function () { Store.importJSON(obj); resolve(); });
          }).catch(function (ex) { App.toast(ex.message); });
        });
        wrap.appendChild(imp);
        var card = gateCard(wrap);
        var lockBtn = h('<p class="gate-note type small"><button type="button" class="btn small quiet">lock the room</button></p>');
        lockBtn.querySelector("button").addEventListener("click", function () { Vault.lock(); location.reload(); });
        card.appendChild(lockBtn);
      }
      render();
    });
  }

  function askAccount() {
    return new Promise(function (resolve) {
      function render(mode) {
        var create = mode === "create";
        var f = h('<form novalidate><p class="type">' + (create ? "make an account. it is saved on the study server, so you can sign in from any device." : "sign in to your account.") + '</p>' +
          '<div class="field"><label for="aname">name</label><input id="aname" maxlength="31" autocomplete="username" required></div>' +
          '<div class="field"><label for="apw">password</label><input id="apw" type="password" autocomplete="' + (create ? "new-password" : "current-password") + '" required></div>' +
          '<p class="error"></p><div class="btn-row"><button class="btn primary" type="submit">' + (create ? "create" : "sign in") + '</button>' +
          '<button class="btn quiet" type="button" data-switch>' + (create ? "i have one" : "new account") + '</button></div></form>');
        gateCard(f); setTimeout(function () { f.querySelector("#aname").focus(); }, 50);
        f.querySelector("[data-switch]").addEventListener("click", function () { render(create ? "login" : "create"); });
        f.addEventListener("submit", function (e) {
          e.preventDefault();
          var name = f.querySelector("#aname").value, pw = f.querySelector("#apw").value;
          (create ? Store.register(name, pw) : Store.login(name, pw)).then(function () { resolve(); }).catch(function (ex) { f.querySelector(".error").textContent = ex.message; });
        });
      }
      render("login");
    });
  }

  function userChip() {
    var nav = document.querySelector(".masthead-nav");
    if (!nav || !Store.current) return;
    var old = nav.querySelector(".who"); if (old) { old.previousSibling && old.previousSibling.remove(); old.remove(); }
    nav.appendChild(h('<span aria-hidden="true">/</span>'));
    var b = el("button", "who", Store.current.name + " · sign out"); b.type = "button"; b.title = "sign out of this profile (the room stays unlocked on this device)";
    b.addEventListener("click", function () { Store.signOut().then(function () { location.href = "index.html"; }); });
    nav.appendChild(b);
  }

  App.ready = function () {
    if (readyPromise) return readyPromise;
    readyPromise = Vault.hasKey().then(function (ok) { return ok ? null : askPassword(); })
      .then(function () { return Store.init(); })
      .then(function () { return Store.restore(); })
      .then(function (restored) { return restored ? null : askProfile(); })
      .then(function () { closeGate(); userChip(); App.applyFurigana(); return true; })
      .catch(function (e) {
        gateCard(h('<p class="error">' + escape(e.message) + '</p><p class="type small">if you just set this up, run <code>python3 scripts/build.py</code> and reload.</p>'));
        throw e;
      });
    return readyPromise;
  };

  // when a data file will not open (key cleared in another tab), fall back to the password screen
  App.data = function (name) {
    return Vault.load(name).catch(function (e) {
      if (e.message === "locked" || /wrong password/.test(e.message)) { Vault.lock(); readyPromise = null; return askPassword().then(function () { closeGate(); return Vault.load(name); }); }
      throw e;
    });
  };

  window.App = App;
})();
