// A flashcard session shared by the kanji and vocab pages.
// Flash.run(container, { deck, cards: [{id, front(), back()}], onDone })
(function () {
  "use strict";
  var el = App.el, h = App.h;
  var LABELS = [["again", "soon"], ["hard", "later"], ["good", ""], ["easy", ""]];

  function preview(card, g) {
    var c = card ? JSON.parse(JSON.stringify(card)) : { e: 2.5, i: 0, r: 0, s: 0 };
    if (c.i < 1) return g === 0 ? "1 min" : g === 1 ? "10 min" : g === 2 ? (c.s < 1 ? "10 min" : "1 d") : "4 d";
    if (g === 0) return "10 min";
    if (g === 1) return Math.max(1, Math.round(c.i * 1.2)) + " d";
    if (g === 2) return Math.max(1, Math.round(c.i * c.e)) + " d";
    return Math.max(2, Math.round(c.i * c.e * 1.3)) + " d";
  }

  function countNew(deck, n) {
    var p = Store.progress, today = Store.dateKey();
    if (!p.daily || p.daily.date !== today) p.daily = { date: today, kanji: 0, vocab: 0 };
    p.daily[deck] = (p.daily[deck] || 0) + n;
  }

  window.Flash = {
    newBudget: function (deck) {
      var p = Store.progress, today = Store.dateKey();
      var used = (p.daily && p.daily.date === today) ? (p.daily[deck] || 0) : 0;
      return Math.max(0, (p.settings.newPerDay || 15) - used);
    },
    run: function (container, opts) {
      container.innerHTML = "";
      var queue = opts.cards.slice(), done = 0, again = 0, total = queue.length;
      var wrap = el("div", "flash");
      container.appendChild(wrap);
      if (!queue.length) {
        var none = el("div", "done-card");
        none.appendChild(el("p", "display", "nothing due"));
        none.appendChild(el("p", "type", opts.emptyText || "come back later, or raise new cards per day on the about page."));
        wrap.appendChild(none);
        return;
      }
      var card, flipped;
      function show() {
        if (!queue.length) { finish(); return; }
        var item = queue[0]; flipped = false;
        wrap.innerHTML = "";
        card = el("div", "flash-card");
        card.appendChild(h('<span class="tape"></span>'));
        var front = el("div", "flash-face front"); front.appendChild(item.front()); front.appendChild(el("div", "hint", "tap or press space to flip"));
        var back = el("div", "flash-face back"); back.appendChild(item.back());
        if (item.say) { var hb = el("button", "btn small quiet", "hear it"); hb.type = "button"; hb.addEventListener("click", function (e) { e.stopPropagation(); App.say(item.say); }); back.appendChild(hb); }
        card.appendChild(front); card.appendChild(back);
        wrap.appendChild(card);
        var grades = el("div", "grades");
        var existing = Store.card(opts.deck, item.id);
        LABELS.forEach(function (lab, g) {
          var b = el("button", lab[0]); b.type = "button";
          b.appendChild(el("span", null, lab[0])); b.appendChild(el("small", null, preview(existing, g)));
          b.addEventListener("click", function () { grade(g); });
          grades.appendChild(b);
        });
        grades.hidden = true;
        wrap.appendChild(grades);
        var prog = el("div", "flash-progress");
        prog.appendChild(el("span", null, done + " done · " + queue.length + " left"));
        prog.appendChild(el("span", null, (existing && existing.r) ? "seen " + existing.r + "×" : "new card"));
        wrap.appendChild(prog);
        card.addEventListener("click", flip);
        function flip() { if (flipped) return; flipped = true; card.classList.add("flipped"); grades.hidden = false; if (item.say && Store.progress.settings.sayCards !== false) App.say(item.say); }
        wrap._flip = flip; wrap._grade = grade;
        function grade(g) {
          var isNew = !existing || !existing.r;
          Store.grade(opts.deck, item.id, g);
          if (window.Adapt) Adapt.gradeLog(opts.deck, g);
          if (isNew) countNew(opts.deck, 1);
          queue.shift();
          if (g <= 1) { again++; queue.push(item); } else done++;
          show();
        }
      }
      function finish() {
        wrap.innerHTML = "";
        var d = el("div", "done-card");
        d.appendChild(el("p", "display", "お疲れさま"));
        d.appendChild(el("p", "type", total + " cards, " + again + " sent back for another look. the ones you missed come around again sooner."));
        var again_btn = el("button", "btn", "another round"); again_btn.type = "button";
        again_btn.addEventListener("click", function () { if (opts.onDone) opts.onDone(); });
        d.appendChild(again_btn);
        wrap.appendChild(d);
      }
      show();
      container._keys = function (e) {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); wrap._flip && wrap._flip(); }
        if (/^[1-4]$/.test(e.key) && card && card.classList.contains("flipped")) wrap._grade(Number(e.key) - 1);
      };
      document.removeEventListener("keydown", container._lastKeys || function () {});
      document.addEventListener("keydown", container._keys);
      container._lastKeys = container._keys;
    }
  };
})();
