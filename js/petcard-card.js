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
    var templateUrl = opts.templateUrl || "assets/petcard/template.png";
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

  // Back side of the card — drawn programmatically in the same Aadhaar-style
  // palette (saffron header, green footer): lost & found message, owner phone,
  // address, verification QR and the Pet ID number.
  function renderCardBack(canvas, data, opts) {
    opts = opts || {};
    canvas.width = TPL_W; canvas.height = TPL_H;
    var ctx = canvas.getContext("2d");

    // Base.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, TPL_W, TPL_H);

    // Saffron header band.
    var hdr = ctx.createLinearGradient(0, 0, TPL_W, 0);
    hdr.addColorStop(0, "#FF9933"); hdr.addColorStop(1, "#ffb35c");
    ctx.fillStyle = hdr;
    ctx.fillRect(0, 0, TPL_W, 118);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = '700 52px Poppins, Arial, sans-serif';
    ctx.fillText("PET AADHAAR CARD", TPL_W / 2, 48);
    ctx.font = '600 30px Poppins, Arial, sans-serif';
    ctx.fillText("Emily's Pet Heaven \u00b7 Barrackpore, Kolkata", TPL_W / 2, 90);

    // Green footer band.
    ctx.fillStyle = "#138808";
    ctx.fillRect(0, TPL_H - 92, TPL_W, 92);
    ctx.fillStyle = "#ffffff";
    ctx.font = '600 30px Poppins, Arial, sans-serif';
    ctx.fillText("emilyspetheaven.com  \u00b7  Novelty keepsake \u2014 not a government document", TPL_W / 2, TPL_H - 46);

    // Thin tricolor divider under the header.
    ctx.fillStyle = "#FFAE01"; ctx.fillRect(0, 118, TPL_W, 8);

    // Left column: lost & found message, phone, address.
    var LX = 80, RIGHT_EDGE = 1080;
    ctx.textAlign = "left";
    ctx.fillStyle = "#4E0000";
    ctx.font = '700 54px Poppins, Arial, sans-serif';
    ctx.fillText("If found, please help me get home!", LX, 210);

    ctx.fillStyle = "#8a6d3b";
    ctx.font = '600 32px Poppins, Arial, sans-serif';
    ctx.fillText("Call / WhatsApp my owner" + (data.owner ? " (" + data.owner + ")" : "") + ":", LX, 300);
    ctx.fillStyle = "#1a1a1a";
    ctx.font = '700 62px Poppins, Arial, sans-serif';
    ctx.fillText(data.phone || "\u2014", LX, 370);

    ctx.fillStyle = "#8a6d3b";
    ctx.font = '600 32px Poppins, Arial, sans-serif';
    ctx.fillText("Home address:", LX, 470);
    ctx.fillStyle = "#1a1a1a";
    ctx.font = '600 38px Poppins, "Noto Sans Devanagari", Arial, sans-serif';
    var addrLines = wrapLines(ctx, data.address || "\u2014", RIGHT_EDGE - LX).slice(0, 4);
    for (var i = 0; i < addrLines.length; i++) ctx.fillText(addrLines[i], LX, 530 + i * 52);

    // Pet name + breed line.
    ctx.fillStyle = "#4E0000";
    ctx.font = '700 40px Poppins, Arial, sans-serif';
    var petLine = (data.name || "") + (data.breed ? "  \u00b7  " + data.breed : "") + (data.gender ? "  \u00b7  " + data.gender : "");
    ctx.fillText(petLine, LX, 790);

    // Pet ID number.
    ctx.fillStyle = "#111111";
    ctx.font = '700 58px Poppins, Arial, sans-serif';
    ctx.fillText(data.petNo || "0000 0000 0000", LX, 870);

    // QR box on the right (mirrors the front's QR position).
    var qrUrl = opts.review ? SITE : data.verifyUrl;
    if (qrUrl) {
      var side = 306;
      var qx = 1166, qy = 300;
      ctx.strokeStyle = "#dcc89a"; ctx.lineWidth = 3;
      ctx.strokeRect(qx - 14, qy - 14, side + 28, side + 28);
      var qc = makeQRCanvas(qrUrl, side);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(qc, qx, qy, side, side);
      ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = "#8a6d3b";
      ctx.textAlign = "center";
      ctx.font = '600 28px Poppins, Arial, sans-serif';
      ctx.fillText("Scan to verify my identity", qx + side / 2, qy + side + 52);
      ctx.textAlign = "left";
    }

    return Promise.resolve(canvas);
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
