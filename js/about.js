// About page: settings, backup, and the kana tables.
(function () {
  "use strict";
  var el = App.el, h = App.h, esc = App.escape;
  var HIRA = "あ a,い i,う u,え e,お o,か ka,き ki,く ku,け ke,こ ko,さ sa,し shi,す su,せ se,そ so,た ta,ち chi,つ tsu,て te,と to,な na,に ni,ぬ nu,ね ne,の no,は ha,ひ hi,ふ fu,へ he,ほ ho,ま ma,み mi,む mu,め me,も mo,や ya,　 ,ゆ yu,　 ,よ yo,ら ra,り ri,る ru,れ re,ろ ro,わ wa,　 ,　 ,　 ,を o,ん n";
  var KATA = "ア a,イ i,ウ u,エ e,オ o,カ ka,キ ki,ク ku,ケ ke,コ ko,サ sa,シ shi,ス su,セ se,ソ so,タ ta,チ chi,ツ tsu,テ te,ト to,ナ na,ニ ni,ヌ nu,ネ ne,ノ no,ハ ha,ヒ hi,フ fu,ヘ he,ホ ho,マ ma,ミ mi,ム mu,メ me,モ mo,ヤ ya,　 ,ユ yu,　 ,ヨ yo,ラ ra,リ ri,ル ru,レ re,ロ ro,ワ wa,　 ,　 ,　 ,ヲ o,ン n";

  function table(id, src) {
    var t = document.getElementById(id); if (!t) return;
    src.split(",").forEach(function (cell) { var bits = cell.trim().split(" "); var d = el("div", null, bits[0] || ""); d.appendChild(el("small", null, bits[1] || "")); if (bits[0] && bits[0] !== "　") { d.classList.add("pointer"); d.setAttribute("role", "button"); d.tabIndex = 0; d.addEventListener("click", function () { App.say(bits[0], { rate: 0.8 }); }); } t.appendChild(d); });
  }
  table("hiragana", HIRA); table("katakana", KATA);

  App.ready().then(function () {
    var s = Store.progress.settings, box = document.getElementById("settings");
    box.innerHTML = "";
    var f1 = h('<label class="check"><input type="checkbox"> show furigana by default in articles</label>'); f1.querySelector("input").checked = s.furigana !== false;
    f1.querySelector("input").addEventListener("change", function (e) { s.furigana = e.target.checked; Store.save(); App.toast("saved"); });
    var f2 = h('<div class="field"><label>new cards per day (kanji and vocab each)</label><input type="number" min="0" max="100" class="w8"></div>'); f2.querySelector("input").value = s.newPerDay || 15;
    f2.querySelector("input").addEventListener("change", function (e) { s.newPerDay = Math.max(0, Math.min(100, Number(e.target.value) || 0)); Store.save(); App.toast("saved"); });
    var f3 = h('<div class="field"><label>voice speed</label><input type="range" min="0.6" max="1.3" step="0.05" class="w16"></div>'); f3.querySelector("input").value = s.rate || 0.9;
    f3.querySelector("input").addEventListener("change", function (e) { s.rate = Number(e.target.value); Store.save(); App.speak("こんにちは、これはテストです。", { rate: s.rate, voice: s.voice }).catch(function () { App.toast("no japanese voice on this device"); }); });
    var f4 = h('<label class="check"><input type="checkbox"> say flashcards aloud when they flip</label>'); f4.querySelector("input").checked = s.sayCards !== false;
    f4.querySelector("input").addEventListener("change", function (e) { s.sayCards = e.target.checked; Store.save(); App.toast("saved"); });
    var f5 = h('<label class="check"><input type="checkbox"> say the answer aloud after each quiz question</label>'); f5.querySelector("input").checked = s.sayAnswers !== false;
    f5.querySelector("input").addEventListener("change", function (e) { s.sayAnswers = e.target.checked; Store.save(); App.toast("saved"); });
    var f6 = h('<label class="check"><input type="checkbox"> adjust new cards per day automatically from how reviews go</label>'); f6.querySelector("input").checked = s.autoPace !== false;
    f6.querySelector("input").addEventListener("change", function (e) { s.autoPace = e.target.checked; Store.save(); App.toast("saved"); });
    box.appendChild(f1); box.appendChild(f4); box.appendChild(f5); box.appendChild(f2); box.appendChild(f6); box.appendChild(f3);
    var row = el("div", "btn-row");
    var ex = el("button", "btn small", "download a backup"); ex.type = "button";
    ex.addEventListener("click", function () {
      var blob = new Blob([Store.exportJSON()], { type: "application/json" });
      var a = el("a"); a.href = URL.createObjectURL(blob); a.download = "nihongo-" + Store.current.name.replace(/\s+/g, "-") + "-" + Store.dateKey() + ".json"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    row.appendChild(ex);
    var im = h('<label class="btn small quiet pointer">restore from a backup<input type="file" accept="application/json" class="sr"></label>');
    im.querySelector("input").addEventListener("change", function (ev) {
      var file = ev.target.files[0]; if (!file) return;
      if (!confirm("replace everything in this profile with the backup file?")) return;
      file.text().then(function (txt) { Store.importJSON(JSON.parse(txt)); App.toast("restored"); setTimeout(function () { location.reload(); }, 600); }).catch(function (e) { App.toast(e.message); });
    });
    row.appendChild(im);
    var lock = el("button", "btn small quiet", "lock this device"); lock.type = "button"; lock.addEventListener("click", function () { Store.save(true); Vault.lock(); location.href = "index.html"; }); row.appendChild(lock);
    if (Store.mode === "local") {
      var del = el("button", "btn small quiet", "delete this profile"); del.type = "button";
      del.addEventListener("click", function () { if (!confirm("delete the profile \"" + Store.current.name + "\" and all its progress from this browser? download a backup first if you want to keep it.")) return; Store.deleteProfile(Store.current.id); location.href = "index.html"; });
      row.appendChild(del);
    }
    box.appendChild(row);
    document.getElementById("storage-mode").textContent = Store.mode === "server" ? "this site is running with the study server, so your account and progress are saved on that computer and you can sign in from any device." : "this site is on a static host, so your profile and progress are saved inside this browser only. download a backup now and then, and use it to move to another device.";
  });
})();
