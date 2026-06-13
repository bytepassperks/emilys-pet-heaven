/*!
 * Emily's Pet Heaven — AI Vet chat widget
 * Free, multilingual (English / Hindi / Bengali) pet-care assistant.
 * Talks to a Cloudflare Worker (Workers AI + RAG). Self-contained, no dependencies.
 */
(function () {
  "use strict";
  if (window.__aiVetLoaded) return;
  window.__aiVetLoaded = true;

  var ENDPOINT = "https://emilys-ai-vet.emilys-pet-heaven.workers.dev/chat";

  var DISCLAIMER =
    "AI assistant — not a real vet. General advice only; for anything serious, please see a vet.";
  var GREETING =
    "Hi! I'm the AI Vet for Emily's Pet Heaven 🐾\nAsk me anything about your dog or cat — or our services, prices and timings. You can write in English, हिंदी or বাংলা.\n\n(I'm an AI, not a real vet — this is general advice only.)";
  var SUGGESTIONS = [
    "Dog boarding price?",
    "My dog is vomiting",
    "Grooming charges",
    "কুকুরের ভ্যাকসিন কখন?",
  ];

  var history = [];
  var busy = false;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var css =
    "" +
    "#aivet-launcher{position:fixed;left:20px;bottom:20px;z-index:99998;display:flex;align-items:center;gap:10px;background:#4e0000;color:#fff;border:none;border-radius:500px;padding:12px 18px 12px 14px;box-shadow:0 6px 22px rgba(0,0,0,.28);cursor:pointer;font-family:'Poppins',system-ui,sans-serif;font-size:15px;font-weight:600;transition:transform .25s ease,box-shadow .25s ease}" +
    "#aivet-launcher:hover{transform:translateY(-2px);box-shadow:0 10px 28px rgba(0,0,0,.35)}" +
    "#aivet-launcher .aivet-ic{width:30px;height:30px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;background:#ffae01;color:#4e0000;border-radius:50%;font-size:17px}" +
    "#aivet-launcher .aivet-dot{position:absolute;top:8px;left:34px;width:9px;height:9px;background:#10b981;border:2px solid #4e0000;border-radius:50%}" +
    "#aivet-panel{position:fixed;left:20px;bottom:20px;z-index:99999;width:370px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 40px);background:#fff;border-radius:20px;box-shadow:0 18px 60px rgba(0,0,0,.32);display:none;flex-direction:column;overflow:hidden;font-family:'Poppins',system-ui,sans-serif}" +
    "#aivet-panel.aivet-open{display:flex;animation:aivetIn .22s ease}" +
    "@keyframes aivetIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}" +
    "#aivet-head{background:#4e0000;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}" +
    "#aivet-head .aivet-av{width:38px;height:38px;border-radius:50%;background:#ffae01;color:#4e0000;display:flex;align-items:center;justify-content:center;font-size:20px;flex:0 0 auto}" +
    "#aivet-head h4{margin:0;font-size:15px;font-weight:700;font-family:'Fredoka','Poppins',sans-serif}" +
    "#aivet-head p{margin:1px 0 0;font-size:11.5px;opacity:.85}" +
    "#aivet-close{margin-left:auto;background:transparent;border:none;color:#fff;font-size:22px;line-height:1;cursor:pointer;opacity:.85;padding:4px}" +
    "#aivet-close:hover{opacity:1}" +
    "#aivet-disc{background:#fff8e7;color:#7a5c00;font-size:11px;padding:7px 14px;border-bottom:1px solid #ffe4a0;display:flex;gap:6px;align-items:flex-start}" +
    "#aivet-msgs{flex:1;overflow-y:auto;padding:14px;background:#fdf8f3;display:flex;flex-direction:column;gap:10px}" +
    ".aivet-row{display:flex;max-width:88%}" +
    ".aivet-row.user{align-self:flex-end;justify-content:flex-end}" +
    ".aivet-row.bot{align-self:flex-start}" +
    ".aivet-bub{padding:10px 13px;border-radius:16px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}" +
    ".aivet-row.user .aivet-bub{background:#4e0000;color:#fff;border-bottom-right-radius:5px}" +
    ".aivet-row.bot .aivet-bub{background:#fff;color:#333;border:1px solid #eee;border-bottom-left-radius:5px}" +
    ".aivet-chips{display:flex;flex-wrap:wrap;gap:7px;padding:0 14px 10px;background:#fdf8f3}" +
    ".aivet-chip{background:#fff;border:1px solid #ffae01;color:#4e0000;border-radius:500px;padding:6px 12px;font-size:12.5px;cursor:pointer;font-family:inherit}" +
    ".aivet-chip:hover{background:#ffae01}" +
    ".aivet-typing{display:flex;gap:4px;padding:12px 14px}" +
    ".aivet-typing span{width:7px;height:7px;border-radius:50%;background:#c9a86a;animation:aivetBounce 1s infinite}" +
    ".aivet-typing span:nth-child(2){animation-delay:.15s}.aivet-typing span:nth-child(3){animation-delay:.3s}" +
    "@keyframes aivetBounce{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-5px);opacity:1}}" +
    "#aivet-foot{display:flex;gap:8px;padding:10px;border-top:1px solid #eee;background:#fff}" +
    "#aivet-input{flex:1;border:1px solid #e8ddd5;border-radius:500px;padding:10px 14px;font-size:14px;font-family:inherit;outline:none;resize:none;max-height:90px}" +
    "#aivet-input:focus{border-color:#ffae01}" +
    "#aivet-send{flex:0 0 auto;width:42px;height:42px;border-radius:50%;border:none;background:#4e0000;color:#fff;font-size:18px;cursor:pointer}" +
    "#aivet-send:disabled{opacity:.5;cursor:default}" +
    "@media(max-width:480px){#aivet-panel{left:8px;right:8px;width:auto;bottom:8px;height:calc(100vh - 16px)}#aivet-launcher{left:12px;bottom:12px}}";

  function injectStyle() {
    var s = el("style");
    s.textContent = css;
    document.head.appendChild(s);
  }

  var panel, msgs, input, sendBtn, launcher, chipWrap;

  function scrollDown() {
    msgs.scrollTop = msgs.scrollHeight;
  }

  function addMsg(role, text) {
    var row = el("div", "aivet-row " + role);
    row.appendChild(el("div", "aivet-bub", text));
    msgs.appendChild(row);
    scrollDown();
    return row;
  }

  function showTyping() {
    var row = el("div", "aivet-row bot");
    var bub = el("div", "aivet-bub");
    var t = el("div", "aivet-typing");
    t.appendChild(el("span"));
    t.appendChild(el("span"));
    t.appendChild(el("span"));
    bub.appendChild(t);
    row.appendChild(bub);
    msgs.appendChild(row);
    scrollDown();
    return row;
  }

  function setBusy(b) {
    busy = b;
    sendBtn.disabled = b;
  }

  async function send(text) {
    text = (text || input.value || "").trim();
    if (!text || busy) return;
    input.value = "";
    if (chipWrap) chipWrap.remove(), (chipWrap = null);
    addMsg("user", text);
    history.push({ role: "user", content: text });
    setBusy(true);
    var typing = showTyping();
    try {
      var res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: history.slice(0, -1) }),
      });
      var data = await res.json();
      typing.remove();
      var reply =
        data && data.reply
          ? data.reply
          : "Sorry, I couldn't answer that just now. For urgent help please call us at +91 6363590332.";
      addMsg("bot", reply);
      history.push({ role: "assistant", content: reply });
    } catch (e) {
      typing.remove();
      addMsg(
        "bot",
        "Sorry, I'm having trouble connecting. For urgent help please call +91 6363590332."
      );
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  function openPanel() {
    panel.classList.add("aivet-open");
    launcher.style.display = "none";
    input.focus();
  }
  function closePanel() {
    panel.classList.remove("aivet-open");
    launcher.style.display = "flex";
  }

  function build() {
    injectStyle();

    launcher = el("button", null, null);
    launcher.id = "aivet-launcher";
    launcher.setAttribute("aria-label", "Open AI Vet chat");
    var lic = el("span", "aivet-ic", "🐾");
    launcher.appendChild(lic);
    launcher.appendChild(el("span", null, "Ask AI Vet"));
    launcher.appendChild(el("span", "aivet-dot"));
    launcher.addEventListener("click", openPanel);

    panel = el("div");
    panel.id = "aivet-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "AI Vet chat");

    var head = el("div");
    head.id = "aivet-head";
    head.appendChild(el("div", "aivet-av", "🐾"));
    var ht = el("div");
    ht.appendChild(el("h4", null, "AI Vet"));
    ht.appendChild(el("p", null, "Emily's Pet Heaven · free pet-care help"));
    head.appendChild(ht);
    var close = el("button", null, "×");
    close.id = "aivet-close";
    close.setAttribute("aria-label", "Close chat");
    close.addEventListener("click", closePanel);
    head.appendChild(close);

    var disc = el("div");
    disc.id = "aivet-disc";
    disc.appendChild(el("span", null, "⚠️"));
    disc.appendChild(el("span", null, DISCLAIMER));

    msgs = el("div");
    msgs.id = "aivet-msgs";

    chipWrap = el("div", "aivet-chips");
    SUGGESTIONS.forEach(function (s) {
      var c = el("button", "aivet-chip", s);
      c.addEventListener("click", function () {
        send(s);
      });
      chipWrap.appendChild(c);
    });

    var foot = el("div");
    foot.id = "aivet-foot";
    input = el("textarea");
    input.id = "aivet-input";
    input.rows = 1;
    input.placeholder = "Type your question…";
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
    sendBtn = el("button", null, "➤");
    sendBtn.id = "aivet-send";
    sendBtn.setAttribute("aria-label", "Send");
    sendBtn.addEventListener("click", function () {
      send();
    });
    foot.appendChild(input);
    foot.appendChild(sendBtn);

    panel.appendChild(head);
    panel.appendChild(disc);
    panel.appendChild(msgs);
    panel.appendChild(chipWrap);
    panel.appendChild(foot);

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    addMsg("bot", GREETING);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
