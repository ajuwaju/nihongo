// The notes drawer: numbered index cards filed behind letter tabs.
(function () {
  "use strict";
  var el = App.el, h = App.h, esc = App.escape;
  var cabinet = document.getElementById("cabinet"), sheet = document.getElementById("sheet"), search = document.getElementById("search"), sortBtn = document.getElementById("sort");
  var selected = null, byNumber = false, saveTimer = null;
  var ROWS = ["あ", "か", "さ", "た", "な", "は", "ま", "や", "ら", "わ"];
  var KANA = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん";

  App.ready().then(function () {
    document.getElementById("new-note").addEventListener("click", function () {
      var n = Store.addNote({ title: "", body: "" }); selected = n.id; render(); focusTitle();
    });
    search.addEventListener("input", render);
    sortBtn.addEventListener("click", function () { byNumber = !byNumber; sortBtn.setAttribute("aria-pressed", String(byNumber)); sortBtn.textContent = byNumber ? "sort by letter" : "sort by number"; render(); });
    var id = location.hash.slice(1);
    if (id && Store.progress.notes.some(function (n) { return n.id === id; })) selected = id;
    render(); if (id) focusTitle();
  });

  function section(title) {
    var c = (title || "").trim().charAt(0);
    if (!c) return "・";
    if (/[a-z]/i.test(c)) return c.toUpperCase();
    if (/[0-9０-９]/.test(c)) return "#";
    var code = c.charCodeAt(0);
    if (code >= 0x30a1 && code <= 0x30f6) c = String.fromCharCode(code - 0x60); // katakana to hiragana
    c = c.replace(/[ぁぃぅぇぉっゃゅょ]/, function (x) { return { "ぁ": "あ", "ぃ": "い", "ぅ": "う", "ぇ": "え", "ぉ": "お", "っ": "つ", "ゃ": "や", "ゅ": "ゆ", "ょ": "よ" }[x]; });
    c = c.replace(/[がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ]/, function (x) { return String.fromCharCode(x.charCodeAt(0) - (/[ぱぴぷぺぽ]/.test(x) ? 2 : 1)); });
    var i = KANA.indexOf(c);
    if (i !== -1) return ROWS[Math.min(9, Math.floor(i / 5))];
    if (/[一-鿿]/.test(c)) return "漢";
    return "・";
  }

  function render() {
    var notes = Store.progress.notes.slice(), q = search.value.trim().toLowerCase();
    if (q) notes = notes.filter(function (n) { return (n.title + " " + n.body + " " + n.tags.join(" ")).toLowerCase().indexOf(q) !== -1; });
    cabinet.innerHTML = "";
    var drawer = el("div", "drawer"), folders = el("div", "folders"), rows = [];
    if (byNumber) {
      notes.sort(function (a, b) { return a.num - b.num; });
      notes.forEach(function (n) { rows.push({ note: n }); });
    } else {
      notes.sort(function (a, b) { return (a.title || "~").localeCompare(b.title || "~", "ja"); });
      var groups = {};
      notes.forEach(function (n) { var s = section(n.title); (groups[s] = groups[s] || []).push(n); });
      var order = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, "ja"); });
      order.forEach(function (s) { rows.push({ divider: s, count: groups[s].length }); groups[s].forEach(function (n) { rows.push({ note: n }); }); });
    }
    if (!rows.length) {
      for (var i = 0; i < 6; i++) { var f = el("div", "folder empty"); f.style.setProperty("--p", i / 5); folders.appendChild(f); }
      drawer.appendChild(folders);
      drawer.appendChild(front());
      cabinet.appendChild(drawer);
      cabinet.appendChild(h('<p class="empty-note hand">the drawer is empty. press "new card", or send a kanji or grammar point here.</p>'));
      return;
    }
    var total = rows.length, slot = 0;
    rows.forEach(function (r, i) {
      var f = el("button", "folder" + (r.divider ? " divider" : "")); f.type = "button";
      f.style.setProperty("--p", total > 1 ? i / (total - 1) : 1);
      var tab = el("span", "tab");
      if (r.divider) {
        tab.style.setProperty("--x", "4%");
        tab.appendChild(el("span", null, r.divider)); tab.appendChild(el("span", "num", String(r.count).padStart(3, "0")));
        f.addEventListener("click", function () { search.value = ""; });
      } else {
        tab.style.setProperty("--x", slot++ % 2 ? "57%" : "30%");
        tab.appendChild(el("span", "num", String(r.note.num).padStart(3, "0")));
        var t = el("span", "tt" + (/[぀-ヿ一-鿿]/.test(r.note.title) ? " jp" : ""), r.note.title || "untitled"); tab.appendChild(t);
        if (selected === r.note.id) f.classList.add("selected");
        f.addEventListener("click", function () { selected = r.note.id; history.replaceState(null, "", "#" + r.note.id); render(); });
      }
      f.appendChild(tab); folders.appendChild(f);
    });
    drawer.appendChild(folders); drawer.appendChild(front());
    cabinet.appendChild(drawer);
    renderSheet();
  }

  function front() {
    var d = el("div", "drawer-front");
    var plate = el("span", "plate"); plate.innerHTML = esc(Store.current.name) + "'s notes <span class=\"jp\">· " + Store.progress.notes.length + "枚</span>";
    d.appendChild(plate); return d;
  }

  function renderSheet() {
    sheet.innerHTML = "";
    var note = Store.progress.notes.filter(function (n) { return n.id === selected; })[0];
    if (!note) { sheet.appendChild(h('<p class="hand mt40">pull a card from the drawer to read it, or make a new one.</p>')); return; }
    var card = el("div", "note-sheet");
    card.appendChild(h('<span class="tape"></span>'));
    card.appendChild(el("span", "note-num", "card " + String(note.num).padStart(3, "0") + " · " + App.fmtDate(note.updated)));
    if (note.link) { var lk = el("p", "linked"); lk.innerHTML = "filed from <a href=\"" + esc(note.link.href || "#") + "\">" + esc(note.link.label || note.link.kind) + "</a>"; card.appendChild(lk); }
    var ft = h('<div class="field"><label>title</label><input maxlength="80" placeholder="what is this card about"></div>');
    var fb = h('<div class="field"><label>the note</label><textarea placeholder="write it the way you would explain it to yourself"></textarea></div>');
    var fg = h('<div class="field"><label>tags (comma separated)</label><input placeholder="grammar, n4, particles"></div>');
    var ti = ft.querySelector("input"), bo = fb.querySelector("textarea"), tg = fg.querySelector("input");
    ti.value = note.title; bo.value = note.body; tg.value = note.tags.join(", ");
    if (/[぀-ヿ一-鿿]/.test(note.body)) bo.classList.add("jp");
    function save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        Store.updateNote(note.id, { title: ti.value.trim(), body: bo.value, tags: tg.value.split(",").map(function (x) { return x.trim(); }).filter(Boolean) });
        var f = cabinet.querySelector(".folder.selected .tt"); if (f) f.textContent = ti.value.trim() || "untitled";
      }, 400);
    }
    [ti, bo, tg].forEach(function (x) { x.addEventListener("input", save); });
    ti.addEventListener("change", function () { save(); setTimeout(render, 450); });
    card.appendChild(ft); card.appendChild(fb); card.appendChild(fg);
    var tags = el("div", "note-tags"); note.tags.forEach(function (t) { tags.appendChild(el("span", "pill", t)); }); card.appendChild(tags);
    var row = el("div", "btn-row");
    var speak = el("button", "btn small quiet", "read aloud"); speak.type = "button"; speak.addEventListener("click", function () { App.speak(bo.value.slice(0, 400), { rate: Store.progress.settings.rate }).catch(function () { App.toast("no japanese voice"); }); }); row.appendChild(speak);
    var del = el("button", "btn small quiet", "tear it up"); del.type = "button";
    del.addEventListener("click", function () { if (!confirm("tear up this card? there is no undo.")) return; Store.deleteNote(note.id); selected = null; history.replaceState(null, "", location.pathname); render(); });
    row.appendChild(del);
    var close = el("button", "btn small", "put it back"); close.type = "button"; close.addEventListener("click", function () { selected = null; history.replaceState(null, "", location.pathname); render(); }); row.appendChild(close);
    card.appendChild(row);
    sheet.appendChild(card);
  }
  function focusTitle() { setTimeout(function () { var i = sheet.querySelector("input"); if (i) i.focus(); }, 60); }
})();
