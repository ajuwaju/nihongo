// Kanji: browse, flashcards, the writing pad, and a quick quiz.
(function () {
  "use strict";
  var el = App.el, h = App.h, esc = App.escape;
  var data, all, level, mode = "browse", view = document.getElementById("view"), search = document.getElementById("search");

  App.ready().then(function () { return Promise.all([App.data("kanji"), App.data("vocab")]); }).then(function (res) {
    data = { kanji: res[0], vocab: res[1] };
    all = []; App.levels.forEach(function (l) { data.kanji[l].forEach(function (k) { k.level = l; all.push(k); }); });
    level = Store.progress.settings.level || "N5";
    var counts = {}; App.levels.forEach(function (l) { counts[l] = data.kanji[l].length; });
    App.levelTabs(document.getElementById("levels"), { current: level, counts: counts, onChange: function (lv) { level = lv; render(); } });
    App.modes(document.getElementById("modes"), [{ id: "browse", label: "browse" }, { id: "flash", label: "flashcards" }, { id: "write", label: "writing pad" }, { id: "quiz", label: "quick quiz" }],
      mode, function (m) { mode = m; render(); });
    search.addEventListener("input", function () { if (mode !== "browse") { mode = "browse"; setMode("browse"); } render(); });
    var hash = location.hash.slice(1);
    if (hash === "flash" || hash === "write" || hash === "quiz") { mode = hash; setMode(hash); }
    else if (hash) { var k = all.filter(function (x) { return x.k === decodeURIComponent(hash); })[0]; if (k) { level = k.level; setLevel(level); render(); openDetail(k); return; } }
    render();
  }).catch(function (e) { view.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; });

  function setMode(m) { document.querySelectorAll("#modes button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.textContent === { browse: "browse", flash: "flashcards", write: "writing pad", quiz: "quick quiz" }[m])); }); }
  function setLevel(lv) { document.querySelectorAll("#levels button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.firstChild.textContent === lv)); }); }
  function ids(lv) { return data.kanji[lv].map(function (k) { return k.k; }); }
  function byChar(c) { return all.filter(function (k) { return k.k === c; })[0]; }

  function render() {
    App.stopSpeaking();
    if (mode === "browse") browse();
    else if (mode === "flash") flash();
    else if (mode === "write") writingPad();
    else quiz();
  }

  // ---------- browse ----------
  function browse() {
    view.innerHTML = "";
    var q = search.value.trim().toLowerCase();
    var list = q ? all.filter(function (k) { return k.k === q || k.m.toLowerCase().indexOf(q) !== -1 || k.on.concat(k.kun).some(function (r) { return r.indexOf(q) !== -1; }) || k.w.some(function (w) { return w[0].indexOf(q) !== -1 || w[2].toLowerCase().indexOf(q) !== -1; }); }) : data.kanji[level];
    var stats = Store.deckStats("kanji", ids(level));
    var legend = h('<div class="legend"><span><i class="amber"></i>learning</span><span><i class="pink"></i>in review</span><span><i class="green"></i>solid</span><span>' + stats.seen + ' of ' + stats.total + ' met · ' + stats.due + ' due</span></div>');
    view.appendChild(el("div", "sheet-h", q ? list.length + " matches across all levels" : level + " · " + list.length + " characters"));
    view.appendChild(legend);
    var detail = el("div"); detail.id = "detail"; view.appendChild(detail);
    var grid = el("div", "kgrid"); var now = Date.now();
    list.forEach(function (k) {
      var c = Store.card("kanji", k.k);
      var cell = el("button", "kcell"); cell.type = "button"; cell.setAttribute("data-state", Store.state(c)); if (c && c.r && c.d <= now) cell.setAttribute("data-due", "1");
      cell.appendChild(el("span", "g", k.k)); cell.appendChild(el("span", "m", k.m.split(",")[0]));
      cell.addEventListener("click", function () { openDetail(k); });
      grid.appendChild(cell);
    });
    view.appendChild(grid);
  }

  function openDetail(k) {
    var detail = document.getElementById("detail"); if (!detail) { mode = "browse"; setMode("browse"); browse(); detail = document.getElementById("detail"); }
    history.replaceState(null, "", "#" + encodeURIComponent(k.k));
    detail.innerHTML = "";
    var sheet = el("div", "sheet wide tilt-l");
    var d = el("div", "detail");
    var g = el("div", "glyph"); g.appendChild(el("span", null, k.k)); d.appendChild(g);
    var right = el("div");
    right.appendChild(el("div", "sheet-h", k.level + " · " + (k.s ? k.s + " strokes" : "")));
    right.appendChild(h('<p class="display display-md">' + esc(k.m) + '</p>'));
    var dl = el("dl", "readings");
    dl.appendChild(el("dt", null, "on")); dl.appendChild(el("dd", null, k.on.join("、") || "none"));
    dl.appendChild(el("dt", null, "kun")); dl.appendChild(el("dd", null, k.kun.join("、") || "none"));
    right.appendChild(dl);
    var ul = el("ul", "words");
    k.w.forEach(function (w) {
      var li = el("li"); var a = el("span"); a.appendChild(el("span", "w", w[0])); a.appendChild(el("span", "r", w[1])); li.appendChild(a); li.appendChild(el("span", "e", w[2]));
      var sp = el("button", "play-sm", "♪"); sp.type = "button"; sp.title = "hear it";
      sp.addEventListener("click", function () { App.speak(w[0], { rate: Store.progress.settings.rate }).catch(function () { App.toast("no japanese voice on this device"); }); });
      li.appendChild(sp); ul.appendChild(li);
    });
    right.appendChild(ul);
    var c = Store.card("kanji", k.k);
    right.appendChild(el("p", "srs-line", c && c.r ? Store.state(c) + " · seen " + c.r + "× · next " + App.fmtDue(c.d) + (c.l ? " · forgotten " + c.l + "×" : "") : "not started"));
    var mn = h('<div class="field mt12"><label>your mnemonic</label><textarea rows="2" placeholder="a story to remember it by"></textarea></div>');
    var ta = mn.querySelector("textarea"); ta.value = Store.progress.mnemonics[k.k] || "";
    ta.addEventListener("change", function () { Store.progress.mnemonics[k.k] = ta.value.trim(); Store.save(); App.toast("saved"); });
    right.appendChild(mn);
    var row = el("div", "btn-row");
    var learn = el("button", "btn primary small", c && c.r ? "review this one" : "start learning it"); learn.type = "button";
    learn.addEventListener("click", function () { mode = "flash"; setMode("flash"); flash([k]); });
    row.appendChild(learn);
    var wr = el("button", "btn small", "write it"); wr.type = "button"; wr.addEventListener("click", function () { mode = "write"; setMode("write"); writingPad(k); }); row.appendChild(wr);
    row.appendChild(App.noteButton({ kind: "kanji", id: k.k, label: k.k + " " + k.m, href: "kanji.html#" + encodeURIComponent(k.k), tags: ["kanji", k.level] }));
    var close = el("button", "btn quiet small", "close"); close.type = "button"; close.addEventListener("click", function () { detail.innerHTML = ""; history.replaceState(null, "", location.pathname); }); row.appendChild(close);
    right.appendChild(row);
    d.appendChild(right); sheet.appendChild(d); detail.appendChild(sheet);
    sheet.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- flashcards ----------
  function card(k) {
    return {
      id: k.k, say: k.w.length ? k.w[0][0] : (k.kun[0] || k.on[0] || "").replace(/[.\-]/g, ""),
      front: function () { return el("div", "big", k.k); },
      back: function () {
        var w = el("div");
        w.appendChild(el("div", "en", k.m));
        var mid = el("div", "mid", [k.on.join("、"), k.kun.join("、")].filter(Boolean).join("　/　"));
        if (k.on.length || k.kun.length) mid.appendChild(App.speakButton((k.on.concat(k.kun)).map(function (r) { return r.replace(/[.\-]/g, ""); }).join("、")));
        w.appendChild(mid);
        var ex = el("div", "meta"); ex.innerHTML = k.w.slice(0, 3).map(function (x) { return esc(x[0]) + " <small>" + esc(x[1]) + "</small> " + esc(x[2]); }).join("<br>"); w.appendChild(ex);
        if (Store.progress.mnemonics[k.k]) w.appendChild(el("div", "hand", Store.progress.mnemonics[k.k]));
        return w;
      }
    };
  }
  function flash(only) {
    view.innerHTML = "";
    var list;
    if (only) list = only;
    else {
      var due = Store.dueList("kanji", ids(level)).map(byChar);
      var fresh = Store.newList("kanji", ids(level), Flash.newBudget("kanji")).map(byChar);
      list = App.shuffle(due).concat(fresh);
      view.appendChild(h('<p class="type small">' + level + ' · ' + due.length + ' due · ' + fresh.length + ' new (' + Flash.newBudget("kanji") + ' new left today). space flips, 1 to 4 grade.</p>'));
    }
    var box = el("div"); view.appendChild(box);
    Flash.run(box, { deck: "kanji", cards: list.map(card), onDone: function () { flash(); }, emptyText: "no kanji due at " + level + " and today's new ones are done. browse the grid to start any character by hand." });
  }

  // ---------- writing pad ----------
  function writingPad(start) {
    view.innerHTML = "";
    var pool = data.kanji[level]; if (!pool.length) { view.appendChild(el("p", "empty", "nothing here")); return; }
    var seen = pool.filter(function (k) { var c = Store.card("kanji", k.k); return c && c.r; });
    var queue = start ? [start] : App.shuffle(seen.length >= 5 ? seen : pool);
    var i = 0, strokes = [], ghost = true, revealed = false;
    var pad = el("div", "pad");
    var canvas = el("canvas"); canvas.width = 300; canvas.height = 300; pad.appendChild(canvas);
    var side = el("div", "pad-side");
    var prompt = el("div", "prompt"), rd = el("div", "jp"), reveal = el("div", "reveal"), count = el("div", "meta");
    side.appendChild(prompt); side.appendChild(rd); side.appendChild(reveal); side.appendChild(count);
    var row = el("div", "btn-row");
    var bGhost = btn("hide guide", function () { ghost = !ghost; bGhost.textContent = ghost ? "hide guide" : "show guide"; draw(); });
    var bUndo = btn("undo stroke", function () { strokes.pop(); draw(); });
    var bClear = btn("clear", function () { strokes = []; draw(); });
    var bReveal = btn("reveal", function () { revealed = true; reveal.textContent = cur().k; ghost = true; draw(); });
    var bSpeak = btn("hear a word", function () { var k = cur(); if (k.w[0]) App.speak(k.w[0][0], { rate: Store.progress.settings.rate }).catch(function () { App.toast("no japanese voice on this device"); }); });
    [bGhost, bUndo, bClear, bReveal, bSpeak].forEach(function (b) { row.appendChild(b); });
    side.appendChild(row);
    var grade = el("div", "btn-row");
    var ok = btn("got it", function () { Store.grade("kanji", cur().k, 2); next(); }, "btn primary");
    var no = btn("missed it", function () { Store.grade("kanji", cur().k, 0); next(); });
    var skip = btn("next", next, "btn quiet");
    grade.appendChild(ok); grade.appendChild(no); grade.appendChild(skip); side.appendChild(grade);
    side.appendChild(h('<p class="type small">draw with the mouse or a finger. the pale guide is the printed glyph; your hand should learn the shape, so hide it as soon as you can.</p>'));
    pad.appendChild(side); view.appendChild(pad);
    var ctx = canvas.getContext("2d"), drawing = false;
    function cur() { return queue[i % queue.length]; }
    function next() { i++; strokes = []; revealed = false; show(); }
    function show() {
      var k = cur();
      prompt.textContent = k.m; rd.textContent = [k.on.join("、"), k.kun.join("、")].filter(Boolean).join("　/　");
      reveal.textContent = revealed ? k.k : ""; ghost = !seen.length || !Store.card("kanji", k.k) || Store.state(Store.card("kanji", k.k)) === "new" ? true : ghost;
      draw();
    }
    function draw() {
      var k = cur();
      ctx.clearRect(0, 0, 300, 300);
      ctx.save(); ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--rule"); ctx.setLineDash([4, 6]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(150, 0); ctx.lineTo(150, 300); ctx.moveTo(0, 150); ctx.lineTo(300, 150); ctx.stroke(); ctx.restore();
      if (ghost) {
        ctx.save(); ctx.font = "240px " + getComputedStyle(document.documentElement).getPropertyValue("--font-jp"); ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--paper-3"); ctx.globalAlpha = 0.9; ctx.fillText(k.k, 150, 160); ctx.restore();
      }
      ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 11; ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--ink");
      strokes.forEach(function (s) { ctx.beginPath(); s.forEach(function (pt, n) { if (n) ctx.lineTo(pt[0], pt[1]); else ctx.moveTo(pt[0], pt[1]); }); ctx.stroke(); });
      ctx.restore();
      count.textContent = strokes.length + " strokes drawn" + (k.s ? " · " + k.s + " expected" : "");
    }
    function pos(e) { var r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * 300 / r.width, (e.clientY - r.top) * 300 / r.height]; }
    canvas.addEventListener("pointerdown", function (e) { drawing = true; strokes.push([pos(e)]); canvas.setPointerCapture(e.pointerId); draw(); });
    canvas.addEventListener("pointermove", function (e) { if (!drawing) return; strokes[strokes.length - 1].push(pos(e)); draw(); });
    canvas.addEventListener("pointerup", function () { drawing = false; });
    canvas.addEventListener("pointercancel", function () { drawing = false; });
    show();
  }
  function btn(label, fn, cls) { var b = el("button", cls || "btn small", label); b.type = "button"; b.addEventListener("click", fn); return b; }

  // ---------- quick quiz ----------
  function quiz() {
    view.innerHTML = "";
    var n = Math.min(12, data.kanji[level].length);
    var qs = App.shuffle(Quiz.gen.kanjiMeaning(data, level, Math.ceil(n / 3)).concat(Quiz.gen.kanjiReading(data, level, Math.ceil(n / 3)), Quiz.gen.kanjiWord(data, level, Math.floor(n / 3))));
    if (!qs.length) { view.appendChild(el("p", "empty", "nothing to quiz yet")); return; }
    var box = el("div"); view.appendChild(box);
    Quiz.run(box, qs, { onDone: function (r) { Store.logQuiz({ level: level, type: "kanji", right: r.right, total: r.total, seconds: r.seconds }); }, onAgain: quiz });
  }
})();
