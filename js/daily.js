// The daily session: one tab that walks through kanji, vocab, grammar, an article, a reading drill,
// a listening track and a quiz, in order, picking each piece from what the adaptive layer says you need.
(function () {
  "use strict";
  var el = App.el, h = App.h, esc = App.escape;
  var data, plan, level;
  var STEPS = [
    { id: "kanji", label: "kanji", jp: "漢字" }, { id: "vocab", label: "vocab", jp: "語彙" }, { id: "grammar", label: "grammar", jp: "文法" },
    { id: "article", label: "article", jp: "記事" }, { id: "reading", label: "reading", jp: "読解" }, { id: "listening", label: "listening", jp: "聴解" }, { id: "quiz", label: "quiz", jp: "問題" }
  ];
  var rail = document.getElementById("rail"), stage = document.getElementById("stage"), why = document.getElementById("why");

  App.ready().then(function () {
    return Promise.all(["kanji", "vocab", "grammar", "articles", "reading", "listening", "quizzes"].map(App.data));
  }).then(function (res) {
    data = { kanji: res[0], vocab: res[1], grammar: res[2], articles: res[3], reading: res[4], listening: res[5], quizzes: res[6] };
    level = Store.progress.settings.level || "N5";
    buildPlan();
    renderWhy();
    renderRail();
    show(plan.step);
  }).catch(function (e) { stage.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; });

  // ---------- planning: what today contains ----------
  function buildPlan() {
    var p = Store.progress, today = Store.dateKey();
    if (p.dailyPlan && p.dailyPlan.date === today && p.dailyPlan.level === level) { plan = p.dailyPlan; return; }
    var tune = Adapt.tune();
    plan = { date: today, level: level, step: 0, done: {}, scores: {}, tune: tune.why };
    // grammar: repeat the last point if its drills went badly, else the next unstudied one
    var pts = data.grammar[level], last = null, next = null;
    pts.forEach(function (g) { if (p.grammar.studied[g.id]) last = g; else if (!next) next = g; });
    var lastRec = last && p.grammar.quizzed[last.id];
    plan.grammar = (last && lastRec && lastRec[1] >= 2 && lastRec[0] / lastRec[1] < 0.6) ? last.id : (next || last || pts[0] || {}).id;
    plan.grammarWhy = plan.grammar === (last || {}).id && next ? "repeating " + App.plain(last.title) + " because its drills went badly" : "";
    // article: unread first; if the last read one scored under 70%, read it again before moving on
    var arts = data.articles[level], prev = null, unread = null;
    arts.forEach(function (a) { if (p.articles.read[a.id]) prev = a; else if (!unread) unread = a; });
    var sc = prev && p.articles.scores[prev.id];
    plan.article = (prev && sc && sc[1] && sc[0] / sc[1] < 0.7) ? prev.id : (unread || prev || arts[0] || {}).id;
    plan.articleWhy = prev && plan.article === prev.id && unread ? "re-reading " + App.plain(prev.title) + " (last time " + sc[0] + "/" + sc[1] + ")" : "";
    // reading drill: not yet attempted, else the lowest score
    var rd = data.reading[level].slice().sort(function (a, b) { return score(p.reading.scores[a.id]) - score(p.reading.scores[b.id]); });
    plan.reading = (rd[0] || {}).id;
    var ls = data.listening[level].slice().sort(function (a, b) { return score(p.listening.scores[a.id]) - score(p.listening.scores[b.id]); });
    plan.listening = (ls[0] || {}).id;
    p.dailyPlan = plan; Store.save();
  }
  function score(s) { return s && s[1] ? s[0] / s[1] : -1; }
  function savePlan() { Store.progress.dailyPlan = plan; Store.save(); }

  function renderWhy() {
    why.innerHTML = "";
    var lines = Adapt.summary();
    if (plan.grammarWhy) lines.push(plan.grammarWhy);
    if (plan.articleWhy) lines.push(plan.articleWhy);
    var ul = el("ul", "why-list");
    lines.forEach(function (l) { ul.appendChild(el("li", null, l)); });
    why.appendChild(ul);
  }

  function renderRail() {
    rail.innerHTML = "";
    STEPS.forEach(function (s, i) {
      var b = el("button", "step" + (plan.done[s.id] ? " done" : "") + (i === plan.step ? " now" : "")); b.type = "button";
      b.appendChild(el("span", "no", "/" + String(i + 1).padStart(2, "0")));
      b.appendChild(el("span", "lab", s.label));
      b.appendChild(el("span", "jp", s.jp));
      b.addEventListener("click", function () { show(i); });
      rail.appendChild(b);
    });
    var doneCount = Object.keys(plan.done).length;
    var fin = el("div", "rail-sum", doneCount + " / " + STEPS.length + " done");
    rail.appendChild(fin);
  }

  function markDone(id) { plan.done[id] = Date.now(); savePlan(); renderRail(); }
  function nextButton(id, label) {
    var row = el("div", "btn-row");
    var b = el("button", "btn primary", label || "next step"); b.type = "button";
    b.addEventListener("click", function () { markDone(id); var i = STEPS.findIndex(function (s) { return s.id === id; }); show(Math.min(i + 1, STEPS.length)); });
    row.appendChild(b); return row;
  }
  function head(i, title, sub) {
    var hd = el("div", "step-head");
    hd.appendChild(el("p", "label", "step /" + String(i + 1).padStart(2, "0") + " · " + level));
    hd.appendChild(el("h2", "display step-title", title));
    if (sub) hd.appendChild(el("p", "type", sub));
    return hd;
  }

  // ---------- steps ----------
  function show(i) {
    App.stopSpeaking();
    plan.step = Math.min(i, STEPS.length - 1); savePlan(); renderRail();
    stage.innerHTML = "";
    if (i >= STEPS.length) return finish();
    var s = STEPS[i];
    ({ kanji: stepKanji, vocab: stepVocab, grammar: stepGrammar, article: stepArticle, reading: stepReading, listening: stepListening, quiz: stepQuiz })[s.id](i);
    window.scrollTo({ top: 0 });
  }

  function flashStep(i, deck, title) {
    var ids = (deck === "kanji" ? data.kanji[level].map(function (k) { return k.k; }) : data.vocab[level].map(Quiz.vid));
    var weak = Adapt.weakIds(deck, 6).filter(function (id) { return ids.indexOf(id) !== -1; });
    var due = Store.dueList(deck, ids), fresh = Store.newList(deck, ids, Flash.newBudget(deck));
    var queue = App.uniq(weak.concat(App.shuffle(due), fresh));
    var sub = due.length + " due · " + fresh.length + " new" + (weak.length ? " · " + weak.length + " you keep missing, first" : "");
    stage.appendChild(head(i, title, sub));
    var box = el("div"); stage.appendChild(box);
    var cards;
    if (deck === "kanji") {
      var byK = {}; data.kanji[level].forEach(function (k) { byK[k.k] = k; });
      cards = queue.map(function (id) { var k = byK[id]; return { id: id, say: k.w.length ? k.w[0][0] : "", front: function () { return el("div", "big", k.k); }, back: function () {
        var w = el("div"); w.appendChild(el("div", "en", k.m)); var mid = el("div", "mid", [k.on.join("、"), k.kun.join("、")].filter(Boolean).join("　/　")); w.appendChild(mid);
        var ex = el("div", "meta"); ex.innerHTML = k.w.slice(0, 3).map(function (x) { return esc(x[0]) + " <small>" + esc(x[1]) + "</small> " + esc(x[2]); }).join("<br>"); w.appendChild(ex); return w; } }; });
    } else {
      var byV = {}; data.vocab[level].forEach(function (v) { byV[Quiz.vid(v)] = v; });
      cards = queue.map(function (id) { var v = byV[id]; return { id: id, say: v[0], front: function () { return el("div", "big", v[0]); }, back: function () {
        var d = el("div"); d.appendChild(el("div", "mid", v[1] !== v[0] ? v[1] : "")); d.appendChild(el("div", "en", v[2])); if (v[3]) d.appendChild(el("div", "meta", v[3])); return d; } }; });
    }
    Flash.run(box, { deck: deck, cards: cards, emptyText: "nothing due and today's new ones are done. on to the next step.", onDone: function () { markDone(deck); show(i + 1); } });
    stage.appendChild(nextButton(deck, queue.length ? "skip to next step" : "next step"));
  }
  function stepKanji(i) { flashStep(i, "kanji", "kanji cards"); }
  function stepVocab(i) { flashStep(i, "vocab", "vocab cards"); }

  function stepGrammar(i) {
    var g = data.grammar[level].filter(function (x) { return x.id === plan.grammar; })[0];
    if (!g) { stage.appendChild(head(i, "grammar", "no grammar at this level")); stage.appendChild(nextButton("grammar")); return; }
    stage.appendChild(head(i, "one grammar point", plan.grammarWhy || "read it, hear the examples, do the drill, tick it"));
    var right = 0, total = 0;
    stage.appendChild(GPoint.render(g, { open: true, showLevel: true, onAnswer: function (ok) { total++; if (ok) right++; plan.scores.grammar = [right, total]; savePlan(); }, onTick: function () { markDone("grammar"); show(i + 1); } }));
    stage.appendChild(nextButton("grammar"));
  }

  function stepArticle(i) {
    var a = data.articles[level].filter(function (x) { return x.id === plan.article; })[0];
    if (!a) { stage.appendChild(head(i, "article", "no articles at this level")); stage.appendChild(nextButton("article")); return; }
    stage.appendChild(head(i, "read something", plan.articleWhy || "read it out loud, then answer the questions"));
    var sheet = el("div", "sheet wide");
    sheet.appendChild(Reader.body(a, { noteLink: { kind: "article", href: "articles.html#" + a.id }, onScore: function (r, t) {
      Store.progress.articles.scores[a.id] = [r, t]; Store.progress.articles.read[a.id] = Date.now(); Store.touchStreak(); Store.save();
      plan.scores.article = [r, t]; markDone("article");
    } }));
    stage.appendChild(sheet);
    stage.appendChild(nextButton("article"));
  }

  function stepReading(i) {
    var d = data.reading[level].filter(function (x) { return x.id === plan.reading; })[0];
    if (!d) { stage.appendChild(head(i, "reading", "no passages at this level")); stage.appendChild(nextButton("reading")); return; }
    stage.appendChild(head(i, "reading drill", "no furigana until you have answered; the clock is running"));
    var start = Date.now(), clock = el("p", "timer", "0:00"); stage.appendChild(clock);
    var tick = setInterval(function () { var s = Math.floor((Date.now() - start) / 1000); clock.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }, 500);
    var sheet = el("div", "sheet wide");
    var post = Reader.body(d, { furigana: false, lockFurigana: true, hideEnglish: true, hideVocab: true, onScore: function (r, t) {
      clearInterval(tick); var secs = Math.round((Date.now() - start) / 1000);
      var prev = Store.progress.reading.scores[d.id]; if (!prev || r > prev[0]) Store.progress.reading.scores[d.id] = [r, t, secs];
      Store.logQuiz({ level: level, type: "reading", right: r, total: t, seconds: secs });
      post.querySelector(".post-tools button").disabled = false; plan.scores.reading = [r, t]; markDone("reading");
    } });
    sheet.appendChild(post); stage.appendChild(sheet);
    stage.appendChild(nextButton("reading"));
  }

  function stepListening(i) {
    var d = data.listening[level].filter(function (x) { return x.id === plan.listening; })[0];
    if (!d) { stage.appendChild(head(i, "listening", "no tracks at this level")); stage.appendChild(nextButton("listening")); return; }
    stage.appendChild(head(i, "listening test", "play it twice with the script hidden, then answer"));
    var box = el("div", "player"), s = Store.progress.settings, lines = d.script || [], playing = false, shown = false;
    var controls = el("div", "controls");
    var play = el("button", "btn primary small", "▶ play"); play.type = "button";
    var stop = el("button", "btn small", "stop"); stop.type = "button";
    var reveal = el("button", "btn small quiet", "reveal script"); reveal.type = "button";
    controls.appendChild(play); controls.appendChild(stop); controls.appendChild(reveal); box.appendChild(controls);
    var script = el("div", "script"); script.hidden = true;
    lines.forEach(function (ln, n) { var row = el("div", "line"); row.appendChild(el("span", "spk", ln[0] === "N" ? "" : ln[0])); var jp = el("div", "jp"); jp.innerHTML = App.furi(ln[1]); row.appendChild(jp); row.appendChild(App.speakButton(ln[1])); script.appendChild(row); });
    box.appendChild(script);
    function playFrom(n) { if (!playing || n >= lines.length) { playing = false; return; } var alt = /^[FBW]$/.test(lines[n][0]); App.speak(lines[n][1], { voice: s.voice, rate: s.rate || 0.9, alt: alt, pitch: App.voices().length > 1 ? 1 : (alt ? 1.18 : 0.9) }).then(function () { return new Promise(function (r) { setTimeout(r, 350); }); }).then(function () { playFrom(n + 1); }).catch(function () { playing = false; App.toast("no japanese voice on this device"); }); }
    play.addEventListener("click", function () { App.stopSpeaking(); playing = true; playFrom(0); });
    stop.addEventListener("click", function () { playing = false; App.stopSpeaking(); });
    reveal.addEventListener("click", function () { shown = !shown; script.hidden = !shown; reveal.textContent = shown ? "hide script" : "reveal script"; });
    stage.appendChild(box);
    var qs = Reader.body({ id: d.id, level: d.level, title: "", body: "", vocab: [], questions: d.questions, tags: [] }, { hideEnglish: true, hideVocab: true, onScore: function (r, t) {
      var prev = Store.progress.listening.scores[d.id]; if (!prev || r > prev[0]) Store.progress.listening.scores[d.id] = [r, t];
      Store.logQuiz({ level: level, type: "listening", right: r, total: t, seconds: 0 }); plan.scores.listening = [r, t]; markDone("listening");
      if (!shown) reveal.click();
    } });
    var sheet = el("div", "sheet wide"); sheet.appendChild(el("h2", null, "questions")); sheet.appendChild(qs.querySelector(".qs")); stage.appendChild(sheet);
    stage.appendChild(nextButton("listening"));
  }

  function stepQuiz(i) {
    var mix = Adapt.quizMix(12), qs = [];
    Object.keys(mix.plan).forEach(function (k) { if (Quiz.gen[k]) qs = qs.concat(Quiz.gen[k](data, level, mix.plan[k])); });
    qs = App.shuffle(qs).slice(0, 12);
    stage.appendChild(head(i, "twelve questions", mix.notes.length ? mix.notes.join("; ") : "an even mix today; it leans on whatever you miss"));
    if (!qs.length) { stage.appendChild(el("p", "empty", "nothing to ask yet")); stage.appendChild(nextButton("quiz")); return; }
    var box = el("div"); stage.appendChild(box);
    Quiz.run(box, qs, { onDone: function (r) { Store.logQuiz({ level: level, type: "daily", right: r.right, total: r.total, seconds: r.seconds }); plan.scores.quiz = [r.right, r.total]; markDone("quiz"); }, onAgain: function () { show(STEPS.length); } });
    stage.appendChild(nextButton("quiz", "finish the session"));
  }

  function finish() {
    var p = Store.progress, box = el("div", "sheet wide");
    box.appendChild(el("h2", null, "session complete"));
    box.appendChild(el("p", "display step-title", "お疲れさま"));
    var ul = el("ul", "why-list");
    STEPS.forEach(function (s) { var sc = plan.scores[s.id]; ul.appendChild(el("li", null, s.label + ": " + (plan.done[s.id] ? "done" : "skipped") + (sc ? " · " + sc[0] + "/" + sc[1] : ""))); });
    ul.appendChild(el("li", null, "streak: " + p.streak.days + " day" + (p.streak.days === 1 ? "" : "s") + " (best " + p.streak.best + ")"));
    box.appendChild(ul);
    var row = el("div", "btn-row");
    var again = el("button", "btn", "run it again"); again.type = "button"; again.addEventListener("click", function () { plan.done = {}; plan.scores = {}; plan.step = 0; savePlan(); renderRail(); show(0); });
    row.appendChild(again);
    var home = el("a", "btn quiet", "back to the desk"); home.href = "index.html"; row.appendChild(home);
    box.appendChild(row); stage.appendChild(box);
  }
})();
