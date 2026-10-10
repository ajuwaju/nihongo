// Articles: a collage of cards per level, each opening in the reader.
(function () {
  "use strict";
  var el = App.el, h = App.h, esc = App.escape;
  var data, all, level, kind = "", gallery = document.getElementById("gallery"), search = document.getElementById("search");

  App.ready().then(function () { return App.data("articles"); }).then(function (a) {
    data = a; all = []; App.levels.forEach(function (l) { a[l].forEach(function (d) { all.push(d); }); });
    level = Store.progress.settings.level || "N5";
    var counts = {}; App.levels.forEach(function (l) { counts[l] = a[l].length; });
    App.levelTabs(document.getElementById("levels"), { current: level, counts: counts, onChange: function (lv) { level = lv; render(); } });
    var kinds = App.uniq(all.map(function (d) { return d.kind; }).filter(Boolean));
    App.modes(document.getElementById("kinds"), [{ id: "", label: "all kinds" }].concat(kinds.map(function (k) { return { id: k, label: k }; })), kind, function (k) { kind = k; render(); });
    search.addEventListener("input", render);
    Reader.onClose = function () { history.replaceState(null, "", location.pathname); render(); };
    window.addEventListener("hashchange", openFromHash);
    render(); openFromHash();
  }).catch(function (e) { gallery.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; });

  function openFromHash() {
    var id = location.hash.slice(1); if (!id) return;
    var doc = all.filter(function (d) { return d.id === id; })[0];
    if (doc) open(doc);
  }

  function open(doc) {
    history.replaceState(null, "", "#" + doc.id);
    var mark = el("button", "btn small " + (Store.progress.articles.read[doc.id] ? "quiet" : "primary"), Store.progress.articles.read[doc.id] ? "read ✓ (unmark)" : "mark as read"); mark.type = "button";
    mark.addEventListener("click", function () {
      var r = Store.progress.articles.read;
      if (r[doc.id]) { delete r[doc.id]; mark.textContent = "mark as read"; mark.className = "btn small primary"; }
      else { r[doc.id] = Date.now(); Store.touchStreak(); mark.textContent = "read ✓ (unmark)"; mark.className = "btn small quiet"; App.toast("filed as read"); }
      Store.save();
    });
    Reader.open(doc, {
      noteLink: { kind: "article", href: "articles.html#" + doc.id },
      extraTools: [mark],
      onScore: function (right, total) { Store.progress.articles.scores[doc.id] = [right, total]; if (!Store.progress.articles.read[doc.id]) { Store.progress.articles.read[doc.id] = Date.now(); } Store.touchStreak(); Store.save(); }
    });
  }

  var layouts = [[4, 5], [3, 4], [5, 5], [3, 5], [4, 4], [4, 6], [3, 3], [5, 4]];
  function render() {
    gallery.innerHTML = "";
    var q = search.value.trim().toLowerCase();
    var list = (q ? all : data[level]).filter(function (d) {
      if (kind && d.kind !== kind) return false;
      if (!q) return true;
      return App.plain(d.title).indexOf(q) !== -1 || d.title.toLowerCase().indexOf(q) !== -1 || d.blurb.toLowerCase().indexOf(q) !== -1 || d.tags.join(" ").toLowerCase().indexOf(q) !== -1 || d.vocab.some(function (v) { return v[0].indexOf(q) !== -1 || v[2].toLowerCase().indexOf(q) !== -1; });
    });
    document.getElementById("empty").hidden = list.length > 0;
    list.forEach(function (d, i) {
      var li = el("li", "tile");
      var lay = layouts[(i + seed(d.id)) % layouts.length];
      li.style.setProperty("--c", lay[0]); li.style.setProperty("--r", lay[1]);
      li.style.setProperty("--tilt", ((seed(d.id) % 7) - 3) * 0.6 + "deg");
      li.style.setProperty("--dx", ((seed(d.id) % 5) - 2) * 2 + "px");
      var a = el("a", "tile-link"); a.href = "#" + d.id;
      var paper = el("div", "tile-paper" + (Store.progress.articles.read[d.id] ? " read" : ""));
      paper.appendChild(el("span", "stamp", d.level));
      paper.appendChild(el("span", "meta", [d.kind, d.minutes ? d.minutes + " min" : ""].filter(Boolean).join(" · ")));
      var t = el("div", "jp-t"); t.innerHTML = App.furi(d.title); paper.appendChild(t);
      paper.appendChild(el("span", "meta", d.blurb.length > 70 ? d.blurb.slice(0, 68) + "…" : d.blurb));
      if (Store.progress.articles.read[d.id]) { var sc = Store.progress.articles.scores[d.id]; paper.appendChild(el("span", "read-mark", "✓" + (sc ? " " + sc[0] + "/" + sc[1] : ""))); }
      a.appendChild(paper); li.appendChild(a); gallery.appendChild(li);
      a.addEventListener("click", function (e) { e.preventDefault(); open(d); });
    });
  }
  function seed(s) { var n = 0; for (var i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) % 1000; return n; }
})();
