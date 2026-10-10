// Adaptive layer: watches what goes wrong and tunes what comes next.
// Everything is computed from the profile's own progress; nothing leaves the browser.
(function () {
  "use strict";
  var DAY = 86400000;

  function p() { return Store.progress; }
  function ensure() {
    var x = p();
    if (!x.misses) x.misses = { kanji: {}, vocab: {}, grammar: {} };
    if (!x.hist) x.hist = {};
    if (!x.pace) x.pace = { log: {} };
    return x;
  }

  var Adapt = {
    // ---- recording ----
    // kind: "kanji · reading" etc; deck: kanji|vocab|grammar|bank|reading; id: item id
    record: function (kind, deck, id, ok) {
      var x = ensure();
      var k = (kind || "").split(" · ")[0] + (deck === "grammar" ? "/grammar" : "");
      var h = x.hist[kind] || [0, 0]; h[0] += ok ? 1 : 0; h[1]++; x.hist[kind] = h;
      if (deck && x.misses[deck] && id) {
        var m = x.misses[deck];
        if (ok) { if (m[id]) { m[id] = Math.max(0, m[id] - 1); if (!m[id]) delete m[id]; } }
        else m[id] = (m[id] || 0) + 2;
      }
      // a wrong answer on a card not yet in the deck starts it in learning, so it comes back soon
      if (!ok && (deck === "kanji" || deck === "vocab") && id) {
        var c = Store.card(deck, id);
        if (!c || !c.r) Store.grade(deck, id, 0);
      }
      var today = Store.dateKey(), d = x.pace.log[today] || [0, 0]; d[0] += ok ? 1 : 0; d[1]++; x.pace.log[today] = d;
      Store.save();
    },
    gradeLog: function (deck, g) {
      var x = ensure(), today = Store.dateKey(), key = "cards:" + today;
      var d = x.pace.log[key] || [0, 0]; d[0] += g >= 2 ? 1 : 0; d[1]++; x.pace.log[key] = d;
    },

    // ---- reading the record ----
    accuracy: function (kind) { var h = ensure().hist[kind]; return h && h[1] >= 4 ? h[0] / h[1] : null; },
    weakKinds: function () {
      var x = ensure(), out = [];
      Object.keys(x.hist).forEach(function (k) { var h = x.hist[k]; if (h[1] >= 4) out.push({ kind: k, acc: h[0] / h[1], n: h[1] }); });
      return out.sort(function (a, b) { return a.acc - b.acc; });
    },
    weakIds: function (deck, n) {
      var m = ensure().misses[deck] || {};
      return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).slice(0, n || 10);
    },
    yesterdayCards: function () {
      var x = ensure(), key = "cards:" + Store.dateKey(Date.now() - DAY);
      return x.pace.log[key] || null;
    },

    // ---- pace: how many new cards today ----
    // if yesterday's reviews went badly (many "again"/"hard"), slow down; if they went well and the pile was cleared, speed up.
    tune: function () {
      var x = ensure(), s = x.settings;
      if (s.autoPace === false) return { changed: false, why: "automatic pacing is off" };
      var today = Store.dateKey();
      if (x.pace.tunedOn === today) return { changed: false, why: x.pace.lastWhy || "" };
      var y = Adapt.yesterdayCards(), before = s.newPerDay || 15, after = before, why;
      if (!y || y[1] < 10) { why = "not enough reviews yesterday to judge, keeping " + before + " new cards"; }
      else {
        var good = y[0] / y[1];
        if (good < 0.7) { after = Math.max(5, Math.round(before * 0.75)); why = "yesterday " + Math.round((1 - good) * 100) + "% of cards came back as again or hard, so new cards go down to " + after; }
        else if (good > 0.9 && y[1] >= 20) { after = Math.min(40, before + 3); why = "yesterday went well (" + Math.round(good * 100) + "% good or easy), so new cards go up to " + after; }
        else { why = "yesterday was steady (" + Math.round(good * 100) + "% good or easy), keeping " + before + " new cards"; }
      }
      s.newPerDay = after; x.pace.tunedOn = today; x.pace.lastWhy = why; Store.save();
      return { changed: after !== before, before: before, after: after, why: why };
    },

    // ---- quiz mix weighted to the weak spots ----
    quizMix: function (total) {
      var base = { kanjiReading: 1, kanjiMeaning: 1, kanjiWord: 1, vocabMeaning: 1, vocabReading: 1, grammar: 1.4, bank: 1 };
      var names = { "kanji · reading": "kanjiReading", "kanji · meaning": "kanjiMeaning", "kanji · word reading": "kanjiWord", "vocab · meaning": "vocabMeaning", "vocab · reading": "vocabReading", "vocab · which word": "vocabMeaning", "grammar": "grammar", "exam": "bank" };
      var notes = [];
      Adapt.weakKinds().forEach(function (w) {
        var key = names[w.kind] || names[w.kind.split(" · ")[0]];
        if (!key) return;
        if (w.acc < 0.6) { base[key] *= 2.2; notes.push(w.kind + " is at " + Math.round(w.acc * 100) + "%, so it gets double weight"); }
        else if (w.acc > 0.9 && w.n >= 12) { base[key] *= 0.6; }
      });
      var sum = 0; Object.keys(base).forEach(function (k) { sum += base[k]; });
      var plan = {}; Object.keys(base).forEach(function (k) { plan[k] = Math.max(1, Math.round(total * base[k] / sum)); });
      return { plan: plan, notes: notes };
    },

    // ---- a short human explanation for the daily page ----
    summary: function () {
      var lines = [], t = Adapt.tune();
      lines.push(t.why);
      var weak = Adapt.weakKinds().filter(function (w) { return w.acc < 0.7; }).slice(0, 2);
      weak.forEach(function (w) { lines.push(w.kind + " is your weakest area (" + Math.round(w.acc * 100) + "% over " + w.n + " questions); today leans on it"); });
      var wk = Adapt.weakIds("kanji", 3), wv = Adapt.weakIds("vocab", 3);
      if (wk.length) lines.push("kanji you keep missing: " + wk.join(" "));
      if (wv.length) lines.push("words you keep missing: " + wv.map(function (i) { return i.split("|")[0]; }).join("、"));
      if (lines.length === 1) lines.push("no weak spots recorded yet; answer a few quizzes and this adapts");
      return lines;
    }
  };
  window.Adapt = Adapt;
})();
