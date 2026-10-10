// Renders a Japanese text (article, passage, script) with furigana, word hints,
// an english toggle, read-aloud, and the comprehension questions.
(function () {
  "use strict";
  var el = App.el, h = App.h, esc = App.escape;
  var FURI = /\{([^{}|]+)\|([^{}]+)\}/g;

  // split markup into segments: {t: plain text} or {k: kanji, r: reading}
  function segments(markup) {
    var out = [], last = 0, m;
    FURI.lastIndex = 0;
    while ((m = FURI.exec(markup))) {
      if (m.index > last) out.push({ t: markup.slice(last, m.index) });
      out.push({ k: m[1], r: m[2] });
      last = m.index + m[0].length;
    }
    if (last < markup.length) out.push({ t: markup.slice(last) });
    return out;
  }

  // wrap vocab words in hint spans without breaking the ruby blocks
  function renderBody(markup, vocab) {
    var segs = segments(markup), plain = "", starts = [];
    segs.forEach(function (s) { starts.push(plain.length); plain += s.k || s.t; });
    var ranges = [];
    var words = (vocab || []).map(function (v) { return v[0]; }).filter(Boolean).sort(function (a, b) { return b.length - a.length; });
    var taken = new Array(plain.length).fill(false);
    words.forEach(function (w) {
      var idx = plain.indexOf(w), v = vocab.filter(function (x) { return x[0] === w; })[0];
      while (idx !== -1) {
        var free = true; for (var i = idx; i < idx + w.length; i++) if (taken[i]) { free = false; break; }
        if (free) { for (var j = idx; j < idx + w.length; j++) taken[j] = true; ranges.push({ s: idx, e: idx + w.length, v: v }); }
        idx = plain.indexOf(w, idx + 1);
      }
    });
    ranges.sort(function (a, b) { return a.s - b.s; });
    var html = "", ri = 0, open = null;
    function title(v) { return (v[1] && v[1] !== v[0] ? v[1] + " · " : "") + v[2]; }
    segs.forEach(function (s, n) {
      var start = starts[n], len = (s.k || s.t).length, end = start + len;
      if (s.k) {
        if (!open && ri < ranges.length && ranges[ri].s <= start && ranges[ri].e > start) { open = ranges[ri]; html += '<span class="vocab-hit" title="' + esc(title(open.v)) + '">'; }
        html += "<ruby>" + esc(s.k) + "<rt>" + esc(s.r) + "</rt></ruby>";
        if (open && open.e <= end) { html += "</span>"; open = null; ri++; while (ri < ranges.length && ranges[ri].s < end) ri++; }
      } else {
        var pos = start;
        while (pos < end) {
          if (open) {
            var stop = Math.min(open.e, end);
            html += esc(plain.slice(pos, stop)).replace(/\n/g, "\n"); pos = stop;
            if (open.e <= end) { html += "</span>"; open = null; ri++; }
          } else if (ri < ranges.length && ranges[ri].s < end && ranges[ri].s >= pos) {
            html += esc(plain.slice(pos, ranges[ri].s)); pos = ranges[ri].s;
            open = ranges[ri]; html += '<span class="vocab-hit" title="' + esc(title(open.v)) + '">';
          } else {
            while (ri < ranges.length && ranges[ri].s < pos) ri++;
            var nextStart = ri < ranges.length && ranges[ri].s < end ? ranges[ri].s : end;
            html += esc(plain.slice(pos, nextStart)); pos = nextStart;
          }
        }
      }
    });
    if (open) html += "</span>";
    return html.split(/\n\s*\n/).map(function (p) { return "<p>" + p.replace(/\n/g, "<br>") + "</p>"; }).join("");
  }

  function body(doc, opts) {
    opts = opts || {};
    var post = el("article", "post");
    var head = el("div", "post-head");
    var meta = el("p", "type small");
    meta.appendChild(el("span", "stamp", doc.level));
    if (doc.kind) meta.appendChild(el("span", null, doc.kind));
    if (doc.minutes) meta.appendChild(el("span", null, doc.minutes + " min"));
    if (doc.tags && doc.tags.length) meta.appendChild(el("span", null, doc.tags.join(" · ")));
    head.appendChild(meta);
    var h1 = el("h1"); h1.innerHTML = App.furi(doc.title); head.appendChild(h1);
    if (doc.blurb) { var bl = el("p", "blurb", doc.blurb); head.appendChild(bl); }
    post.appendChild(head);

    var tools = el("div", "post-tools");
    var furiOn = opts.furigana !== undefined ? opts.furigana : Store.progress.settings.furigana;
    var jp = el("div", "jp-body" + (doc.kind === "dialogue" || doc.kind === "conversation" ? " dialogue" : "") + (furiOn ? "" : " no-furigana"));
    jp.innerHTML = renderBody(doc.body, doc.vocab);
    var paras = doc.body.split(/\n\s*\n/);
    jp.querySelectorAll("p").forEach(function (p, i) { if (paras[i]) p.insertBefore(App.speakButton(paras[i].replace(/^[A-Z]:\s*/, "")), p.firstChild); });
    var en = el("div", "en-body"); en.hidden = true; en.innerHTML = doc.translation ? doc.translation.split(/\n\s*\n/).map(function (p) { return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>"; }).join("") : "<p class='meta'>no translation for this one.</p>";

    var tFuri = toggle(furiOn ? "hide furigana" : "show furigana", function (b) { var on = jp.classList.toggle("no-furigana"); b.textContent = on ? "show furigana" : "hide furigana"; });
    if (opts.lockFurigana) tFuri.disabled = true;
    tools.appendChild(tFuri);
    if (!opts.hideEnglish) tools.appendChild(toggle("show english", function (b) { en.hidden = !en.hidden; b.textContent = en.hidden ? "show english" : "hide english"; }));
    var speaking = false;
    var tSpeak = toggle("read aloud", function (b) {
      if (speaking) { App.stopSpeaking(); speaking = false; b.textContent = "read aloud"; return; }
      speaking = true; b.textContent = "stop";
      var paras = doc.body.split(/\n\s*\n/);
      (function next(i) {
        if (!speaking || i >= paras.length) { speaking = false; b.textContent = "read aloud"; return; }
        App.speak(paras[i].replace(/^[A-Z]:\s*/, ""), { rate: Store.progress.settings.rate }).then(function () { next(i + 1); }).catch(function () { speaking = false; b.textContent = "read aloud"; App.toast("no japanese voice on this device"); });
      })(0);
    });
    tools.appendChild(tSpeak);
    if (opts.noteLink) tools.appendChild(App.noteButton({ kind: opts.noteLink.kind, id: doc.id, label: App.plain(doc.title), href: opts.noteLink.href, tags: [opts.noteLink.kind, doc.level] }));
    if (opts.extraTools) opts.extraTools.forEach(function (t) { tools.appendChild(t); });
    post.appendChild(tools);
    post.appendChild(jp); post.appendChild(en);

    if (doc.vocab && doc.vocab.length && !opts.hideVocab) {
      post.appendChild(el("h2", null, "words in this piece"));
      var ul = el("ul", "words");
      doc.vocab.forEach(function (v) { var li = el("li"); var a = el("span"); a.appendChild(el("span", "w", v[0])); if (v[1] && v[1] !== v[0]) a.appendChild(el("span", "r", v[1])); a.appendChild(App.speakButton(v[0])); li.appendChild(a); li.appendChild(el("span", "e", v[2])); ul.appendChild(li); });
      post.appendChild(ul);
    }
    if (doc.grammar && doc.grammar.length) {
      post.appendChild(el("h2", null, "grammar used"));
      var gl = el("div", "grammar-links");
      doc.grammar.forEach(function (g) { var a = el("a", null, App.plain(g)); a.href = "grammar.html#g=" + encodeURIComponent(App.plain(g)); gl.appendChild(a); });
      post.appendChild(gl);
    }
    if (doc.notes) { post.appendChild(el("h2", null, "notes")); var np = el("div", "en-body"); np.innerHTML = App.furi(doc.notes, { paras: true }); post.appendChild(np); }
    if (doc.questions && doc.questions.length) {
      post.appendChild(el("h2", null, "questions"));
      post.appendChild(questions(doc, opts));
    }
    return post;
  }

  function toggle(label, fn) { var b = el("button", "btn small quiet", label); b.type = "button"; b.addEventListener("click", function () { fn(b); }); return b; }

  function questions(doc, opts) {
    var ol = el("ol", "qs"), answered = 0, right = 0;
    doc.questions.forEach(function (q) {
      var li = el("li"); var qt = el("p", "qt"); qt.innerHTML = App.furi(q.q); qt.appendChild(App.speakButton(q.q)); li.appendChild(qt);
      var opts_ = el("div", "opts"), done = false;
      App.shuffle([q.a].concat(q.d)).forEach(function (o) {
        var b = el("button"); b.type = "button"; b.innerHTML = App.furi(o);
        b.addEventListener("click", function () {
          if (done) return; done = true; answered++;
          var ok = o === q.a; if (ok) right++;
          opts_.querySelectorAll("button").forEach(function (x) { x.disabled = true; if (x.innerHTML === App.furi(q.a)) x.classList.add("right"); });
          if (!ok) b.classList.add("wrong");
          if (q.e) { var e = el("p", "ex"); e.innerHTML = App.furi(q.e); li.appendChild(e); }
          if (answered === doc.questions.length) {
            var sc = el("p", "score-line", right + " of " + doc.questions.length + (right === doc.questions.length ? " · 全問正解！" : right >= doc.questions.length * 0.7 ? " · よくできました" : " · read it once more"));
            ol.appendChild(sc);
            if (opts.onScore) opts.onScore(right, doc.questions.length);
          }
        });
        opts_.appendChild(b);
      });
      li.appendChild(opts_); ol.appendChild(li);
    });
    return ol;
  }

  // ---------- overlay ----------
  var reader, panel, bodyEl, isOpen = false;
  function build() {
    if (reader) return;
    reader = el("div", "reader"); reader.setAttribute("role", "dialog"); reader.setAttribute("aria-modal", "true"); reader.hidden = true;
    panel = el("div", "reader-panel");
    var top = el("div", "reader-top");
    top.appendChild(el("span", "grabber"));
    var close = el("button", "reader-close", "close"); close.type = "button"; close.addEventListener("click", function () { Reader.close(); });
    top.appendChild(close); panel.appendChild(top);
    // drag the sheet down to dismiss: it follows the finger, and a quick flick or a long pull lets it go
    var drag = null;
    top.addEventListener("pointerdown", function (e) {
      if (e.target === close) return;
      drag = { y0: e.clientY, y: e.clientY, t0: performance.now(), t: performance.now(), v: 0 };
      panel.classList.add("dragging"); panel.classList.remove("settling"); top.setPointerCapture(e.pointerId);
    });
    top.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var now = performance.now(), dy = Math.max(0, e.clientY - drag.y0);
      drag.v = (e.clientY - drag.y) / Math.max(1, now - drag.t); drag.y = e.clientY; drag.t = now;
      panel.style.transform = "translateY(" + dy + "px)";
      reader.style.setProperty("--dim", String(Math.max(0.2, 1 - dy / 600)));
      reader.style.opacity = Math.max(0.35, 1 - dy / 900);
    });
    function endDrag(e) {
      if (!drag) return;
      var dy = Math.max(0, e.clientY - drag.y0), fast = drag.v > 0.6, far = dy > panel.offsetHeight * 0.35;
      panel.classList.remove("dragging"); panel.classList.add("settling");
      if (fast || far) { panel.style.transform = "translateY(110%)"; reader.style.opacity = "0"; setTimeout(function () { Reader.close(true); panel.classList.remove("settling"); panel.style.transform = ""; reader.style.opacity = ""; }, 260); }
      else { panel.style.transform = ""; reader.style.opacity = ""; setTimeout(function () { panel.classList.remove("settling"); }, 560); }
      drag = null;
    }
    top.addEventListener("pointerup", endDrag); top.addEventListener("pointercancel", endDrag);
    bodyEl = el("div", "reader-body"); panel.appendChild(bodyEl); reader.appendChild(panel); document.body.appendChild(reader);
    reader.addEventListener("click", function (e) { if (e.target === reader) Reader.close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen) Reader.close(); });
  }
  var Reader = {
    body: body,
    open: function (doc, opts) {
      build(); bodyEl.innerHTML = ""; bodyEl.appendChild(body(doc, opts));
      reader.hidden = false; isOpen = true; document.body.classList.add("reader-open"); bodyEl.scrollTop = 0;
      panel.querySelector(".reader-close").focus();
    },
    close: function (instant) {
      if (!isOpen) return; isOpen = false; App.stopSpeaking();
      var finish = function () { reader.classList.remove("closing"); reader.hidden = true; bodyEl.innerHTML = ""; document.body.classList.remove("reader-open"); if (Reader.onClose) Reader.onClose(); };
      var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (instant || reduce) finish(); else { reader.classList.add("closing"); setTimeout(finish, 330); }
    },
    isOpen: function () { return isOpen; }
  };
  window.Reader = Reader;
})();
