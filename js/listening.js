// Listening tests, read by the computer's own japanese voice. Nothing is sent anywhere.
(function () {
  "use strict";
  var el = App.el, h = App.h, esc = App.escape;
  var data, level, list = document.getElementById("list"), player = document.getElementById("player");

  App.ready().then(function () { return App.data("listening"); }).then(function (l) {
    data = l; level = Store.progress.settings.level || "N5";
    var counts = {}; App.levels.forEach(function (x) { counts[x] = l[x].length; });
    App.levelTabs(document.getElementById("levels"), { current: level, counts: counts, onChange: function (lv) { level = lv; renderList(); } });
    renderList();
    var id = location.hash.slice(1);
    if (id) { var doc = find(id); if (doc) open(doc); }
  }).catch(function (e) { list.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; });

  function find(id) { var hit = null; App.levels.forEach(function (l) { data[l].forEach(function (d) { if (d.id === id) hit = d; }); }); return hit; }

  function renderList() {
    App.stopSpeaking(); player.hidden = true; player.innerHTML = ""; list.hidden = false; list.innerHTML = "";
    var docs = data[level];
    if (!App.voices().length) list.appendChild(voiceWarning());
    if (!docs.length) { list.appendChild(el("p", "empty", "no listening tests for this level yet.")); return; }
    list.appendChild(h('<p class="type small">' + level + ' · ' + docs.length + ' tracks. listen twice with the script hidden, answer, then read along.</p>'));
    var ul = el("ul", "passage-list");
    docs.forEach(function (d) {
      var li = el("li"); var a = el("a"); a.href = "#" + d.id;
      a.appendChild(el("span", "kind", d.kind || "dialogue"));
      var t = el("span", "t"); t.innerHTML = App.furi(d.title); t.appendChild(el("small", null, d.blurb + " · " + (d.script || []).length + " lines · " + d.questions.length + " questions")); a.appendChild(t);
      var best = Store.progress.listening.scores[d.id];
      a.appendChild(el("span", "best", best ? best[0] + "/" + best[1] : "not yet"));
      a.addEventListener("click", function (e) { e.preventDefault(); open(d); });
      li.appendChild(a); ul.appendChild(li);
    });
    list.appendChild(ul);
  }

  function voiceWarning() {
    return h('<div class="no-voice"><b>no japanese voice found on this device.</b> on a mac: system settings → accessibility → spoken content → system voice → manage voices, then add a japanese voice such as kyoko or o-ren. on windows: settings → time &amp; language → language → add japanese, with speech. reload after.</div>');
  }

  function open(doc) {
    history.replaceState(null, "", "#" + doc.id);
    list.hidden = true; player.hidden = false; player.innerHTML = "";
    var s = Store.progress.settings, lines = doc.script || [], current = -1, playing = false, scriptShown = false;
    var bar = el("div", "btn-row");
    var back = el("button", "btn small quiet", "← all tracks"); back.type = "button"; back.addEventListener("click", function () { history.replaceState(null, "", location.pathname); renderList(); }); bar.appendChild(back);
    bar.appendChild(el("span", "pill pink", doc.level + " · " + (doc.kind || "dialogue"))); player.appendChild(bar);
    var sheet = el("div", "sheet wide");
    var h1 = el("h1", "display display-md"); h1.innerHTML = App.furi(doc.title); h1.classList.add("no-furigana"); sheet.appendChild(h1);
    sheet.appendChild(el("p", "type", doc.blurb));
    if (!App.voices().length) sheet.appendChild(voiceWarning());

    var box = el("div", "player");
    var controls = el("div", "controls");
    var playAll = el("button", "btn primary small", "▶ play"); playAll.type = "button";
    var stop = el("button", "btn small", "stop"); stop.type = "button";
    var show = el("button", "btn small quiet", "reveal script"); show.type = "button";
    var wave = h('<span class="speaking" hidden><span class="wave"><i></i><i></i><i></i><i></i></span> speaking</span>');
    controls.appendChild(playAll); controls.appendChild(stop); controls.appendChild(show); controls.appendChild(wave); box.appendChild(controls);
    var vr = el("div", "voice-row");
    var vsel = el("select"); App.voices().forEach(function (v) { var o = el("option", null, v.name + " (" + v.lang + ")"); o.value = v.name; if (v.name === s.voice) o.selected = true; vsel.appendChild(o); });
    vsel.addEventListener("change", function () { s.voice = vsel.value; Store.save(); });
    var rate = h('<label>speed <input type="range" min="0.6" max="1.3" step="0.05"></label>'); var rin = rate.querySelector("input"); rin.value = s.rate || 0.9;
    var rateLabel = el("span", null, Number(rin.value).toFixed(2) + "×"); rin.addEventListener("input", function () { s.rate = Number(rin.value); rateLabel.textContent = s.rate.toFixed(2) + "×"; Store.save(); });
    vr.appendChild(el("span", null, "voice")); vr.appendChild(vsel); vr.appendChild(rate); vr.appendChild(rateLabel); box.appendChild(vr);
    sheet.appendChild(box);

    var script = el("div", "script"); script.hidden = true;
    lines.forEach(function (ln, i) {
      var row = el("div", "line");
      row.appendChild(el("span", "spk", ln[0] === "N" ? "" : ln[0]));
      var jp = el("div", "jp" + (s.furigana ? "" : " no-furigana")); jp.innerHTML = App.furi(ln[1]); row.appendChild(jp);
      var pb = el("button", "play-line", "♪"); pb.type = "button"; pb.title = "play this line"; pb.addEventListener("click", function () { playOne(i); }); row.appendChild(pb);
      if (doc.translation) { var ens = doc.translation.split("\n"); if (ens[i]) row.appendChild(el("div", "en", ens[i].replace(/^[A-Z]:\s*/, ""))); }
      script.appendChild(row);
    });
    sheet.appendChild(script);

    function speakLine(i) {
      var ln = lines[i]; current = i;
      script.querySelectorAll(".line").forEach(function (r, n) { r.classList.toggle("now", n === i); });
      var alt = ln[0] === "F" || ln[0] === "B" || ln[0] === "W";
      return App.speak(ln[1], { voice: s.voice, rate: s.rate || 0.9, pitch: App.voices().length > 1 ? 1 : (alt ? 1.18 : 0.9), alt: alt });
    }
    function playOne(i) { App.stopSpeaking(); playing = false; wave.hidden = false; speakLine(i).catch(noVoice).then(function () { wave.hidden = true; }); }
    function playFrom(i) {
      if (!playing || i >= lines.length) { playing = false; wave.hidden = true; script.querySelectorAll(".line").forEach(function (r) { r.classList.remove("now"); }); return; }
      speakLine(i).then(function () { return new Promise(function (res) { setTimeout(res, 350); }); }).then(function () { playFrom(i + 1); }).catch(function (e) { playing = false; wave.hidden = true; noVoice(e); });
    }
    function noVoice() { App.toast("no japanese voice on this device"); }
    playAll.addEventListener("click", function () { App.stopSpeaking(); playing = true; wave.hidden = false; playFrom(0); Store.touchStreak(); Store.save(); });
    stop.addEventListener("click", function () { playing = false; App.stopSpeaking(); wave.hidden = true; });
    show.addEventListener("click", function () { scriptShown = !scriptShown; script.hidden = !scriptShown; show.textContent = scriptShown ? "hide script" : "reveal script"; });

    if (doc.questions.length) {
      sheet.appendChild(el("h2", "sheet-h mt22", "questions"));
      var fake = { questions: doc.questions };
      var qs = Reader.body({ id: doc.id, level: doc.level, title: "", body: "", vocab: [], questions: doc.questions, tags: [] }, { hideEnglish: true, hideVocab: true, onScore: function (right, total) {
        var prev = Store.progress.listening.scores[doc.id]; if (!prev || right > prev[0]) Store.progress.listening.scores[doc.id] = [right, total];
        Store.logQuiz({ level: doc.level, type: "listening", right: right, total: total, seconds: 0 });
        if (!scriptShown) show.click();
      } });
      // keep only the question list from the rendered article
      var ol = qs.querySelector(".qs"); sheet.appendChild(ol);
    }

    if (doc.vocab.length) {
      sheet.appendChild(el("h2", "sheet-h mt22", "words to catch"));
      var ul = el("ul", "words");
      doc.vocab.forEach(function (v) { var li = el("li"); var a = el("span"); a.appendChild(el("span", "w", v[0])); if (v[1] && v[1] !== v[0]) a.appendChild(el("span", "r", v[1])); li.appendChild(a); li.appendChild(el("span", "e", v[2])); ul.appendChild(li); });
      sheet.appendChild(ul);
    }

    // dictation
    sheet.appendChild(el("h2", "sheet-h mt22", "dictation"));
    sheet.appendChild(h('<p class="type small">pick a line, play it as often as you like, type what you hear in kana or kanji, then check. spaces and punctuation do not count.</p>'));
    var dict = el("div", "dictation");
    var pick = el("select"); lines.forEach(function (ln, i) { pick.appendChild(el("option", null, "line " + (i + 1) + (ln[0] !== "N" ? " (" + ln[0] + ")" : ""))); }); pick.value = 0;
    var row2 = el("div", "btn-row"); row2.appendChild(pick);
    var dplay = el("button", "btn small", "▶ play line"); dplay.type = "button"; dplay.addEventListener("click", function () { playOne(Number(pick.selectedIndex)); }); row2.appendChild(dplay);
    dict.appendChild(row2);
    var ta = h('<div class="field"><textarea rows="2" placeholder="聞こえたことを書いてください"></textarea></div>'); dict.appendChild(ta);
    var check = el("button", "btn primary small", "check"); check.type = "button"; var out = el("div", "diff diff-out");
    check.addEventListener("click", function () {
      var target = App.plain(lines[pick.selectedIndex][1]), mine = ta.querySelector("textarea").value;
      out.innerHTML = diff(norm(mine), norm(target));
      var ok = norm(mine) === norm(target);
      out.appendChild(el("p", "score-line", ok ? "ぴったり！" : "compare above: red is yours where it differs, green is the script."));
      Store.touchStreak(); Store.save();
    });
    dict.appendChild(check); dict.appendChild(out); sheet.appendChild(dict);
    sheet.appendChild(el("div", "btn-row")).appendChild(App.noteButton({ kind: "listening", id: doc.id, label: App.plain(doc.title), href: "listening.html#" + doc.id, tags: ["listening", doc.level] }));
    player.appendChild(sheet);
    window.scrollTo({ top: 0 });
  }

  function norm(s) { return String(s || "").replace(/[\s、。，．,.!?！？「」『』・…〜～ー－\-]/g, "").replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xff10 + 48); }); }
  // character diff (shortest edit script on short strings)
  function diff(a, b) {
    var n = a.length, m = b.length, dp = [];
    for (var i = 0; i <= n; i++) { dp[i] = []; for (var j = 0; j <= m; j++) dp[i][j] = 0; }
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    var out = "", x = 0, y = 0;
    while (x < n && y < m) {
      if (a[x] === b[y]) { out += esc(a[x]); x++; y++; }
      else if (dp[x + 1][y] >= dp[x][y + 1]) { out += "<del>" + esc(a[x]) + "</del>"; x++; }
      else { out += "<ins>" + esc(b[y]) + "</ins>"; y++; }
    }
    while (x < n) { out += "<del>" + esc(a[x++]) + "</del>"; }
    while (y < m) { out += "<ins>" + esc(b[y++]) + "</ins>"; }
    return out;
  }
})();
