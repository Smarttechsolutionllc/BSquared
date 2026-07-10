/*
 * B Squared Apparel Plus - chat widget
 * ------------------------------------
 * One self-contained widget for both bsquaredapparelplus.com and
 * shop.bsquaredapparelplus.com. No build step, no dependencies.
 *
 * Add it to a page with one tag:
 *
 *   <script
 *     src="https://shop.bsquaredapparelplus.com/static/bsquared-chat-widget.js"
 *     data-endpoint="https://app.bsquaredapparelplus.com/api/chat"
 *     defer></script>
 *
 * The widget detects which domain it is on (any host starting with "shop."
 * runs in shopping-assistant mode, everything else in brand mode) and tells
 * the backend, so you get tailored behavior from one code path.
 *
 * Theming: override the CSS variables below to match the store. The three
 * you will most likely change are --bsq-accent, --bsq-accent-ink, and
 * --bsq-ink. Set them on :root in your own stylesheet, loaded after this,
 * or pass data-accent="#123456" on the script tag.
 */
(function () {
  "use strict";

  if (window.__bsqChatLoaded) return;
  window.__bsqChatLoaded = true;

  var script = document.currentScript || (function () {
    var s = document.getElementsByTagName("script");
    return s[s.length - 1];
  })();

  var ENDPOINT =
    (script && script.getAttribute("data-endpoint")) ||
    window.BSQ_CHAT_ENDPOINT ||
    "https://web-production-5cc9f.up.railway.app/api/chat";

  var ACCENT = script && script.getAttribute("data-accent");

  // Chat moderator face and identity. Drop moderator.png at the site root
  // (public/ on the shop, repo root on the main site) or override with
  // data-avatar / data-name / data-role on the script tag.
  var AVATAR =
    (script && script.getAttribute("data-avatar")) ||
    window.BSQ_CHAT_AVATAR ||
    "/moderator.png";
  var MOD_NAME = (script && script.getAttribute("data-name")) || "Brittany";
  var MOD_ROLE = (script && script.getAttribute("data-role")) || "B Squared Support";
  var AV_ERR = "this.style.display='none'";

  // Domain mode: shopping assistant on the shop subdomain, brand on the rest.
  var MODE = /^shop\./.test(window.location.hostname) ? "shop" : "main";

  var GREETING =
    MODE === "shop"
      ? "Hi. Looking for something in particular? I can help you find it, check sizing, or sort out shipping."
      : "Welcome to B Squared. Ask me anything about what we make, or tell me what you are after and I will point you to it.";

  var history = []; // {role, content}
  var busy = false;

  /* ---------------------------------------------------------------- styles */

  var css = [
    ":root{",
    "--bsq-accent:", ACCENT || "#1f6feb", ";",
    "--bsq-accent-ink:#ffffff;",
    "--bsq-ink:#161513;",
    "--bsq-panel:#ffffff;",
    "--bsq-soft:#f3f1ec;",
    "--bsq-line:#e2ded6;",
    "--bsq-muted:#6b665e;",
    "}",

    ".bsq-launch{position:fixed;right:20px;bottom:20px;z-index:2147483000;",
    "display:flex;align-items:center;gap:9px;border:none;cursor:pointer;",
    "background:var(--bsq-ink);color:#fff;padding:13px 18px;border-radius:999px;",
    "font:600 15px/1 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;",
    "box-shadow:0 8px 24px rgba(0,0,0,.22);transition:transform .15s ease,box-shadow .15s ease;}",
    ".bsq-launch:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(0,0,0,.28);}",
    ".bsq-launch:focus-visible{outline:3px solid var(--bsq-accent);outline-offset:2px;}",
    ".bsq-launch svg{width:18px;height:18px;}",

    ".bsq-panel{position:fixed;right:20px;bottom:20px;z-index:2147483001;",
    "width:380px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 40px);",
    "background:var(--bsq-panel);border-radius:16px;overflow:hidden;display:none;",
    "flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.30);",
    "font:400 15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--bsq-ink);}",
    ".bsq-panel.bsq-open{display:flex;}",

    // Header styled like a folded garment hang-tag: the signature element.
    ".bsq-head{position:relative;background:var(--bsq-ink);color:#fff;padding:16px 18px 14px;}",
    ".bsq-head::before{content:'';position:absolute;top:9px;left:14px;right:14px;height:0;",
    "border-top:2px dashed rgba(255,255,255,.28);}",
    ".bsq-head::after{content:'';position:absolute;top:5px;left:22px;width:10px;height:10px;",
    "border-radius:50%;background:var(--bsq-panel);box-shadow:inset 0 0 0 2px var(--bsq-ink);}",
    ".bsq-title{margin:0 0 1px;font-size:15px;font-weight:700;letter-spacing:.02em;}",
    ".bsq-head-row{display:flex;align-items:center;gap:10px;margin-top:9px;}",
    ".bsq-head-av{width:38px;height:38px;border-radius:50%;object-fit:cover;flex:none;",
    "border:2px solid rgba(255,255,255,.85);}",
    ".bsq-launch-av{width:22px;height:22px;border-radius:50%;object-fit:cover;flex:none;}",
    ".bsq-av{width:26px;height:26px;border-radius:50%;object-fit:cover;flex:none;",
    "align-self:flex-end;margin-right:8px;}",
    ".bsq-sub{margin:0;font-size:12px;color:rgba(255,255,255,.72);}",
    ".bsq-x{position:absolute;top:14px;right:12px;background:transparent;border:none;color:#fff;",
    "cursor:pointer;font-size:22px;line-height:1;padding:4px 8px;border-radius:8px;}",
    ".bsq-x:hover{background:rgba(255,255,255,.14);}",
    ".bsq-x:focus-visible{outline:2px solid #fff;outline-offset:1px;}",

    ".bsq-log{flex:1;overflow-y:auto;padding:16px;background:var(--bsq-soft);}",
    ".bsq-row{display:flex;margin-bottom:12px;}",
    ".bsq-row.bsq-user{justify-content:flex-end;}",
    ".bsq-row.bsq-bot{align-items:flex-end;}",
    ".bsq-bubble{max-width:82%;padding:10px 13px;border-radius:14px;font-size:14px;}",
    ".bsq-bot .bsq-bubble{background:var(--bsq-panel);border:1px solid var(--bsq-line);border-bottom-left-radius:4px;}",
    ".bsq-user .bsq-bubble{background:var(--bsq-accent);color:var(--bsq-accent-ink);border-bottom-right-radius:4px;}",

    ".bsq-cards{display:flex;flex-direction:column;gap:8px;margin:2px 0 12px;}",
    ".bsq-card{display:flex;gap:11px;align-items:center;text-decoration:none;color:var(--bsq-ink);",
    "background:var(--bsq-panel);border:1px solid var(--bsq-line);border-radius:12px;padding:8px;",
    "transition:border-color .12s ease,transform .12s ease;}",
    ".bsq-card:hover{border-color:var(--bsq-accent);transform:translateY(-1px);}",
    ".bsq-card:focus-visible{outline:2px solid var(--bsq-accent);outline-offset:1px;}",
    ".bsq-card img{width:52px;height:52px;object-fit:cover;border-radius:8px;background:var(--bsq-soft);flex:none;}",
    ".bsq-card-b{min-width:0;}",
    ".bsq-card-t{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".bsq-card-p{font-size:13px;color:var(--bsq-muted);}",
    ".bsq-card-p .bsq-oos{color:#b3261e;}",

    ".bsq-dots{display:inline-flex;gap:4px;padding:4px 2px;}",
    ".bsq-dots i{width:6px;height:6px;border-radius:50%;background:var(--bsq-muted);animation:bsqb 1s infinite;}",
    ".bsq-dots i:nth-child(2){animation-delay:.15s;}",
    ".bsq-dots i:nth-child(3){animation-delay:.3s;}",
    "@keyframes bsqb{0%,60%,100%{opacity:.3;}30%{opacity:1;}}",

    ".bsq-foot{display:flex;gap:8px;padding:12px;background:var(--bsq-panel);border-top:1px solid var(--bsq-line);}",
    ".bsq-in{flex:1;resize:none;border:1px solid var(--bsq-line);border-radius:10px;padding:10px 12px;",
    "font:inherit;font-size:14px;max-height:96px;color:var(--bsq-ink);}",
    ".bsq-in:focus{outline:2px solid var(--bsq-accent);outline-offset:0;border-color:var(--bsq-accent);}",
    ".bsq-send{border:none;background:var(--bsq-accent);color:var(--bsq-accent-ink);cursor:pointer;",
    "border-radius:10px;padding:0 16px;font-weight:600;font-size:14px;}",
    ".bsq-send:disabled{opacity:.5;cursor:default;}",
    ".bsq-send:focus-visible{outline:2px solid var(--bsq-ink);outline-offset:1px;}",

    "@media (max-width:440px){.bsq-panel{right:0;bottom:0;width:100vw;max-width:100vw;",
    "height:100vh;max-height:100vh;border-radius:0;}}",
    "@media (prefers-reduced-motion:reduce){.bsq-launch,.bsq-card{transition:none;}.bsq-dots i{animation:none;opacity:.6;}}",
  ].join("");

  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ---------------------------------------------------------------- markup */

  var launch = document.createElement("button");
  launch.className = "bsq-launch";
  launch.setAttribute("aria-label", "Open chat with " + MOD_NAME + " at B Squared");
  launch.innerHTML =
    '<img class="bsq-launch-av" src="' + AVATAR + '" alt="" onerror="' + AV_ERR + '">' +
    "<span>Chat with " + MOD_NAME + "</span>";

  var panel = document.createElement("div");
  panel.className = "bsq-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "B Squared Apparel Plus chat");
  panel.innerHTML =
    '<div class="bsq-head">' +
    '<button class="bsq-x" aria-label="Close chat">&times;</button>' +
    '<div class="bsq-head-row">' +
    '<img class="bsq-head-av" src="' + AVATAR + '" alt="" onerror="' + AV_ERR + '">' +
    "<div>" +
    '<div class="bsq-title">' + MOD_NAME + "</div>" +
    '<p class="bsq-sub">' + MOD_ROLE + "</p>" +
    "</div></div></div>" +
    '<div class="bsq-log" role="log" aria-live="polite"></div>' +
    '<div class="bsq-foot">' +
    '<textarea class="bsq-in" rows="1" placeholder="Type your message" aria-label="Message"></textarea>' +
    '<button class="bsq-send">Send</button>' +
    "</div>";

  document.body.appendChild(launch);
  document.body.appendChild(panel);

  var log = panel.querySelector(".bsq-log");
  var input = panel.querySelector(".bsq-in");
  var sendBtn = panel.querySelector(".bsq-send");
  var closeBtn = panel.querySelector(".bsq-x");

  /* ---------------------------------------------------------------- render */

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function addBubble(role, text) {
    var row = document.createElement("div");
    row.className = "bsq-row " + (role === "user" ? "bsq-user" : "bsq-bot");
    var av =
      role === "user"
        ? ""
        : '<img class="bsq-av" src="' + AVATAR + '" alt="" onerror="' + AV_ERR + '">';
    row.innerHTML = av + '<div class="bsq-bubble">' + esc(text) + "</div>";
    log.appendChild(row);
    scrollDown();
    return row;
  }

  function addCards(products) {
    if (!products || !products.length) return;
    var wrap = document.createElement("div");
    wrap.className = "bsq-cards";
    products.forEach(function (p) {
      var a = document.createElement("a");
      a.className = "bsq-card";
      a.href = p.url || "#";
      a.target = "_blank";
      a.rel = "noopener";
      var price = p.price || "";
      var stock = p.available
        ? price
        : '<span class="bsq-oos">Sold out</span>' + (price ? " &middot; " + price : "");
      a.innerHTML =
        (p.image ? '<img src="' + esc(p.image) + '" alt="">' : '<img alt="">') +
        '<div class="bsq-card-b">' +
        '<div class="bsq-card-t">' + esc(p.title) + "</div>" +
        '<div class="bsq-card-p">' + stock + "</div>" +
        "</div>";
      wrap.appendChild(a);
    });
    log.appendChild(wrap);
    scrollDown();
  }

  function addTyping() {
    var row = document.createElement("div");
    row.className = "bsq-row bsq-bot";
    row.innerHTML =
      '<img class="bsq-av" src="' + AVATAR + '" alt="" onerror="' + AV_ERR + '">' +
      '<div class="bsq-bubble"><span class="bsq-dots"><i></i><i></i><i></i></span></div>';
    log.appendChild(row);
    scrollDown();
    return row;
  }

  function scrollDown() {
    log.scrollTop = log.scrollHeight;
  }

  /* ------------------------------------------------------------- messaging */

  function send() {
    var text = input.value.trim();
    if (!text || busy) return;

    input.value = "";
    input.style.height = "auto";
    addBubble("user", text);
    history.push({ role: "user", content: text });

    busy = true;
    sendBtn.disabled = true;
    var typing = addTyping();

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history.slice(-20), domain: MODE }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        typing.remove();
        var reply = (data && data.reply) || "Sorry, something went wrong. Please try again.";
        addBubble("bot", reply);
        addCards(data && data.products);
        history.push({ role: "assistant", content: reply });
      })
      .catch(function () {
        typing.remove();
        addBubble("bot", "I could not reach the shop just now. Please try again in a moment.");
      })
      .then(function () {
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      });
  }

  /* --------------------------------------------------------------- open UI */

  var opened = false;

  function open() {
    panel.classList.add("bsq-open");
    launch.style.display = "none";
    if (!opened) {
      addBubble("bot", GREETING);
      opened = true;
    }
    setTimeout(function () {
      input.focus();
    }, 50);
  }

  function close() {
    panel.classList.remove("bsq-open");
    launch.style.display = "flex";
    launch.focus();
  }

  /* --------------------------------------------------------------- events */

  launch.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  sendBtn.addEventListener("click", send);

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  input.addEventListener("input", function () {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 96) + "px";
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && panel.classList.contains("bsq-open")) {
      close();
    }
  });
})();
