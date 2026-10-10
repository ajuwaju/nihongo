// Vocabulary: browse, flashcards both ways, quick quiz.
(function () {
  "use strict";
  var el = App.el, h = App.h, esc = App.escape;
  var data, all, level, mode = "browse", dir = "jp", view = document.getElementById("view"), search = document.getElementById("search");

  App.ready().then(function () { return Promise.all([App.data("vocab"), App.data("kanji")]); }).then(function (res) {
    data = { vocab: res[0], kanji: res[1] };
    all = []; App.levels.forEach(function (l) { data.vocab[l].forEach(function (v) { all.push({ v: v, level: l }); }); });
    level = Store.progress.settings.level || "N5";
    var counts = {}; App.levels.forEach(function (l) { counts[l] = data.vocab[l].length; });
    App.levelTabs(document.getElementById("levels"), { current: level, counts: counts, onChange: function (lv) { level = lv; render(); } });
    App.modes(document.getElementById("modes"), [{ id: "browse", label: "browse" }, { id: "flash", label: "flashcards" }, { id: "quiz", label: "quick quiz" }], mode, function (m) { mode = m; render(); });
    search.addEventListener("input", function () { if (mode !== "browse") { mode = "browse"; document.querySelectorAll("#modes button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.textContent === "browse")); }); } render(); });
    if (location.hash === "#flash") { mode = "flash"; document.querySelectorAll("#modes button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.textContent === "flashcards")); }); }
    render();
  }).catch(function (e) { view.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; });

  function ids(lv) { return data.vocab[lv].map(Quiz.vid); }
  function render() { App.stopSpeaking(); if (mode === "browse") browse(); else if (mode === "flash") flash(); else quiz(); }

  function browse() {
    view.innerHTML = "";
    var q = search.value.trim().toLowerCase();
    var list = q ? all.filter(function (x) { return x.v[0].indexOf(q) !== -1 || x.v[1].indexOf(q) !== -1 || x.v[2].toLowerCase().indexOf(q) !== -1; }).slice(0, 400)
                 : data.vocab[level].map(function (v) { return { v: v, level: level }; });
    var stats = Store.deckStats("vocab", ids(level));
    view.appendChild(el("div", "sheet-h", q ? list.length + " matches" : level + " · " + list.length + " words · " + stats.seen + " met · " + stats.due + " due"));
    var ul = el("ul", "rows"), now = Date.now();
    list.forEach(function (x) {
      var v = x.v, li = el("li");
      var w = el("span", "w", v[0]); var c = Store.card("vocab", Quiz.vid(v));
      if (c && c.r) { var dot = el("i", "dot " + ({ learning: "amber", review: "pink", known: "green" }[Store.state(c)] || "")); w.appendChild(dot); }
      li.appendChild(w); li.appendChild(el("span", "r", v[1] !== v[0] ? v[1] : "")); li.appendChild(el("span", "e", v[2]));
      var right = el("span"); if (v[3]) right.appendChild(el("span", "pill pos", v[3])); if (q) right.appendChild(el("span", "pill", x.level));
      var sp = el("button", "play-sm", "♪"); sp.type = "button";
      sp.addEventListener("click", function () { App.speak(v[0], { rate: Store.progress.settings.rate }).catch(function () { App.toast("no japanese voice on this device"); }); });
      right.appendChild(sp); li.appendChild(right); ul.appendChild(li);
    });
    view.appendChild(ul);
  }

  function card(v) {
    var front = dir === "jp" ? function () { var d = el("div"); d.appendChild(el("div", "big", v[0])); return d; }
                             : function () { var d = el("div"); d.appendChild(el("div", "en", v[2])); if (v[3]) d.appendChild(el("div", "meta", v[3])); return d; };
    var back = function () {
      var d = el("div");
      if (dir === "jp") { d.appendChild(el("div", "mid", v[1] !== v[0] ? v[1] : "")); d.appendChild(el("div", "en", v[2])); }
      else { d.appendChild(el("div", "big", v[0])); d.appendChild(el("div", "mid", v[1] !== v[0] ? v[1] : "")); }
      if (v[3]) d.appendChild(el("div", "meta", v[3]));
      return d;
    };
    return { id: Quiz.vid(v), say: v[0], front: front, back: back };
  }
  function flash() {
    view.innerHTML = "";
    var byId = {}; data.vocab[level].forEach(function (v) { byId[Quiz.vid(v)] = v; });
    var due = Store.dueList("vocab", ids(level)), fresh = Store.newList("vocab", ids(level), Flash.newBudget("vocab"));
    var list = App.shuffle(due).concat(fresh).map(function (id) { return byId[id]; });
    var top = el("div", "toolbar");
    top.appendChild(h('<p class="type small m0">' + level + ' · ' + due.length + ' due · ' + fresh.length + ' new (' + Flash.newBudget("vocab") + ' new left today)</p>'));
    var m = el("div", "modes"); App.modes(m, [{ id: "jp", label: "japanese → english" }, { id: "en", label: "english → japanese" }], dir, function (d) { dir = d; flash(); }); top.appendChild(m);
    view.appendChild(top);
    var box = el("div"); view.appendChild(box);
    Flash.run(box, { deck: "vocab", cards: list.map(card), onDone: flash, emptyText: "no words due at " + level + " and today's new ones are done." });
  }

  function quiz() {
    view.innerHTML = "";
    var n = Math.min(12, data.vocab[level].length);
    var qs = App.shuffle(Quiz.gen.vocabMeaning(data, level, Math.ceil(n / 3)).concat(Quiz.gen.vocabWord(data, level, Math.ceil(n / 3)), Quiz.gen.vocabReading(data, level, Math.floor(n / 3))));
    if (!qs.length) { view.appendChild(el("p", "empty", "nothing to quiz yet")); return; }
    var box = el("div"); view.appendChild(box);
    Quiz.run(box, qs, { onDone: function (r) { Store.logQuiz({ level: level, type: "vocab", right: r.right, total: r.total, seconds: r.seconds }); }, onAgain: quiz });
  }
})();
