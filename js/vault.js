// The lock. Content files in data/ are encrypted by scripts/build.py; this file
// turns the site password into the keys and decrypts them in the browser.
// Nothing leaves the browser: the only requests are for this site's own data files.
(function () {
  "use strict";

  var KEY_SESSION = "nihongo.key";
  var lockInfo = null;
  var keysCache = null;
  var sections = {};
  var textDecoder = new TextDecoder();

  function b64decode(s) {
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function b64encode(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function getStored(name) {
    try { return sessionStorage.getItem(name) || localStorage.getItem(name); } catch (e) { return null; }
  }

  function status() {
    if (lockInfo) return Promise.resolve(lockInfo);
    return fetch("data/lock.json", { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("no lock.json: run python3 scripts/build.py");
      return r.json();
    }).then(function (j) { lockInfo = j; return j; });
  }

  function derive(password, saltBytes, iterations) {
    return crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"])
      .then(function (base) {
        return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: iterations }, base, 512);
      }).then(function (bits) { return new Uint8Array(bits); });
  }

  function importKeys(raw) {
    var enc = crypto.subtle.importKey("raw", raw.slice(0, 32), { name: "AES-CBC" }, false, ["decrypt"]);
    var mac = crypto.subtle.importKey("raw", raw.slice(32, 64), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    return Promise.all([enc, mac]).then(function (k) { return { enc: k[0], mac: k[1], raw: raw }; });
  }

  function openBlob(keys, bytes) {
    var iv = bytes.slice(0, 16), ct = bytes.slice(16, bytes.length - 32), tag = bytes.slice(bytes.length - 32);
    var signed = new Uint8Array(16 + ct.length);
    signed.set(iv, 0); signed.set(ct, 16);
    return crypto.subtle.verify("HMAC", keys.mac, tag, signed).then(function (ok) {
      if (!ok) throw new Error("wrong password");
      return crypto.subtle.decrypt({ name: "AES-CBC", iv: iv }, keys.enc, ct);
    }).then(function (plain) { return new Uint8Array(plain); });
  }

  function gunzip(bytes) {
    if (typeof DecompressionStream === "undefined") return Promise.reject(new Error("this browser is too old to open the study files; please update it"));
    var ds = new DecompressionStream("gzip");
    var writer = ds.writable.getWriter();
    writer.write(bytes); writer.close();
    return new Response(ds.readable).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
  }

  function loadKeys() {
    if (keysCache) return Promise.resolve(keysCache);
    var stored = getStored(KEY_SESSION);
    if (!stored) return Promise.resolve(null);
    return importKeys(b64decode(stored)).then(function (k) { keysCache = k; return k; }).catch(function () { return null; });
  }

  function hasKey() {
    return status().then(function (lock) {
      if (lock.mode === "open") return true;
      return loadKeys().then(function (k) { return !!k; });
    });
  }

  function unlock(password, remember) {
    return status().then(function (lock) {
      if (lock.mode === "open") return true;
      return derive(password, b64decode(lock.salt), lock.iterations).then(importKeys).then(function (keys) {
        return openBlob(keys, b64decode(lock.check)).then(function (plain) {
          if (textDecoder.decode(plain) !== "nihongo-ok") throw new Error("wrong password");
          keysCache = keys;
          var packed = b64encode(keys.raw);
          try {
            sessionStorage.setItem(KEY_SESSION, packed);
            if (remember) localStorage.setItem(KEY_SESSION, packed); else localStorage.removeItem(KEY_SESSION);
          } catch (e) { /* storage blocked: the key lives in memory for this page only */ }
          return true;
        });
      });
    });
  }

  function lock() {
    keysCache = null; sections = {};
    try { sessionStorage.removeItem(KEY_SESSION); localStorage.removeItem(KEY_SESSION); } catch (e) { /* fine */ }
  }

  function load(name) {
    if (sections[name]) return sections[name];
    sections[name] = status().then(function (lock) {
      if (lock.mode === "open") {
        return fetch("data/" + name + ".json", { cache: "no-cache" }).then(function (r) { return r.json(); });
      }
      return Promise.all([loadKeys(), fetch("data/" + name + ".enc").then(function (r) {
        if (!r.ok) throw new Error("missing data/" + name + ".enc");
        return r.arrayBuffer();
      })]).then(function (res) {
        if (!res[0]) throw new Error("locked");
        return openBlob(res[0], new Uint8Array(res[1]));
      }).then(function (plain) { return lock.gzip ? gunzip(plain) : plain; })
        .then(function (bytes) { return JSON.parse(textDecoder.decode(bytes)); });
    }).catch(function (e) { delete sections[name]; throw e; });
    return sections[name];
  }

  window.Vault = { status: status, hasKey: hasKey, unlock: unlock, lock: lock, load: load };
})();
