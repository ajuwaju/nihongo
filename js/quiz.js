// Quizzes: build your own mix, or sit a timed mock exam.
(function () {
  "use strict";
  var el = App.el, h = App.h, esc = App.escape;
  var data, setup = document.getElementById("setup"), run = document.getElementById("run");
  var TYPES = [
    ["kanjiMeaning", "kanji → meaning"], ["kanjiReading", "kanji → reading"], ["kanjiWrite", "meaning → kanji"], ["kanjiWord", "kanji words"],
    ["vocabMeaning", "word → meaning"], ["vocabWord", "meaning → word"], ["vocabReading", "word → reading"],
    ["grammar", "grammar blanks"], ["bank", "exam-style questions"], ["reading", "reading comprehension"]
  ];

  App.ready().then(function () {
    return Promise.all(["kanji", "vocab", "grammar", "quizzes", "reading", "articles"].map(App.data));
  }).then(function (res) {
    data = { kanji: res[0], vocab: res[1], grammar: res[2], quizzes: res[3], reading: res[4], articles: res[5] };
    renderSetup(); renderHistory();
  }).catch(function (e) { setup.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; });

  function renderSetup() {
    setup.innerHTML = ""; run.hidden = true; run.innerHTML = "";
    var lv = Store.progress.settings.level || "N5";
    var sheet = el("div", "sheet wide tilt-l");
    sheet.appendChild(el("h2", null, "build a quiz"));
    var grid = el("div", "quiz-setup");
    var c1 = el("div"); c1.appendChild(el("div", "label", "level")); var lvls = el("div", "choice-grid");
    App.levels.forEach(function (l) { lvls.appendChild(h('<label><input type="radio" name="lv" value="' + l + '"' + (l === lv ? " checked" : "") + '> ' + l + '</label>')); });
    c1.appendChild(lvls); grid.appendChild(c1);
    var c2 = el("div"); c2.appendChild(el("div", "label", "what to ask")); var types = el("div", "choice-grid");
    TYPES.forEach(function (t, i) { types.appendChild(h('<label><input type="checkbox" name="t" value="' + t[0] + '"' + (i < 5 ? " checked" : "") + '> ' + t[1] + '</label>')); });
    c2.appendChild(types); grid.appendChild(c2);
    var c3 = el("div"); c3.appendChild(el("div", "label", "how many · timer")); var opts = el("div", "choice-grid");
    [10, 20, 40].forEach(function (n) { opts.appendChild(h('<label><input type="radio" name="n" value="' + n + '"' + (n === 20 ? " checked" : "") + '> ' + n + ' questions</label>')); });
    [[0, "no clock"], [600, "10 minutes"], [1200, "20 minutes"]].forEach(function (t) { opts.appendChild(h('<label><input type="radio" name="tm" value="' + t[0] + '"' + (t[0] === 0 ? " checked" : "") + '> ' + t[1] + '</label>')); });
    c3.appendChild(opts); grid.appendChild(c3);
    sheet.appendChild(grid);
    var row = el("div", "btn-row");
    var go = el("button", "btn primary", "start"); go.type = "button"; go.addEventListener("click", function () { start(false); }); row.appendChild(go);
    var mock = el("button", "btn", "mock exam (timed, all sections)"); mock.type = "button"; mock.addEventListener("click", function () { start(true); }); row.appendChild(mock);
    sheet.appendChild(row);
    sheet.appendChild(h('<p class="type small mt12">the mock exam takes 40 questions in jlpt order: characters and words, then grammar, then reading, with 30 minutes on the clock. listening is its own page.</p>'));
    setup.appendChild(sheet);
  }

  function val(name) { var n = setup.querySelector('input[name="' + name + '"]:checked'); return n ? n.value : null; }

  function start(mock) {
    var lv = val("lv") || "N5";
    Store.progress.settings.level = lv; Store.save();
    var qs = [];
    if (mock) {
      qs = Quiz.gen.kanjiReading(data, lv, 5).concat(Quiz.gen.kanjiWord(data, lv, 4), Quiz.gen.vocabMeaning(data, lv, 5), Quiz.gen.vocabWord(data, lv, 4),
        Quiz.gen.bank(data, lv, 6), Quiz.gen.grammar(data, lv, 10), Quiz.gen.reading(data, lv, 6));
    } else {
      var picked = Array.prototype.map.call(setup.querySelectorAll('input[name="t"]:checked'), function (x) { return x.value; });
      if (!picked.length) { App.toast("pick at least one kind"); return; }
      var n = Number(val("n") || 20), per = Math.ceil(n / picked.length);
      picked.forEach(function (t) { qs = qs.concat(Quiz.gen[t](data, lv, per)); });
      qs = App.shuffle(qs).slice(0, n);
    }
    if (!qs.length) { App.toast("nothing to ask at this level yet"); return; }
    var timed = mock ? 1800 : Number(val("tm") || 0);
    setup.hidden = true; run.hidden = false; run.innerHTML = "";
    var bar = el("div", "btn-row"); var back = el("button", "btn small quiet", "← quit"); back.type = "button"; back.addEventListener("click", function () { setup.hidden = false; renderSetup(); }); bar.appendChild(back);
    bar.appendChild(el("span", "pill pink", (mock ? "mock exam " : "quiz ") + lv)); run.appendChild(bar);
    var box = el("div"); run.appendChild(box);
    Quiz.run(box, qs, { timed: timed, onDone: function (r) { Store.logQuiz({ level: lv, type: mock ? "mock" : "mixed", right: r.right, total: r.total, seconds: r.seconds }); renderHistory(); }, onAgain: function () { setup.hidden = false; renderSetup(); window.scrollTo({ top: 0 }); } });
    window.scrollTo({ top: 0 });
  }

  function renderHistory() {
    var ul = document.getElementById("history"); ul.innerHTML = "";
    var list = Store.progress.quizzes.slice(0, 40);
    if (!list.length) { ul.appendChild(el("li", "empty", "no quizzes yet. the first one is the hardest to start.")); return; }
    list.forEach(function (q) {
      var li = el("li");
      li.appendChild(el("span", "meta", App.fmtDate(q.t)));
      li.appendChild(el("span", null, q.level + " · " + q.type + " · " + q.total + " questions · " + Math.round(q.seconds / 60) + " min"));
      li.appendChild(el("span", "sc", App.pct(q.right, q.total) + "%"));
      ul.appendChild(li);
    });
  }
})();
