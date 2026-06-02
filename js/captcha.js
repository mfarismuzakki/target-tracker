/* =====================================================================
   CAPTCHA geser (slider puzzle) ala Genshin — anti-bot di halaman login.
   Tanpa gambar eksternal: background digambar di canvas (jalan offline).
   Pemakaian:
     const cap = Captcha.mount(elemen, { onSuccess: fn, onReset: fn });
     cap.isSolved(); cap.reset();
   ===================================================================== */
(function () {
  "use strict";

  var W = 300, H = 180;   // ukuran canvas
  var L = 44,  R = 9;     // sisi potongan puzzle & radius knob
  var PMAX = W - L - R - 6;
  var TOL = 6;            // toleransi (px) agar dianggap pas

  // Path potongan puzzle klasik (bump atas & kanan, takik kiri)
  function puzzlePath(ctx, x, y) {
    var PI = Math.PI;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x + L / 2, y - R + 2, R, 0.72 * PI, 2.26 * PI);
    ctx.lineTo(x + L, y);
    ctx.arc(x + L + R - 2, y + L / 2, R, 1.21 * PI, 2.78 * PI);
    ctx.lineTo(x + L, y + L);
    ctx.lineTo(x, y + L);
    ctx.arc(x + R - 2, y + L / 2, R, 2.76 * PI, 1.24 * PI, true);
    ctx.lineTo(x, y);
    ctx.closePath();
  }

  function paintBackground(octx) {
    var hue = Math.floor(Math.random() * 360);
    var g = octx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "hsl(" + hue + ",60%,52%)");
    g.addColorStop(1, "hsl(" + ((hue + 55) % 360) + ",62%,42%)");
    octx.fillStyle = g;
    octx.fillRect(0, 0, W, H);
    for (var i = 0; i < 7; i++) {
      octx.beginPath();
      octx.fillStyle = "hsla(" + Math.floor(Math.random() * 360) + ",75%,72%,0.35)";
      octx.arc(Math.random() * W, Math.random() * H, 18 + Math.random() * 42, 0, Math.PI * 2);
      octx.fill();
    }
    octx.fillStyle = "rgba(255,255,255,0.22)";
    octx.font = "bold 30px system-ui, sans-serif";
    octx.fillText("TARGET", 18, H - 22);
  }

  var Captcha = {
    mount: function (host, opts) {
      opts = opts || {};
      host.innerHTML =
        '<div class="cap">' +
          '<div class="cap-stage">' +
            '<canvas class="cap-canvas" width="' + W + '" height="' + H + '"></canvas>' +
            '<button type="button" class="cap-refresh" title="Ganti gambar" aria-label="Ganti gambar">⟳</button>' +
            '<div class="cap-status"></div>' +
          '</div>' +
          '<div class="cap-slider">' +
            '<div class="cap-fill"></div>' +
            '<div class="cap-tip">Geser untuk melengkapi gambar →</div>' +
            '<div class="cap-handle" role="slider" tabindex="0" aria-label="Geser untuk verifikasi">»</div>' +
          '</div>' +
        '</div>';

      var cap = host.querySelector(".cap");
      var canvas = host.querySelector(".cap-canvas");
      var ctx = canvas.getContext("2d");
      var slider = host.querySelector(".cap-slider");
      var handle = host.querySelector(".cap-handle");
      var fill = host.querySelector(".cap-fill");
      var tip = host.querySelector(".cap-tip");
      var status = host.querySelector(".cap-status");
      var refresh = host.querySelector(".cap-refresh");

      var off = document.createElement("canvas");
      off.width = W; off.height = H;
      var octx = off.getContext("2d");

      var gx, gy, pieceX, solved, dragging, startX, startHandle;

      function handleMax() { return slider.clientWidth - handle.offsetWidth; }

      function draw() {
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(off, 0, 0);
        // lubang (gap)
        ctx.save();
        puzzlePath(ctx, gx, gy);
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
        // potongan yang bergerak
        ctx.save();
        puzzlePath(ctx, pieceX, gy);
        ctx.clip();
        ctx.drawImage(off, pieceX - gx, 0);
        ctx.restore();
        // bingkai potongan
        ctx.save();
        puzzlePath(ctx, pieceX, gy);
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
      }

      function reset() {
        solved = false; dragging = false;
        cap.classList.remove("ok", "err");
        paintBackground(octx);
        var minG = 70, maxG = PMAX;
        gx = Math.floor(minG + Math.random() * (maxG - minG));
        gy = Math.floor(15 + Math.random() * (H - L - 30));
        pieceX = 0;
        handle.style.left = "0px";
        fill.style.width = "0px";
        tip.style.opacity = "1";
        status.textContent = "";
        draw();
        if (opts.onReset) opts.onReset();
      }

      function moveTo(px) {
        var max = handleMax();
        px = Math.max(0, Math.min(max, px));
        handle.style.left = px + "px";
        fill.style.width = px + "px";
        pieceX = (max > 0 ? px / max : 0) * PMAX;
        draw();
      }

      function onDown(e) {
        if (solved) return;
        dragging = true;
        try { handle.setPointerCapture(e.pointerId); } catch (_) {}
        startX = e.clientX;
        startHandle = parseFloat(handle.style.left) || 0;
        tip.style.opacity = "0";
        cap.classList.remove("err");
      }
      function onMove(e) {
        if (!dragging) return;
        moveTo(startHandle + (e.clientX - startX));
      }
      function onUp() {
        if (!dragging) return;
        dragging = false;
        if (Math.abs(pieceX - gx) <= TOL) {
          solved = true;
          pieceX = gx;
          var max = handleMax();
          var px = (gx / PMAX) * max;
          handle.style.left = px + "px";
          fill.style.width = px + "px";
          draw();
          cap.classList.add("ok");
          status.textContent = "✓ Terverifikasi";
          if (opts.onSuccess) opts.onSuccess();
        } else {
          cap.classList.add("err");
          status.textContent = "Kurang pas, coba lagi";
          setTimeout(reset, 600);
        }
      }

      handle.addEventListener("pointerdown", onDown);
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
      refresh.addEventListener("click", reset);

      reset();
      return {
        reset: reset,
        isSolved: function () { return !!solved; },
      };
    },
  };

  window.Captcha = Captcha;
})();
