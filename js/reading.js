// Reading drills: a passage with a clock, questions, then the answers and furigana.
(function () {
  "use strict";
  var el = App.el, h = App.h, esc = App.escape;
  var data, level, list = document.getElementById("list"), runner = document.getElementById("runner");

  App.ready().then(function () { return App.data("reading"); }).then(function (r) {
    data = r; level = Store.progress.settings.level || "N5";
    var counts = {}; App.levels.forEach(function (l) { counts[l] = r[l].length; });
    App.levelTabs(document.getElementById("levels"), { current: level, counts: counts, onChange: function (lv) { level = lv; renderList(); } });
    renderList();
    var id = location.hash.slice(1);
    if (id) { var doc = find(id); if (doc) { level = doc.level; run(doc); } }
  }).catch(function (e) { list.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; });

  function find(id) { var hit = null; App.levels.forEach(function (l) { data[l].forEach(function (d) { if (d.id === id) hit = d; }); }); return hit; }

  function renderList() {
    runner.hidden = true; runner.innerHTML = ""; list.hidden = false; list.innerHTML = "";
    var docs = data[level];
    if (!docs.length) { list.appendChild(el("p", "empty", "no passages for this level yet.")); return; }
    list.appendChild(h('<p class="type small">' + level + ' · ' + docs.length + ' passages. the clock starts when you open one; aim for about a minute per question.</p>'));
    var ul = el("ul", "passage-list");
    docs.forEach(function (d) {
      var li = el("li"); var a = el("a"); a.href = "#" + d.id;
      a.appendChild(el("span", "kind", d.kind || "passage"));
      var t = el("span", "t"); t.innerHTML = App.furi(d.title); t.appendChild(el("small", null, d.blurb + (d.questions.length ? " · " + d.questions.length + " questions" : "")));
      a.appendChild(t);
      var best = Store.progress.reading.scores[d.id];
      a.appendChild(el("span", "best", best ? best[0] + "/" + best[1] + " · " + Math.round(best[2] / 60) + " min" : "not yet"));
      a.addEventListener("click", function (e) { e.preventDefault(); run(d); });
      li.appendChild(a); ul.appendChild(li);
    });
    list.appendChild(ul);
  }

  function run(doc) {
    history.replaceState(null, "", "#" + doc.id);
    list.hidden = true; runner.hidden = false; runner.innerHTML = "";
    var start = Date.now(), clock = el("span", "timer", "0:00");
    var tick = setInterval(function () { var s = Math.floor((Date.now() - start) / 1000); clock.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }, 500);
    var bar = el("div", "quiz-bar");
    var back = el("button", "btn small quiet", "← all passages"); back.type = "button"; back.addEventListener("click", function () { clearInterval(tick); App.stopSpeaking(); history.replaceState(null, "", location.pathname); renderList(); });
    bar.appendChild(back); bar.appendChild(clock); runner.appendChild(bar);
    var sheet = el("div", "sheet wide");
    var post = Reader.body(doc, {
      furigana: false, lockFurigana: true, hideEnglish: true, hideVocab: true,
      noteLink: { kind: "reading", href: "reading.html#" + doc.id },
      onScore: function (right, total) {
        clearInterval(tick);
        var secs = Math.round((Date.now() - start) / 1000);
        var prev = Store.progress.reading.scores[doc.id];
        if (!prev || right > prev[0] || (right === prev[0] && secs < prev[2])) Store.progress.reading.scores[doc.id] = [right, total, secs];
        Store.logQuiz({ level: doc.level, type: "reading", right: right, total: total, seconds: secs });
        // after the drill: furigana, english and the word list become available
        post.querySelector(".post-tools button").disabled = false;
        var tools = post.querySelector(".post-tools");
        var en = el("button", "btn small quiet", "show english"); en.type = "button";
        var enBody = post.querySelector(".en-body"); en.addEventListener("click", function () { enBody.hidden = !enBody.hidden; en.textContent = enBody.hidden ? "show english" : "hide english"; });
        tools.insertBefore(en, tools.children[1]);
        if (doc.vocab.length) {
          var hd = el("h2", null, "words in this passage"); var ul = el("ul", "words");
          doc.vocab.forEach(function (v) { var li = el("li"); var a = el("span"); a.appendChild(el("span", "w", v[0])); if (v[1] && v[1] !== v[0]) a.appendChild(el("span", "r", v[1])); li.appendChild(a); li.appendChild(el("span", "e", v[2])); ul.appendChild(li); });
          post.appendChild(hd); post.appendChild(ul);
        }
        var done = el("p", "score-line", "finished in " + Math.floor(secs / 60) + " min " + (secs % 60) + " s");
        post.appendChild(done);
        post.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    });
    sheet.appendChild(post); runner.appendChild(sheet);
    window.scrollTo({ top: 0 });
  }
})();
