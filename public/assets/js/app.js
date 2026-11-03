/* Midnight Rose - browser code.
   It only talks to our own /api/ pages. It never holds a password, a secret key or a room id:
   the server knows who you are (from a secure cookie) and which room you may use. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    login: $('login'), form: $('login-form'), pass: $('password'), btn: $('login-btn'), note: $('login-note'),
    chat: $('chat'), list: $('messages'), composer: $('composer'), input: $('text'), send: $('send-btn'),
    sendNote: $('send-note'), badge: $('test-badge'), logout: $('logout-btn'), jump: $('jump')
  };

  var state = { msgs: [], seen: {}, hasMore: false, timer: null, polling: false, active: false };

  /* ---------- talking to the server ---------- */
  async function api(path, method, body) {
    var opts = { method: method || 'GET', credentials: 'same-origin', cache: 'no-store', headers: {} };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    var res = await fetch(path, opts);
    var data = {};
    try { data = await res.json(); } catch (e) { /* empty answer */ }
    return { status: res.status, data: data };
  }

  /* ---------- screens ---------- */
  function showLogin() {
    state.active = false;
    clearTimeout(state.timer);
    state.msgs = []; state.seen = {}; state.hasMore = false;
    el.list.textContent = '';
    document.body.className = 'on-login';
    el.chat.hidden = true;
    el.login.hidden = false;
    el.pass.value = '';
    el.btn.disabled = false;
  }

  function showChat(me) {
    document.body.className = 'in-chat';
    el.login.hidden = true;
    el.chat.hidden = false;
    el.badge.hidden = !me.isTest;
    state.active = true;
    fitToViewport();
    loadLatest();
  }

  /* ---------- login ---------- */
  function note(text) {
    el.note.textContent = text;
    el.note.classList.toggle('show', !!text);
  }

  el.form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var pw = el.pass.value;
    if (!pw) return;
    el.btn.disabled = true;
    note('');
    try {
      var r = await api('/api/login', 'POST', { password: pw });
      if (r.status === 200) {
        var me = await api('/api/me');
        if (me.status === 200) return showChat(me.data);
        note('مشکلی پیش آمد. دوباره تلاش کن.');
      } else if (r.status === 429) {
        note('تلاش‌ها زیاد بود. چند دقیقه بعد دوباره امتحان کن.');
      } else if (r.status === 401) {
        note('رمز درست نیست.');
        el.form.classList.remove('shake');
        void el.form.offsetWidth; /* restart the shake animation */
        el.form.classList.add('shake');
      } else {
        note('مشکلی پیش آمد. دوباره تلاش کن.');
      }
    } catch (err) {
      note('اتصال برقرار نشد.');
    }
    el.pass.value = '';
    el.btn.disabled = false;
    el.pass.focus();
  });

  el.logout.addEventListener('click', async function () {
    try { await api('/api/logout', 'POST'); } catch (e) { /* ignore */ }
    showLogin();
  });

  /* ---------- dates ---------- */
  function fmt(opts) {
    try { return new Intl.DateTimeFormat('fa-IR', opts); } catch (e) { return new Intl.DateTimeFormat(undefined, opts); }
  }
  var fmtDay = fmt({ year: 'numeric', month: 'long', day: 'numeric' });
  var fmtTime = fmt({ hour: '2-digit', minute: '2-digit', hour12: false });
  function dayKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function dayLabel(d) {
    var now = new Date();
    if (dayKey(d) === dayKey(now)) return 'امروز';
    var y = new Date(now.getTime() - 86400000);
    if (dayKey(d) === dayKey(y)) return 'دیروز';
    return fmtDay.format(d);
  }

  /* ---------- drawing messages (always with textContent, never innerHTML) ---------- */
  function make(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function buildNodes(m, prev, animate) {
    var frag = document.createDocumentFragment();
    var d = new Date(m.at);
    var newDay = !prev || dayKey(new Date(prev.at)) !== dayKey(d);
    if (newDay) frag.appendChild(make('div', 'day', dayLabel(d)));
    var first = newDay || prev.who !== m.who || (d - new Date(prev.at)) > 5 * 60000;

    var bubble = make('div', 'msg who-' + m.who + (m.mine ? ' mine' : ' theirs') + (first ? ' first' : '') + (animate ? ' new' : ''));
    bubble.setAttribute('data-id', m.id);
    if (first) bubble.appendChild(make('div', 'author', m.name));
    var text = make('div', 'text', m.content);
    text.setAttribute('dir', 'auto');
    bubble.appendChild(text);
    bubble.appendChild(make('div', 'time', fmtTime.format(d)));
    frag.appendChild(bubble);
    return frag;
  }

  function renderAll() {
    el.list.textContent = '';
    if (state.hasMore) {
      var more = make('button', 'more', 'پیام‌های قبلی');
      more.type = 'button';
      more.addEventListener('click', loadEarlier);
      el.list.appendChild(more);
    }
    if (!state.msgs.length) {
      el.list.appendChild(make('p', 'empty', 'هنوز پیامی نیست. اولین پیام را بنویس.'));
      return;
    }
    state.msgs.forEach(function (m, i) {
      el.list.appendChild(buildNodes(m, state.msgs[i - 1], false));
    });
  }

  function nearBottom() { return el.list.scrollHeight - el.list.scrollTop - el.list.clientHeight < 140; }
  function toBottom(smooth) {
    if (smooth && el.list.scrollTo) el.list.scrollTo({ top: el.list.scrollHeight, behavior: 'smooth' });
    else el.list.scrollTop = el.list.scrollHeight;
    el.jump.hidden = true;
  }
  el.list.addEventListener('scroll', function () { if (nearBottom()) el.jump.hidden = true; });
  el.jump.addEventListener('click', function () { toBottom(true); });

  // Add messages that arrived (from polling or from our own sending).
  function addNew(list) {
    var added = [], ownAdded = false;
    list.forEach(function (m) {
      if (state.seen[m.id]) return;
      state.seen[m.id] = true;
      added.push(m);
    });
    if (!added.length) return;
    var stick = nearBottom();
    var empty = el.list.querySelector('.empty');
    if (empty) empty.remove();
    added.forEach(function (m) {
      var prev = state.msgs[state.msgs.length - 1];
      state.msgs.push(m);
      el.list.appendChild(buildNodes(m, prev, true));
      if (m.mine) ownAdded = true;
    });
    if (stick || ownAdded) toBottom(true);
    else el.jump.hidden = false;
  }

  /* ---------- loading history ---------- */
  async function loadLatest() {
    try {
      var r = await api('/api/messages');
      if (r.status === 401) return showLogin();
      if (r.status !== 200) throw new Error('bad');
      state.msgs = r.data.messages;
      state.seen = {};
      state.msgs.forEach(function (m) { state.seen[m.id] = true; });
      state.hasMore = r.data.hasMore;
      renderAll();
      toBottom(false);
    } catch (e) {
      el.list.textContent = '';
      el.list.appendChild(make('p', 'empty', 'پیام‌ها بارگذاری نشد. اینترنت را بررسی کن.'));
    }
    schedule(true);
  }

  async function loadEarlier() {
    if (!state.msgs.length) return;
    try {
      var r = await api('/api/messages?before=' + state.msgs[0].id);
      if (r.status !== 200) return;
      var oldHeight = el.list.scrollHeight;
      r.data.messages.forEach(function (m) { state.seen[m.id] = true; });
      state.msgs = r.data.messages.concat(state.msgs);
      state.hasMore = r.data.hasMore;
      renderAll();
      el.list.scrollTop += el.list.scrollHeight - oldHeight;
    } catch (e) { /* try again later */ }
  }

  /* ---------- checking for new messages (every few seconds) ---------- */
  function schedule(first) {
    clearTimeout(state.timer);
    if (!state.active) return;
    state.timer = setTimeout(poll, first ? 2500 : (document.hidden ? 15000 : 3000));
  }

  async function poll() {
    if (!state.active || state.polling) return;
    state.polling = true;
    try {
      var last = state.msgs.length ? state.msgs[state.msgs.length - 1].id : 0;
      var r = await api('/api/messages' + (last ? '?after=' + last : ''));
      if (r.status === 401) { state.polling = false; return showLogin(); }
      if (r.status === 200) {
        if (!last) { state.msgs = []; state.hasMore = r.data.hasMore; }
        addNew(r.data.messages);
      }
    } catch (e) { /* offline - just try again */ }
    state.polling = false;
    schedule(false);
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && state.active) { clearTimeout(state.timer); poll(); }
  });

  /* ---------- sending ---------- */
  function autosize() {
    el.input.style.height = 'auto';
    el.input.style.height = Math.min(el.input.scrollHeight, 140) + 'px';
  }
  el.input.addEventListener('input', autosize);

  var desktop = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  el.input.addEventListener('keydown', function (e) {
    if (desktop && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      el.composer.requestSubmit ? el.composer.requestSubmit() : el.send.click();
    }
  });

  el.composer.addEventListener('submit', async function (e) {
    e.preventDefault();
    var text = el.input.value.trim();
    if (!text || el.send.disabled) return;
    el.send.disabled = true;
    el.sendNote.textContent = '';
    try {
      var r = await api('/api/messages', 'POST', { content: text });
      if (r.status === 401) return showLogin();
      if (r.status === 201) {
        el.input.value = '';
        autosize();
        addNew([r.data.message]);
      } else if (r.status === 400 && r.data.error === 'too_long') {
        el.sendNote.textContent = 'پیام خیلی طولانی است.';
      } else {
        el.sendNote.textContent = 'ارسال نشد. دوباره تلاش کن.';
      }
    } catch (err) {
      el.sendNote.textContent = 'ارسال نشد. اتصال را بررسی کن.';
    }
    el.send.disabled = false;
    el.input.focus();
  });

  /* ---------- keep the chat above the phone keyboard ---------- */
  function fitToViewport() {
    var vv = window.visualViewport;
    if (!vv || el.chat.hidden) return;
    el.chat.style.top = vv.offsetTop + 'px';
    el.chat.style.height = vv.height + 'px';
    if (nearBottom()) el.list.scrollTop = el.list.scrollHeight;
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitToViewport);
    window.visualViewport.addEventListener('scroll', fitToViewport);
  }

  /* ---------- soft floating specks in the background ---------- */
  (function dust() {
    var c = $('dust');
    if (!c.getContext || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var ctx = c.getContext('2d'), w = 0, h = 0, dots = [], dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    function size() {
      w = c.clientWidth; h = c.clientHeight;
      c.width = w * dpr; c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function reset(d, anywhere) {
      d.x = Math.random() * w; d.y = anywhere ? Math.random() * h : h + 10;
      d.r = 0.6 + Math.random() * 1.6; d.v = 4 + Math.random() * 9; d.s = (Math.random() - 0.5) * 6;
      d.a = 0.12 + Math.random() * 0.28; d.p = Math.random() * 6.28;
    }
    size();
    for (var i = 0; i < 26; i++) { var d = {}; reset(d, true); dots.push(d); }
    window.addEventListener('resize', size);
    var last = 0;
    function frame(t) {
      var dt = Math.min((t - last) / 1000 || 0, 0.1); last = t;
      if (!document.hidden) {
        ctx.clearRect(0, 0, w, h);
        for (var i = 0; i < dots.length; i++) {
          var d = dots[i];
          d.y -= d.v * dt; d.x += (d.s + Math.sin(t / 2500 + d.p) * 5) * dt;
          if (d.y < -10) reset(d, false);
          ctx.beginPath(); ctx.fillStyle = 'rgba(214,154,169,' + d.a + ')';
          ctx.arc(d.x, d.y, d.r, 0, 6.283); ctx.fill();
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  })();

  /* ---------- start ---------- */
  (async function start() {
    try {
      var me = await api('/api/me');
      if (me.status === 200) return showChat(me.data);
    } catch (e) { /* offline: show the login */ }
    showLogin();
  })();
})();
