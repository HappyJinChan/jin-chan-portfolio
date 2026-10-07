// Weapon OP checker: runs the exported Random Forest (formula + RF hit efficiency) in the browser.
(function () {
  var M = window.WEAPON_MODEL;
  if (!M) return;

  var WEAPON = ["physical_damage", "crit_chance", "crit_multiplier", "bullets_per_shot",
    "time_between_shooting", "spread", "recoil_per_shooting", "recoil_control",
    "magazine_size", "reload_time", "bullet_speed"];
  var DIST = [10, 20, 50, 80], HP = [50, 150, 400], SPEED = [0, 10, 15];
  var LABELS = {
    physical_damage: "damage", crit_chance: "crit chance", crit_multiplier: "crit multiplier",
    bullets_per_shot: "pellets", time_between_shooting: "time between shots", spread: "spread",
    recoil_per_shooting: "recoil", recoil_control: "recoil control", magazine_size: "magazine",
    reload_time: "reload time", bullet_speed: "bullet speed"
  };

  function input(name) { return document.getElementById("f-" + name); }

  // Walk one tree (sklearn: go left when value <= threshold)
  function walk(t, x) {
    var feat = t[0], thr = t[1], left = t[2], right = t[3], val = t[4], n = 0;
    while (left[n] !== -1) n = (x[feat[n]] <= thr[n]) ? left[n] : right[n];
    return val[n];
  }

  // Standard DPS formula used by the bot (two weapons, one per hand)
  function formulaDps(w) {
    var crit = Math.min(1, Math.max(0, w.crit_chance));
    var mult = Math.max(1, w.crit_multiplier);
    var expected = w.physical_damage * (1 + crit * (mult - 1));
    return expected * Math.max(1, w.bullets_per_shot) / Math.max(0.01, w.time_between_shooting) * 2;
  }

  function predictLogDps(w, dist, hp, speed, logFormula) {
    var x = [dist, hp, speed];
    for (var i = 0; i < WEAPON.length; i++) x.push(w[WEAPON[i]]);
    var sum = 0;
    for (var k = 0; k < M.trees.length; k++) sum += walk(M.trees[k], x);
    return logFormula + sum / M.trees.length;
  }

  function fmtTime(s) {
    if (s >= 30) return "30 s+";
    if (s < 1) return s.toFixed(2) + " s";
    return s.toFixed(1) + " s";
  }

  function run() {
    var w = {}, missing = false;
    for (var i = 0; i < WEAPON.length; i++) {
      var v = parseFloat(input(WEAPON[i]).value);
      if (isNaN(v)) missing = true;
      w[WEAPON[i]] = v;
    }
    var rows = document.getElementById("wb-rows");
    var label = document.getElementById("wb-verdict-label");
    var text = document.getElementById("wb-verdict-text");
    var box = document.getElementById("wb-verdict");
    if (missing) {
      rows.innerHTML = "";
      label.textContent = "—";
      text.textContent = "Fill in every stat to get a prediction.";
      box.className = "verdict";
      return;
    }

    var dps = formulaDps(w);
    var logF = Math.log(Math.max(dps, 1e-6));
    var fastCount = 0, html = "";

    for (var d = 0; d < DIST.length; d++) {
      var relSum = 0, ttkSum = 0;
      for (var h = 0; h < HP.length; h++) {
        for (var s = 0; s < SPEED.length; s++) {
          var p = predictLogDps(w, DIST[d], HP[h], SPEED[s], logF);
          relSum += p - M.ref[DIST[d] + "_" + HP[h] + "_" + SPEED[s]];
          if (HP[h] === 150) ttkSum += 150 / Math.exp(p);
        }
      }
      var ratio = Math.exp(-relSum / 9);          // kill time / typical kill time
      var ttk = ttkSum / SPEED.length;
      var fast = ratio <= 0.7;
      if (fast) fastCount++;
      var pct = Math.round(ratio * 100);
      html += "<tr><td>" + DIST[d] + " m</td><td>" + fmtTime(ttk) + "</td><td>" + pct + "% of typical time</td><td>" +
        (fast ? '<span class="pill pill-a">Yes</span>' : '<span class="pill pill-c">No</span>') + "</td></tr>";
    }
    rows.innerHTML = html;

    var op = fastCount >= 3;
    label.textContent = op ? "OP" : "Balanced";
    text.textContent = op
      ? "Fast at " + fastCount + " of 4 distances: this weapon would dominate almost every fight."
      : "Fast at " + fastCount + " of 4 distances (OP needs 3).";
    box.className = "verdict " + (op ? "is-op" : "is-ok");

    document.getElementById("wb-formula").textContent =
      "DPS formula for this pair of weapons: " + Math.round(dps) + " damage per second, assuming every bullet hits.";

    // Warn when a stat is outside what the bot ever tested
    var out = [];
    for (var j = 0; j < WEAPON.length; j++) {
      var r = M.ranges[WEAPON[j]], val = w[WEAPON[j]];
      if (val < r[0] * 0.98 || val > r[1] * 1.02) out.push(LABELS[WEAPON[j]]);
    }
    if (w.bullets_per_shot !== 1 && w.bullets_per_shot !== 8) out.push("pellets (only 1 or 8 were tested)");
    document.getElementById("wb-warn").textContent = out.length
      ? "Outside the tested range, so treat this as a rough guess: " + out.join(", ") + "."
      : "";
  }

  function setPreset(name) {
    var b = M.baselines[name];
    if (!b) return;
    for (var i = 0; i < WEAPON.length; i++) input(WEAPON[i]).value = b[WEAPON[i]];
    run();
  }

  var buttons = document.querySelectorAll("[data-preset]");
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener("click", function () { setPreset(this.getAttribute("data-preset")); });
  }
  for (var k = 0; k < WEAPON.length; k++) input(WEAPON[k]).addEventListener("input", run);
  setPreset("Assault Rifle");
})();
