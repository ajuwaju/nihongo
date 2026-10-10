// A grammar point rendered as an expandable card, shared by the grammar page and the daily session.
// GPoint.render(p, { index, showLevel, open, onTick }) -> <details>
// GPoint.cloze(p, q, onAnswer) -> one fill-the-blank drill row
(function () {
  "use strict";
  var el = App.el;

  function cloze(p, q, onAnswer) {
    var w = el("div"); var qt = el("div", "q");
    qt.innerHTML = App.furi(q[0]).replace(/___|＿＿＿|＿＿|（　）/g, '<span class="blank"></span>');
    w.appendChild(qt);
    var opts = el("div", "opts"), done = false;
    App.shuffle([q[1]].concat(q[2])).forEach(function (o) {
      var b = el("button"); b.innerHTML = App.furi(o); b.type = "button";
      b.addEventListener("click", function () {
        if (done) return; done = true;
        var ok = o === q[1];
        opts.querySelectorAll("button").forEach(function (x) { x.disabled = true; if (x.innerHTML === App.furi(q[1])) x.classList.add("right"); });
        if (!ok) b.classList.add("wrong");
        qt.querySelector(".blank").innerHTML = App.furi(q[1]);
        var filled = App.plain(q[0]).replace(/___|＿＿＿|＿＿|（　）/g, App.plain(q[1]));
        qt.appendChild(App.speakButton(filled));
        if (Store.progress.settings.sayAnswers !== false) App.say(filled);
        var rec = Store.progress.grammar.quizzed[p.id] || [0, 0]; rec[0] += ok ? 1 : 0; rec[1]++; Store.progress.grammar.quizzed[p.id] = rec; Store.touchStreak(); Store.save();
        if (window.Adapt) Adapt.record("grammar", "grammar", p.id, ok);
        if (q[3]) { var e = el("div", "explain"); e.innerHTML = App.furi(q[3]); w.appendChild(e); }
        if (onAnswer) onAnswer(ok);
      });
      opts.appendChild(b);
    });
    w.appendChild(opts);
    return w;
  }

  function render(p, opts) {
    opts = opts || {};
    var d = el("details", "gp"); d.id = p.id; if (opts.open) d.open = true;
    var s = el("summary");
    var left = el("div"); var t = el("span", "t"); t.innerHTML = App.furi(p.title); left.appendChild(t); left.appendChild(el("span", "m", p.meaning)); s.appendChild(left);
    var state = el("div", "state");
    if (opts.showLevel) state.appendChild(el("span", "pill", p.level));
    var studied = Store.progress.grammar.studied[p.id];
    state.appendChild(el("span", "pill " + (studied ? "green" : ""), studied ? "ticked" : String((opts.index || 0) + 1).padStart(2, "0")));
    s.appendChild(state); d.appendChild(s);
    var body = el("div", "gp-body");
    if (p.form) { var f = el("div", "form"); f.innerHTML = App.furi(p.form); body.appendChild(f); }
    p.notes.forEach(function (n) { var np = el("p", "notes-p"); np.innerHTML = App.furi(n); body.appendChild(np); });
    if (p.ex.length) {
      var ul = el("ul", "exs");
      p.ex.forEach(function (ex) {
        var li = el("li"); var jp = el("div", "jp"); jp.innerHTML = App.furi(ex[0]); jp.appendChild(App.speakButton(ex[0]));
        li.appendChild(jp); li.appendChild(el("div", "en", ex[1])); ul.appendChild(li);
      });
      body.appendChild(ul);
    }
    if (p.q.length) {
      var dr = el("div", "cloze"); dr.appendChild(el("div", "sheet-h", "try it"));
      p.q.forEach(function (q) { dr.appendChild(cloze(p, q, opts.onAnswer)); });
      body.appendChild(dr);
    }
    var row = el("div", "btn-row");
    var tb = el("button", "btn small " + (studied ? "quiet" : "primary"), studied ? "untick" : "tick as studied"); tb.type = "button";
    tb.addEventListener("click", function () {
      var st = Store.progress.grammar.studied;
      if (st[p.id]) delete st[p.id]; else { st[p.id] = Date.now(); Store.touchStreak(); }
      Store.save();
      if (opts.onTick) opts.onTick(!!st[p.id]); else { var n = render(p, Object.assign({}, opts, { open: true })); d.replaceWith(n); }
    });
    row.appendChild(tb);
    row.appendChild(App.noteButton({ kind: "grammar", id: p.id, label: App.plain(p.title) + " · " + p.meaning, href: "grammar.html#" + p.id, tags: ["grammar", p.level] }));
    body.appendChild(row);
    d.appendChild(body);
    return d;
  }

  window.GPoint = { render: render, cloze: cloze };
})();
