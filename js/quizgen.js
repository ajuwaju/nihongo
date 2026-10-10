// Question generators and a quiz runner shared by every practice page.
// Quiz.run(container, questions, { timed, onDone })
// Quiz.gen.<kind>(data, level, n) -> [{kind, prompt, q, a, d, e, huge, jp}]
(function () {
  "use strict";
  var el = App.el, h = App.h, esc = App.escape;

  function vid(v) { return v[0] + "|" + v[1]; }
  function others(list, n, not) { return App.sample(list, n, function (x) { return not.indexOf(x) !== -1; }); }

  var gen = {
    kanjiMeaning: function (data, level, n) {
      var pool = data.kanji[level], ms = pool.map(function (k) { return k.m; });
      return App.sample(pool, n).map(function (k) {
        return { kind: "kanji · meaning", prompt: "what does this mean?", q: k.k, huge: true, a: k.m, d: others(ms, 3, [k.m]), e: readingLine(k), id: k.k, deck: "kanji", say: k.w.length ? k.w[0][0] : "" };
      });
    },
    kanjiReading: function (data, level, n) {
      var pool = data.kanji[level].filter(function (k) { return k.on.length || k.kun.length; });
      var allR = []; pool.forEach(function (k) { allR = allR.concat(k.on, k.kun.map(function (r) { return r.replace(/\./g, ""); })); });
      return App.sample(pool, n).map(function (k) {
        var rs = k.on.concat(k.kun.map(function (r) { return r.replace(/\./g, ""); }));
        var a = App.pick(rs);
        return { kind: "kanji · reading", prompt: "pick a reading of", q: k.k, huge: true, a: a, d: others(allR, 3, rs), jp: true, e: k.m + " · " + readingLine(k), id: k.k, deck: "kanji", say: a };
      });
    },
    kanjiWrite: function (data, level, n) {
      var pool = data.kanji[level], ks = pool.map(function (k) { return k.k; });
      return App.sample(pool, n).map(function (k) {
        return { kind: "kanji · which character", prompt: '"' + k.m + '" · ' + readingLine(k), q: "", a: k.k, d: others(ks, 3, [k.k]), jp: true, big: true, e: wordsLine(k), id: k.k, deck: "kanji", say: k.w.length ? k.w[0][0] : "" };
      });
    },
    kanjiWord: function (data, level, n) {
      var pool = data.kanji[level].filter(function (k) { return k.w.length; });
      var allWords = []; pool.forEach(function (k) { allWords = allWords.concat(k.w); });
      return App.sample(pool, n).map(function (k) {
        var w = App.pick(k.w);
        return { kind: "kanji · word reading", prompt: "how do you read", q: w[0], big: true, a: w[1], d: others(allWords.map(function (x) { return x[1]; }), 3, [w[1]]), jp: true, e: w[0] + " = " + w[2], id: k.k, deck: "kanji", say: w[0] };
      });
    },
    vocabMeaning: function (data, level, n) {
      var pool = data.vocab[level], ms = pool.map(function (v) { return v[2]; });
      return App.sample(pool, n).map(function (v) {
        return { kind: "vocab · meaning", prompt: "what does this mean?", q: v[0] + (v[1] !== v[0] ? "（" + v[1] + "）" : ""), big: true, a: v[2], d: others(ms, 3, [v[2]]), e: v[3] || "", id: vid(v), deck: "vocab", say: v[0] };
      });
    },
    vocabWord: function (data, level, n) {
      var pool = data.vocab[level], ws = pool.map(function (v) { return v[0]; });
      return App.sample(pool, n).map(function (v) {
        return { kind: "vocab · which word", prompt: '"' + v[2] + '"', q: "", a: v[0], d: others(ws, 3, [v[0]]), jp: true, e: v[0] + " · " + v[1], id: vid(v), deck: "vocab", say: v[0] };
      });
    },
    vocabReading: function (data, level, n) {
      var pool = data.vocab[level].filter(function (v) { return v[1] !== v[0]; }), rs = pool.map(function (v) { return v[1]; });
      return App.sample(pool, n).map(function (v) {
        return { kind: "vocab · reading", prompt: "how do you read", q: v[0], big: true, a: v[1], d: others(rs, 3, [v[1]]), jp: true, e: v[2], id: vid(v), deck: "vocab", say: v[0] };
      });
    },
    grammar: function (data, level, n) {
      var qs = [];
      data.grammar[level].forEach(function (g) {
        g.q.forEach(function (q) { qs.push({ kind: "grammar · " + App.plain(g.title), prompt: "fill the blank", q: q[0], a: q[1], d: q[2], jp: true, cloze: true, e: q[3] || (App.plain(g.title) + ": " + g.meaning), id: g.id, deck: "grammar" }); });
      });
      return App.sample(qs, n);
    },
    bank: function (data, level, n, type) {
      var pool = data.quizzes[level].filter(function (q) { return !type || q.type === type; });
      return App.sample(pool, n).map(function (q) {
        return { kind: "exam · " + q.type, prompt: "", q: q.q, a: q.a, d: q.d, jp: true, cloze: /___|＿＿|（　）/.test(q.q), e: q.e, deck: "bank" };
      });
    },
    reading: function (data, level, n) {
      var qs = [];
      data.reading[level].concat(data.articles[level]).forEach(function (doc) {
        doc.questions.forEach(function (q) { qs.push({ kind: "reading · " + App.plain(doc.title), prompt: "", passage: doc.body, q: q.q, a: q.a, d: q.d, jp: true, e: q.e, deck: "reading" }); });
      });
      return App.sample(qs, n);
    }
  };
  function readingLine(k) { return [k.on.join(" "), k.kun.join(" ")].filter(Boolean).join(" · "); }
  function wordsLine(k) { return k.w.slice(0, 3).map(function (w) { return w[0] + " " + w[1] + " " + w[2]; }).join(" / "); }

  function run(container, questions, opts) {
    opts = opts || {};
    container.innerHTML = "";
    var i = 0, right = 0, missed = [], start = Date.now(), timer = null;
    var bar = el("div", "quiz-bar"), track = el("div", "quiz-track"), fill = el("i"); track.appendChild(fill);
    var left = el("span"), clock = el("span", "timer");
    bar.appendChild(left); bar.appendChild(clock);
    var wrap = el("div", "quiz-run"); wrap.appendChild(bar); wrap.appendChild(track);
    var stage = el("div"); wrap.appendChild(stage); container.appendChild(wrap);
    if (opts.timed) {
      timer = setInterval(function () {
        var remain = opts.timed - Math.floor((Date.now() - start) / 1000);
        clock.textContent = Math.floor(remain / 60) + ":" + String(remain % 60).padStart(2, "0");
        if (remain <= 0) { clearInterval(timer); finish(true); }
      }, 500);
    }
    function show() {
      if (i >= questions.length) { finish(); return; }
      var q = questions[i];
      left.textContent = (i + 1) + " / " + questions.length + " · " + right + " right";
      fill.style.width = App.pct(i, questions.length) + "%";
      stage.innerHTML = "";
      var card = el("div", "qcard");
      card.appendChild(el("p", "kind", q.kind));
      if (q.passage) { var pas = el("div", "post"); pas.innerHTML = '<div class="jp-body no-furigana passage-inline">' + App.furi(q.passage, { paras: true }) + '</div>'; card.appendChild(pas); }
      if (q.prompt) card.appendChild(el("p", "type small", q.prompt));
      if (q.q) {
        var qt = el("p", "qtext" + (q.huge ? " huge" : "") + (q.big ? " big" : ""));
        qt.innerHTML = q.cloze ? App.furi(q.q).replace(/___|＿＿＿|＿＿|（　）/g, '<span class="blank"></span>') : App.furi(q.q);
        card.appendChild(qt);
      }
      var options = App.shuffle([q.a].concat(q.d.slice(0, 3)));
      var answers = el("div", "answers" + (q.jp && options.every(function (o) { return o.length <= 6; }) ? " two" : ""));
      var answered = false;
      options.forEach(function (o, idx) {
        var b = el("button"); b.type = "button";
        b.appendChild(el("i", null, String.fromCharCode(97 + idx)));
        var sp = el("span"); sp.innerHTML = App.furi(o); if (!q.jp) sp.classList.add("en-font"); b.appendChild(sp);
        b.addEventListener("click", function () {
          if (answered) return; answered = true;
          var ok = o === q.a;
          if (ok) right++; else missed.push(q);
          if (q.deck === "kanji" || q.deck === "vocab") { var c = Store.card(q.deck, q.id); if (c && c.r) Store.grade(q.deck, q.id, ok ? 2 : 0); }
          if (window.Adapt) Adapt.record(q.kind, q.deck, q.id, ok);
          answers.querySelectorAll("button").forEach(function (x) { x.disabled = true; if (x === b && !ok) x.classList.add("wrong"); if (x.querySelector("span").textContent === App.plain(q.a)) x.classList.add("right"); });
          if (q.e) { var ex = el("div", "explain"); ex.innerHTML = App.furi(q.e); card.appendChild(ex); }
          var sayText = q.say || (q.cloze ? App.plain(q.q).replace(/___|＿＿＿|＿＿|（　）/g, App.plain(q.a)) : (q.jp ? App.plain(q.q || q.a) : ""));
          if (sayText) {
            var hear = el("button", "btn small quiet", "hear it"); hear.type = "button"; hear.classList.add("mt14"); hear.addEventListener("click", function () { App.say(sayText); });
            card.appendChild(hear);
            if (Store.progress.settings.sayAnswers !== false) App.say(sayText);
          }
          var next = el("button", "btn primary", i + 1 < questions.length ? "next" : "finish"); next.type = "button"; next.classList.add("mt14");
          next.addEventListener("click", function () { i++; show(); });
          card.appendChild(next); next.focus();
          container._next = function () { i++; show(); };
        });
        answers.appendChild(b);
      });
      card.appendChild(answers); stage.appendChild(card);
      container._next = null;
      container._pickKey = function (k) { var btns = answers.querySelectorAll("button"); if (btns[k] && !answered) btns[k].click(); };
    }
    function finish(timeout) {
      clearInterval(timer);
      var secs = Math.round((Date.now() - start) / 1000);
      var res = { right: right, total: questions.length, seconds: secs, missed: missed, timeout: !!timeout };
      stage.innerHTML = ""; bar.hidden = true; track.hidden = true;
      var r = el("div", "result");
      var pct = App.pct(right, questions.length);
      r.appendChild(el("div", "big-score", pct + "%"));
      r.appendChild(el("p", "verdict", pct >= 90 ? "完璧！" : pct >= 80 ? "合格！" : pct >= 60 ? "もう少し" : "もう一回"));
      r.appendChild(el("p", "type", right + " of " + questions.length + " in " + Math.floor(secs / 60) + " min " + (secs % 60) + " s" + (timeout ? " (time ran out)" : "") + "."));
      if (missed.length) {
        var m = el("div", "missed"); m.appendChild(el("h2", "sheet-h", "to look at again"));
        var ul = el("ul", "words");
        missed.forEach(function (q) { var li = el("li"); var w = el("span", "w"); w.innerHTML = App.furi(q.q || q.prompt); var e = el("span", "e"); e.innerHTML = App.furi(q.a) + (q.e ? ' <span class="meta">· ' + App.furi(q.e) + '</span>' : ""); li.appendChild(w); li.appendChild(e); ul.appendChild(li); });
        m.appendChild(ul); r.appendChild(m);
      }
      var row = el("div", "btn-row center-row");
      var again = el("button", "btn primary", "again"); again.type = "button"; again.addEventListener("click", function () { if (opts.onAgain) opts.onAgain(); });
      row.appendChild(again); r.appendChild(row);
      stage.appendChild(r);
      if (opts.onDone) opts.onDone(res);
    }
    document.removeEventListener("keydown", container._qkeys || function () {});
    container._qkeys = function (e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (/^[a-d]$/.test(e.key) && container._pickKey) container._pickKey(e.key.charCodeAt(0) - 97);
      if (/^[1-4]$/.test(e.key) && container._pickKey) container._pickKey(Number(e.key) - 1);
      if (e.key === "Enter" && container._next) container._next();
    };
    document.addEventListener("keydown", container._qkeys);
    show();
  }

  window.Quiz = { gen: gen, run: run, vid: vid };
})();
