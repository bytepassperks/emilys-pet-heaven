/* Pet Aadhaar Card — shared renderer.
   Draws the pet photo, fields, QR code and Pet ID number on top of the exact
   card template image so the on-screen preview, the admin output and the
   printed/laminated card are pixel-identical. */
(function () {
  "use strict";

  var API_BASE = "https://emilys-ai-vet.emilys-pet-heaven.workers.dev";
  var WHATSAPP = "919830802898"; // Emily's Pet Heaven WhatsApp (orders)
  var SITE = "https://emilyspetheaven.com";

  // Natural template size and element coordinates (measured on template.png).
  var TPL_W = 1536, TPL_H = 1024;
  var PHOTO = { x: 65, y: 335, w: 430, h: 470, r: 28 };
  var QR = { x: 1166, y: 446, w: 306, h: 318 };
  var VALUE_X = 745;
  var ROWS = { name: 378, owner: 455, breed: 530, gender: 607, dob: 682, address: 757 };
  var IDBOX = { x: 420, y: 910, w: 695, h: 75 };

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("Image load failed: " + src)); };
      img.src = src;
    });
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Draw an image so it covers the box (object-fit: cover), centered.
  function drawCover(ctx, img, x, y, w, h) {
    var ir = img.width / img.height, br = w / h, sx, sy, sw, sh;
    if (ir > br) { sh = img.height; sw = sh * br; sx = (img.width - sw) / 2; sy = 0; }
    else { sw = img.width; sh = sw / br; sx = 0; sy = (img.height - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  function wrapLines(ctx, text, maxWidth) {
    var words = String(text).split(/\s+/), lines = [], line = "";
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = words[i]; }
      else { line = test; }
    }
    if (line) lines.push(line);
    return lines;
  }

  // Build a QR code canvas (black modules on white) for the given text.
  function makeQRCanvas(text, sizePx) {
    var qr = qrcode(0, "M"); // auto type, medium error correction
    qr.addData(String(text));
    qr.make();
    var count = qr.getModuleCount();
    var quiet = 2; // quiet-zone modules
    var total = count + quiet * 2;
    var cell = Math.floor(sizePx / total);
    var dim = cell * total;
    var c = document.createElement("canvas");
    c.width = dim; c.height = dim;
    var x = c.getContext("2d");
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, dim, dim);
    x.fillStyle = "#000000";
    for (var r = 0; r < count; r++) {
      for (var col = 0; col < count; col++) {
        if (qr.isDark(r, col)) {
          x.fillRect((col + quiet) * cell, (r + quiet) * cell, cell, cell);
        }
      }
    }
    return c;
  }

  function field(ctx, value, y, maxWidth) {
    if (!value) return;
    ctx.fillStyle = "#1a1a1a";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = '600 38px Poppins, "Noto Sans Devanagari", Arial, sans-serif';
    var lines = wrapLines(ctx, value, maxWidth);
    if (lines.length <= 1) {
      ctx.fillText(lines[0] || "", VALUE_X, y, maxWidth);
    } else {
      lines = lines.slice(0, 2);
      var lh = 42, startY = y - lh / 2;
      for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], VALUE_X, startY + i * lh, maxWidth);
    }
  }

  // Pixelate a rectangular region of the canvas (used to blur the Pet ID on
  // review copies shared before payment).
  function pixelate(ctx, x, y, w, h, factor) {
    factor = factor || 14;
    var tmp = document.createElement("canvas");
    var tw = Math.max(1, Math.round(w / factor)), th = Math.max(1, Math.round(h / factor));
    tmp.width = tw; tmp.height = th;
    var tctx = tmp.getContext("2d");
    tctx.imageSmoothingEnabled = true;
    tctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, tw, th);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, tw, th, x, y, w, h);
    ctx.imageSmoothingEnabled = true;
  }

  // data: {name,owner,breed,gender,dob,address,petNo,photoUrl,verifyUrl}
  // opts: {templateUrl, review} — review=true blurs the Pet ID and points the
  // QR at the website homepage instead of the verification page.
  function renderCard(canvas, data, opts) {
    opts = opts || {};
    var templateUrl = opts.templateUrl || "assets/petcard/template.png?v=5";
    canvas.width = TPL_W; canvas.height = TPL_H;
    var ctx = canvas.getContext("2d");

    return loadImage(templateUrl).then(function (tpl) {
      ctx.clearRect(0, 0, TPL_W, TPL_H);
      ctx.drawImage(tpl, 0, 0, TPL_W, TPL_H);

      // Fields (Address kept clear of the QR column).
      field(ctx, data.name, ROWS.name, 760);
      field(ctx, data.owner, ROWS.owner, 760);
      field(ctx, data.breed, ROWS.breed, 760);
      field(ctx, data.gender, ROWS.gender, 760);
      field(ctx, data.dob, ROWS.dob, 760);
      field(ctx, data.address, ROWS.address, 385);

      // Pet ID number, centered in the bottom box.
      if (data.petNo) {
        ctx.fillStyle = "#111111";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = '700 52px Poppins, Arial, sans-serif';
        ctx.fillText(data.petNo, IDBOX.x + IDBOX.w / 2, IDBOX.y + IDBOX.h / 2 + 2, IDBOX.w - 20);
      }

      // QR code (right box) — only when we have a verify URL.
      var qrUrl = opts.review ? SITE : data.verifyUrl;
      if (qrUrl) {
        var side = Math.min(QR.w, QR.h);
        var qx = QR.x + (QR.w - side) / 2, qy = QR.y + (QR.h - side) / 2;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(qx, qy, side, side);
        var qc = makeQRCanvas(qrUrl, side);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(qc, qx, qy, side, side);
        ctx.imageSmoothingEnabled = true;
      }

      if (opts.review && data.petNo) {
        pixelate(ctx, IDBOX.x, IDBOX.y, IDBOX.w, IDBOX.h, 16);
      }

      // Pet photo (left box, rounded, cover).
      var photoTasks = Promise.resolve();
      if (data.photoUrl) {
        photoTasks = loadImage(data.photoUrl).then(function (pimg) {
          ctx.save();
          roundRectPath(ctx, PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h, PHOTO.r);
          ctx.clip();
          drawCover(ctx, pimg, PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h);
          ctx.restore();
        }).catch(function () { /* keep placeholder box on failure */ });
      }
      return photoTasks.then(function () { return canvas; });
    });
  }

  // Downscale + compress a user-selected photo file to a small data URL for storage.
  function fileToCompressedDataURL(file, maxDim, quality) {
    maxDim = maxDim || 600; quality = quality || 0.82;
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          var c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Back side of the card — drawn on the back template image (saffron header,
  // green footer, blank value areas): owner phone, address, verification QR,
  // pet name and Pet ID.
  function renderCardBack(canvas, data, opts) {
    opts = opts || {};
    var templateUrl = opts.templateUrl || "assets/petcard/template-back.png?v=5";
    canvas.width = TPL_W; canvas.height = TPL_H;
    var ctx = canvas.getContext("2d");

    return loadImage(templateUrl).then(function (tpl) {
      ctx.clearRect(0, 0, TPL_W, TPL_H);
      ctx.drawImage(tpl, 0, 0, TPL_W, TPL_H);

      var LX = 80;
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";

      // Phone (below the "Call / WhatsApp my owner:" label).
      ctx.fillStyle = "#1a1a1a";
      ctx.font = '700 58px Poppins, Arial, sans-serif';
      ctx.fillText(data.phone || "\u2014", LX, 415);

      // Address (below the "Home address:" label, up to 3 lines).
      ctx.font = '600 38px Poppins, "Noto Sans Devanagari", Arial, sans-serif';
      var addrLines = wrapLines(ctx, data.address || "\u2014", 880).slice(0, 3);
      for (var i = 0; i < addrLines.length; i++) ctx.fillText(addrLines[i], LX, 528 + i * 52);

      // Pet name (on the first underline) and Pet ID (on the second).
      ctx.textAlign = "center";
      ctx.fillStyle = "#4E0000";
      ctx.font = '700 42px Poppins, Arial, sans-serif';
      var petLine = (data.name || "") + (data.breed ? "  \u00b7  " + data.breed : "") + (data.gender ? "  \u00b7  " + data.gender : "");
      ctx.fillText(petLine, 417, 736, 480);
      ctx.fillStyle = "#111111";
      ctx.font = '700 54px Poppins, Arial, sans-serif';
      ctx.fillText(data.petNo || "0000 0000 0000", 417, 828, 480);

      // QR inside the bordered box on the right (box ~1046..1446 x 296..722).
      var qrUrl = opts.review ? SITE : data.verifyUrl;
      if (qrUrl) {
        var side = 360;
        var qx = 1046 + (400 - side) / 2, qy = 296 + (426 - side) / 2;
        var qc = makeQRCanvas(qrUrl, side);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(qc, qx, qy, side, side);
        ctx.imageSmoothingEnabled = true;
      }

      return canvas;
    });
  }

  function verifyUrlFor(id) { return SITE + "/pet/?id=" + encodeURIComponent(id); }

  window.PetCard = {
    API_BASE: API_BASE,
    WHATSAPP: WHATSAPP,
    SITE: SITE,
    renderCard: renderCard,
    renderCardBack: renderCardBack,
    makeQRCanvas: makeQRCanvas,
    loadImage: loadImage,
    fileToCompressedDataURL: fileToCompressedDataURL,
    verifyUrlFor: verifyUrlFor,
  };
})();
