// Accounts and progress.
// Two ways to keep them, chosen automatically:
//   local   the site is on a static host (GitHub Pages). Profiles and progress live in
//           this browser's localStorage. Export/import moves them between devices.
//   server  server/app.py is running. Accounts have a name + password and progress is
//           saved on that computer, so the same account works from any device.
// Either way nothing is sent to a third party.
(function () {
  "use strict";

  var P_KEY = "nihongo.profiles", CUR_KEY = "nihongo.current", PROG = "nihongo.progress.";
  var DAY = 86400000;

  var Store = {
    mode: "local",
    current: null,
    progress: null,
    _timer: null,
    _dirty: false
  };

  // ---------- small helpers ----------
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* fine */ } }
  function rid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function dateKey(t) {
    var d = t ? new Date(t) : new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function sha(text) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    });
  }
  function api(path, method, body) {
    return fetch("api/" + path, {
      method: method || "GET", credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); });
  }

  function blank() {
    return {
      version: 1, created: Date.now(), updated: Date.now(),
      settings: { furigana: true, newPerDay: 15, rate: 0.9, voice: "", level: "N5", showEnglish: false, sayCards: true, sayAnswers: true, autoPace: true },
      streak: { days: 0, last: "", best: 0, log: {} },
      srs: { kanji: {}, vocab: {} },
      grammar: { studied: {}, quizzed: {} },
      articles: { read: {}, scores: {} },
      reading: { scores: {} },
      listening: { scores: {} },
      quizzes: [],
      notes: [], noteSeq: 0,
      mnemonics: {},
      misses: { kanji: {}, vocab: {}, grammar: {} }, hist: {}, pace: { log: {} }, dailyPlan: null
    };
  }
  function upgrade(p) {
    var b = blank();
    Object.keys(b).forEach(function (k) { if (p[k] === undefined) p[k] = b[k]; });
    Object.keys(b.settings).forEach(function (k) { if (p.settings[k] === undefined) p.settings[k] = b.settings[k]; });
    if (!p.srs.kanji) p.srs.kanji = {}; if (!p.srs.vocab) p.srs.vocab = {};
    return p;
  }

  // ---------- init + restore ----------
  Store.init = function () {
    if (!/^https?:$/.test(location.protocol)) { Store.mode = "local"; return Promise.resolve("local"); }
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 1500);
    return fetch("api/ping", { cache: "no-store", signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { Store.mode = (j && j.mode === "server") ? "server" : "local"; })
      .catch(function () { Store.mode = "local"; })
      .then(function () { clearTimeout(t); return Store.mode; });
  };

  Store.restore = function () {
    if (Store.mode === "server") {
      return api("me").then(function (j) {
        if (!j.user) return false;
        return loadServer(j.user);
      }).catch(function () { return false; });
    }
    var id = lsGet(CUR_KEY);
    if (!id) return Promise.resolve(false);
    var prof = (lsGet(P_KEY) || []).filter(function (p) { return p.id === id; })[0];
    if (!prof) return Promise.resolve(false);
    if (prof.pin && !opened(prof.id)) return Promise.resolve(false); // pinned profiles ask once per device (or per tab)
    return Promise.resolve(loadLocal(prof));
  };

  var OPEN_KEY = "nihongo.opened";
  function opened(id) { try { return sessionStorage.getItem(OPEN_KEY) === id || localStorage.getItem(OPEN_KEY) === id; } catch (e) { return false; } }
  Store.rememberOpened = function (id, onDevice) {
    try { sessionStorage.setItem(OPEN_KEY, id); if (onDevice) localStorage.setItem(OPEN_KEY, id); } catch (e) { /* fine */ }
  };
  function loadLocal(prof) {
    Store.current = { id: prof.id, name: prof.name };
    Store.progress = upgrade(lsGet(PROG + prof.id) || blank());
    lsSet(CUR_KEY, prof.id);
    return true;
  }
  function loadServer(user) {
    Store.current = { id: "server:" + user.name, name: user.name };
    return api("progress").then(function (j) {
      var remote = j.progress && j.progress.version ? j.progress : null;
      var mirror = lsGet(PROG + Store.current.id);
      var use = remote;
      if (mirror && (!remote || (mirror.updated || 0) > (remote.updated || 0))) use = mirror;
      Store.progress = upgrade(use || blank());
      if (use === mirror && mirror) { Store._dirty = true; Store.save(true); }
      return true;
    });
  }

  // ---------- local profiles ----------
  Store.listProfiles = function () { return lsGet(P_KEY) || []; };
  Store.createProfile = function (name, pin) {
    name = (name || "").trim();
    if (!name) return Promise.reject(new Error("give the profile a name"));
    var list = Store.listProfiles();
    if (list.some(function (p) { return p.name.toLowerCase() === name.toLowerCase(); })) return Promise.reject(new Error("that name is already here"));
    var prof = { id: rid(), name: name, created: Date.now(), pin: "" };
    var done = function () {
      list.push(prof);
      if (!lsSet(P_KEY, list)) return Promise.reject(new Error("this browser is blocking storage, so progress cannot be saved"));
      loadLocal(prof);
      Store.save(true);
      return prof;
    };
    if (pin) return sha(prof.id + ":" + pin).then(function (h) { prof.pin = h; return done(); });
    return Promise.resolve().then(done);
  };
  Store.openProfile = function (id, pin) {
    var prof = Store.listProfiles().filter(function (p) { return p.id === id; })[0];
    if (!prof) return Promise.reject(new Error("profile not found"));
    if (!prof.pin) return Promise.resolve(loadLocal(prof));
    return sha(prof.id + ":" + (pin || "")).then(function (h) {
      if (h !== prof.pin) throw new Error("wrong pin");
      return loadLocal(prof);
    });
  };
  Store.deleteProfile = function (id) {
    lsSet(P_KEY, Store.listProfiles().filter(function (p) { return p.id !== id; }));
    lsDel(PROG + id);
    if (Store.current && Store.current.id === id) { Store.current = null; Store.progress = null; lsDel(CUR_KEY); }
  };

  // ---------- server accounts ----------
  Store.register = function (name, password) { return api("register", "POST", { name: name, password: password }).then(function (j) { return loadServer(j.user); }); };
  Store.login = function (name, password) { return api("login", "POST", { name: name, password: password }).then(function (j) { return loadServer(j.user); }); };

  Store.signOut = function () {
    Store.save(true);
    var p = Store.mode === "server" ? api("logout", "POST", {}).catch(function () {}) : Promise.resolve();
    Store.current = null; Store.progress = null; lsDel(CUR_KEY); lsDel(OPEN_KEY);
    try { sessionStorage.removeItem(OPEN_KEY); } catch (e) { /* fine */ }
    return p;
  };

  // ---------- saving ----------
  Store.save = function (now) {
    if (!Store.current || !Store.progress) return;
    Store._dirty = true;
    Store.progress.updated = Date.now();
    lsSet(PROG + Store.current.id, Store.progress);
    if (Store.mode !== "server") { Store._dirty = false; return; }
    clearTimeout(Store._timer);
    var push = function () {
      if (!Store._dirty || !Store.current) return;
      var snapshot = Store.progress;
      api("progress", "PUT", { progress: snapshot }).then(function () { Store._dirty = false; }).catch(function () { /* mirror stays in localStorage; retried on next save */ });
    };
    if (now) push(); else Store._timer = setTimeout(push, 1200);
  };
  window.addEventListener("pagehide", function () {
    if (!(Store._dirty && Store.mode === "server" && Store.current)) return;
    try {
      fetch("api/progress", { method: "PUT", credentials: "same-origin", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ progress: Store.progress }) });
    } catch (e) { /* the localStorage mirror still has it */ }
  });

  Store.exportJSON = function () {
    return JSON.stringify({ app: "nihongo", exported: new Date().toISOString(), name: Store.current ? Store.current.name : "", progress: Store.progress }, null, 1);
  };
  Store.importJSON = function (obj) {
    if (!obj || obj.app !== "nihongo" || !obj.progress) throw new Error("that file is not a nihongo backup");
    Store.progress = upgrade(obj.progress);
    Store.save(true);
  };

  // ---------- streak ----------
  Store.touchStreak = function (amount) {
    var s = Store.progress.streak, today = dateKey(), yest = dateKey(Date.now() - DAY);
    if (s.last !== today) {
      s.days = (s.last === yest) ? s.days + 1 : 1;
      s.last = today;
      if (s.days > s.best) s.best = s.days;
    }
    s.log[today] = (s.log[today] || 0) + (amount || 1);
    var keys = Object.keys(s.log).sort();
    while (keys.length > 400) delete s.log[keys.shift()];
  };

  // ---------- spaced repetition (SM-2, simplified) ----------
  Store.card = function (deck, id) { return Store.progress.srs[deck][id] || null; };
  Store.state = function (card) {
    if (!card || !card.r) return "new";
    if (card.i < 1) return "learning";
    if (card.i < 21) return "review";
    return "known";
  };
  Store.grade = function (deck, id, g) {
    var srs = Store.progress.srs[deck];
    var c = srs[id] || { e: 2.5, i: 0, d: 0, r: 0, l: 0, s: 0 };
    var now = Date.now(), min = 60000;
    if (c.i < 1) {
      if (g === 0) { c.s = 0; c.d = now + min; }
      else if (g === 1) { c.d = now + 10 * min; }
      else if (g === 2) { if (c.s < 1) { c.s = 1; c.d = now + 10 * min; } else { c.i = 1; c.d = now + DAY; } }
      else { c.i = 4; c.d = now + 4 * DAY; }
    } else {
      if (g === 0) { c.l++; c.i = 0; c.s = 0; c.e = Math.max(1.3, c.e - 0.2); c.d = now + 10 * min; }
      else if (g === 1) { c.i = Math.max(1, Math.round(c.i * 1.2)); c.e = Math.max(1.3, c.e - 0.15); c.d = now + c.i * DAY; }
      else if (g === 2) { c.i = Math.max(1, Math.round(c.i * c.e)); c.d = now + c.i * DAY; }
      else { c.i = Math.max(2, Math.round(c.i * c.e * 1.3)); c.e += 0.15; c.d = now + c.i * DAY; }
    }
    c.r++; c.q = g; c.t = now;
    srs[id] = c;
    Store.touchStreak();
    Store.save();
    return c;
  };
  Store.dueList = function (deck, ids) {
    var srs = Store.progress.srs[deck], now = Date.now();
    return ids.filter(function (id) { var c = srs[id]; return c && c.r && c.d <= now; });
  };
  Store.newList = function (deck, ids, limit) {
    var srs = Store.progress.srs[deck];
    return ids.filter(function (id) { return !srs[id] || !srs[id].r; }).slice(0, limit);
  };
  Store.deckStats = function (deck, ids) {
    var srs = Store.progress.srs[deck], now = Date.now(), out = { total: ids.length, seen: 0, known: 0, due: 0, learning: 0 };
    ids.forEach(function (id) {
      var c = srs[id]; if (!c || !c.r) return;
      out.seen++; if (c.i >= 21) out.known++; if (c.i < 1) out.learning++; if (c.d <= now) out.due++;
    });
    return out;
  };

  // ---------- notes + logs ----------
  Store.addNote = function (n) {
    var p = Store.progress;
    p.noteSeq = (p.noteSeq || 0) + 1;
    var note = { id: rid(), num: p.noteSeq, title: n.title || "", body: n.body || "", tags: n.tags || [], link: n.link || null, created: Date.now(), updated: Date.now() };
    p.notes.push(note);
    Store.save();
    return note;
  };
  Store.updateNote = function (id, patch) {
    var note = Store.progress.notes.filter(function (n) { return n.id === id; })[0];
    if (!note) return null;
    Object.keys(patch).forEach(function (k) { note[k] = patch[k]; });
    note.updated = Date.now();
    Store.save();
    return note;
  };
  Store.deleteNote = function (id) {
    Store.progress.notes = Store.progress.notes.filter(function (n) { return n.id !== id; });
    Store.save();
  };
  Store.logQuiz = function (entry) {
    entry.t = Date.now();
    Store.progress.quizzes.unshift(entry);
    if (Store.progress.quizzes.length > 300) Store.progress.quizzes.length = 300;
    Store.touchStreak(entry.total || 1);
    Store.save();
  };
  Store.dateKey = dateKey;

  window.Store = Store;
})();
