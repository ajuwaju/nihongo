// The desk: today's reviews, where you stand, and quick links.
(function () {
  "use strict";
  var el = App.el, h = App.h, esc = App.escape;

  App.ready().then(function () {
    var p = Store.progress, name = Store.current.name;
    document.getElementById("who-name").textContent = name;
    var hour = new Date().getHours();
    document.getElementById("greet").textContent = hour < 11 ? "おはようございます、" : hour < 18 ? "こんにちは、" : "こんばんは、";
    var s = p.streak;
    var line = document.getElementById("streak-line");
    if (s.days > 0) line.firstChild.textContent = s.days + (s.days === 1 ? " day" : " days") + " in a row (best " + s.best + "). today's cards are on the right ";
    return Promise.all([App.data("kanji"), App.data("vocab"), App.data("grammar"), App.data("articles"), Vault.status()]).then(function (res) {
      render(res[0], res[1], res[2], res[3], res[4].counts || {});
    });
  }).catch(function (e) { console.error(e); });

  function render(kanji, vocab, grammar, articles, counts) {
    var p = Store.progress, lv = p.settings.level || "N5";
    var kids = {}, vids = {}, allK = [], allV = [];
    App.levels.forEach(function (l) {
      kids[l] = kanji[l].map(function (k) { return k.k; });
      vids[l] = vocab[l].map(function (v) { return v[0] + "|" + v[1]; });
      allK = allK.concat(kids[l]); allV = allV.concat(vids[l]);
    });
    var kStats = Store.deckStats("kanji", allK), vStats = Store.deckStats("vocab", allV);
    var studied = Object.keys(p.grammar.studied).length, read = Object.keys(p.articles.read).length;

    // ----- today -----
    var today = document.getElementById("today");
    today.innerHTML = '<span class="tape right"></span><h2>today</h2>';
    var ul = el("ul", "today-list");
    var newK = Math.max(0, (p.settings.newPerDay || 15) - newToday("kanji")), newV = Math.max(0, (p.settings.newPerDay || 15) - newToday("vocab"));
    var dueK = Store.dueList("kanji", allK).length, dueV = Store.dueList("vocab", allV).length;
    var nextG = grammar[lv].filter(function (g) { return !p.grammar.studied[g.id]; })[0];
    var nextA = articles[lv].filter(function (a) { return !p.articles.read[a.id]; })[0];
    ul.appendChild(row("kanji.html#flash", "kanji reviews", dueK, newK ? "+" + Math.min(newK, Store.newList("kanji", kids[lv], 99).length) + " new" : ""));
    ul.appendChild(row("vocab.html#flash", "vocab reviews", dueV, newV ? "+" + Math.min(newV, Store.newList("vocab", vids[lv], 99).length) + " new" : ""));
    if (nextG) ul.appendChild(row("grammar.html#" + nextG.id, "next grammar", nextG.title, lv));
    if (nextA) ul.appendChild(row("articles.html#" + nextA.id, "read something", nextA.title, a_minutes(nextA)));
    ul.appendChild(row("listening.html", "one listening test", "", lv));
    today.appendChild(ul);
    var row2 = el("div", "btn-row");
    var go = h('<a class="btn primary" href="daily.html">start today\'s session</a>'); row2.appendChild(go);
    var lvl = h('<span class="pill pink">working on ' + lv + '</span>'); row2.appendChild(lvl);
    today.appendChild(row2);

    // ----- stats -----
    var stats = document.getElementById("stats");
    stats.innerHTML = "";
    [["streak", p.streak.days + (p.streak.days ? " 🔥" : ""), "days in a row"], ["kanji", kStats.seen, "of " + allK.length + " met · " + kStats.known + " solid"],
     ["words", vStats.seen, "of " + allV.length + " met · " + vStats.known + " solid"], ["grammar", studied, "points ticked"],
     ["read", read, "articles finished"], ["quizzes", p.quizzes.length, "taken · avg " + avg(p.quizzes) + "%"]].forEach(function (x) {
      var d = el("div", "stat"); d.appendChild(el("div", "n", String(x[1]))); d.appendChild(el("div", "label", x[0])); d.appendChild(el("div", "meta", x[2])); stats.appendChild(d);
    });

    // ----- ladder -----
    var ladder = document.getElementById("ladder"); ladder.innerHTML = "";
    App.levels.forEach(function (l) {
      var r = el("div", "rung"); r.appendChild(el("div", "lv", l));
      var bars = el("div", "bars");
      var ks = Store.deckStats("kanji", kids[l]), vs = Store.deckStats("vocab", vids[l]);
      var gs = grammar[l].filter(function (g) { return p.grammar.studied[g.id]; }).length;
      var as = articles[l].filter(function (a) { return p.articles.read[a.id]; }).length;
      bars.appendChild(bar("kanji", ks.seen, kids[l].length, ""));
      bars.appendChild(bar("vocab", vs.seen, vids[l].length, "amber"));
      bars.appendChild(bar("grammar", gs, grammar[l].length, "green"));
      bars.appendChild(bar("articles", as, articles[l].length, ""));
      r.appendChild(bars); ladder.appendChild(r);
    });

    // ----- quick -----
    var quick = document.getElementById("quick"); quick.innerHTML = "";
    [["kanji.html", "漢", "kanji", counts.kanji ? sum(counts.kanji) + " characters" : ""], ["vocab.html", "語", "vocabulary", counts.vocab ? sum(counts.vocab) + " words" : ""],
     ["grammar.html", "文", "grammar", counts.grammar ? sum(counts.grammar) + " patterns" : ""], ["articles.html", "記", "articles", counts.articles ? sum(counts.articles) + " pieces" : ""],
     ["reading.html", "読", "reading drills", counts.reading ? sum(counts.reading) + " passages" : ""], ["listening.html", "聴", "listening tests", counts.listening ? sum(counts.listening) + " tracks" : ""],
     ["quiz.html", "問", "quizzes + mock exams", "build your own"], ["notes.html", "帳", "the notes drawer", p.notes.length + " cards filed"]].forEach(function (q) {
      var a = el("a"); a.href = q[0]; a.setAttribute("data-img", q[0].replace(".html", ""));
      a.appendChild(el("span", "card-no", "/" + String(quick.children.length + 1).padStart(2, "0")));
      a.appendChild(el("div", "jp-big", q[1])); a.appendChild(el("div", "t", q[2])); a.appendChild(el("span", "meta", q[3])); quick.appendChild(a);
    });
  }

  function row(href, label, main, meta) {
    var li = el("li"); var a = el("a"); a.href = href;
    a.innerHTML = '<span class="label">' + esc(label) + '</span>' + (typeof main === "string" && main ? ' <span class="jp">' + App.furi(main) + '</span>' : "");
    li.appendChild(a);
    var right = el("span");
    if (typeof main === "number") { right.appendChild(el("span", "count", String(main))); }
    if (meta) { right.appendChild(el("span", "meta", " " + meta)); }
    li.appendChild(right);
    return li;
  }
  function bar(label, n, total, color) {
    var b = el("div", "bar"); b.appendChild(el("span", null, label));
    var track = el("div", "track"); var fill = el("div", "fill " + color); track.appendChild(fill); b.appendChild(track);
    b.appendChild(el("span", "pct", App.pct(n, total) + "%"));
    requestAnimationFrame(function () { fill.style.width = App.pct(n, total) + "%"; });
    return b;
  }
  function newToday(deck) {
    var p = Store.progress, d = p.daily || {}; if (d.date !== Store.dateKey()) return 0; return d[deck] || 0;
  }
  function avg(list) { if (!list.length) return 0; var r = 0, t = 0; list.forEach(function (q) { r += q.right; t += q.total; }); return App.pct(r, t); }
  function sum(obj) { return Object.keys(obj).reduce(function (a, k) { return a + obj[k]; }, 0); }
  function a_minutes(a) { return a.minutes ? a.minutes + " min" : ""; }
})();
