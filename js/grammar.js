// Grammar: study the points, tick them off, drill the blanks.
(function () {
  "use strict";
  var el = App.el, h = App.h, esc = App.escape;
  var data, all, level, mode = "study", view = document.getElementById("view"), search = document.getElementById("search");

  App.ready().then(function () { return App.data("grammar"); }).then(function (g) {
    data = { grammar: g };
    all = []; App.levels.forEach(function (l) { g[l].forEach(function (p) { all.push(p); }); });
    level = Store.progress.settings.level || "N5";
    var counts = {}; App.levels.forEach(function (l) { counts[l] = g[l].length; });
    App.levelTabs(document.getElementById("levels"), { current: level, counts: counts, onChange: function (lv) { level = lv; render(); } });
    App.modes(document.getElementById("modes"), [{ id: "study", label: "study" }, { id: "drill", label: "drill the blanks" }], mode, function (m) { mode = m; render(); });
    search.addEventListener("input", function () { mode = "study"; render(); });
    var hash = decodeURIComponent(location.hash.slice(1));
    if (hash) {
      var hit = all.filter(function (p) { return p.id === hash; })[0];
      if (!hit && hash.indexOf("g=") === 0) { var t = hash.slice(2); hit = all.filter(function (p) { return App.plain(p.title) === t || p.title === t; })[0]; }
      if (hit) { level = hit.level; document.querySelectorAll("#levels button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.firstChild.textContent === level)); }); render(); var node = document.getElementById(hit.id); if (node) { node.open = true; node.scrollIntoView({ block: "start" }); } return; }
    }
    render();
  }).catch(function (e) { view.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; });

  function render() { App.stopSpeaking(); if (mode === "study") study(); else drill(); }

  function study() {
    view.innerHTML = "";
    var q = search.value.trim().toLowerCase();
    var list = q ? all.filter(function (p) { return p.title.toLowerCase().indexOf(q) !== -1 || App.plain(p.title).indexOf(q) !== -1 || p.meaning.toLowerCase().indexOf(q) !== -1 || p.tags.join(" ").indexOf(q) !== -1; }) : data.grammar[level];
    var ticked = list.filter(function (p) { return Store.progress.grammar.studied[p.id]; }).length;
    view.appendChild(el("div", "sheet-h", (q ? list.length + " matches" : level + " · " + list.length + " patterns") + " · " + ticked + " ticked"));
    if (!list.length) { view.appendChild(el("p", "empty", "nothing here yet.")); return; }
    list.forEach(function (p, i) { view.appendChild(point(p, i)); });
  }

  function point(p, i) {
    return GPoint.render(p, { index: i, showLevel: p.level !== level || !!search.value, onTick: function () { study(); var n = document.getElementById(p.id); if (n) n.open = true; } });
  }

  function drill() {
    view.innerHTML = "";
    var qs = Quiz.gen.grammar(data, level, 15);
    if (!qs.length) { view.appendChild(el("p", "empty", "no drills for this level yet.")); return; }
    view.appendChild(h('<p class="type small">' + level + ' · fifteen blanks from every pattern at this level, shuffled. a to d or 1 to 4 picks, enter moves on.</p>'));
    var box = el("div"); view.appendChild(box);
    Quiz.run(box, qs, { onDone: function (r) { Store.logQuiz({ level: level, type: "grammar", right: r.right, total: r.total, seconds: r.seconds }); r.missed.forEach(function (q) { var rec = Store.progress.grammar.quizzed[q.id] || [0, 0]; rec[1]++; Store.progress.grammar.quizzed[q.id] = rec; }); Store.save(); }, onAgain: drill });
  }
})();
