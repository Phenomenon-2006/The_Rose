(function () {
  'use strict';

  var fmtDate = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  function fmt(d) { try { return fmtDate.format(new Date(d)); } catch (e) { return d || '—'; } }
  function isOnline(lastSeen) { return lastSeen && (Date.now() - new Date(lastSeen).getTime()) < 10 * 60 * 1000; }

  async function api(path, method, body) {
    var opts = { method: method || 'GET', credentials: 'same-origin', cache: 'no-store', headers: {} };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    var res = await fetch(path, opts);
    var data = {};
    try { data = await res.json(); } catch (e) {}
    return { status: res.status, data: data };
  }

  function make(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.textContent = html;
    return n;
  }

  function renderSection(containerId, sessions, currentSid) {
    var c = document.getElementById(containerId);
    c.textContent = '';
    if (!sessions.length) { c.appendChild(make('p', 'no-session', 'هیچ نشستی وجود ندارد')); return; }
    sessions.forEach(function (s) {
      var row = make('div', 'session-row' + (s.revoked ? ' revoked' : ''));
      var info = make('div', 'session-info');
      var line1 = make('div', 'session-line');
      var badge = make('span', 'badge ' + (s.revoked ? 'badge-revoked' : isOnline(s.last_seen) ? 'badge-online' : 'badge-offline'));
      badge.textContent = s.revoked ? 'ابطال‌شده' : isOnline(s.last_seen) ? 'آنلاین' : 'آفلاین';
      line1.appendChild(badge);
      var device = make('span', 'device-name', s.device_type || 'ناشناس');
      line1.appendChild(device);
      info.appendChild(line1);
      var line2 = make('div', 'session-meta', s.os + ' — ' + s.browser);
      info.appendChild(line2);
      var line3 = make('div', 'session-meta', 'ورود: ' + fmt(s.created_at) + '   |   آخرین فعالیت: ' + fmt(s.last_seen));
      info.appendChild(line3);
      var line4 = make('div', 'session-meta session-id', 'ID: ' + s.id.slice(0, 16) + '…');
      info.appendChild(line4);
      row.appendChild(info);
      if (!s.revoked && s.id !== currentSid) {
        var btn = make('button', 'revoke-btn', 'ابطال');
        btn.setAttribute('data-sid', s.id);
        btn.addEventListener('click', function () { revokeSession(this.getAttribute('data-sid')); });
        row.appendChild(btn);
      } else if (s.id === currentSid) {
        var tag = make('span', 'current-tag', '← نشست فعلی شما');
        row.appendChild(tag);
      }
      c.appendChild(row);
    });
  }

  function render(sessions, currentSid) {
    var a = sessions.filter(function (s) { return s.who === 'a'; });
    var b = sessions.filter(function (s) { return s.who === 'b'; });
    renderSection('sessions-a', a, currentSid);
    renderSection('sessions-b', b, currentSid);
  }

  var currentSid = null;

  async function load() {
    document.getElementById('status').textContent = 'درحال بارگذاری…';
    try {
      var r = await api('/api/admin');
      if (r.status === 403) { document.getElementById('status').textContent = 'دسترسی غیرمجاز.'; return; }
      if (r.status !== 200) throw new Error('bad');
      document.getElementById('status').textContent = '';
      render(r.data.sessions, currentSid);
    } catch (e) {
      document.getElementById('status').textContent = 'بارگذاری ناموفق. اتصال را بررسی کن.';
    }
  }

  async function revokeSession(sid) {
    if (!confirm('این نشست ابطال می‌شود و دستگاه مربوطه از سیستم خارج می‌شود. ادامه می‌دهی؟')) return;
    try {
      var r = await api('/api/admin', 'DELETE', { sid: sid });
      if (r.status === 200) { load(); }
      else { alert('ابطال انجام نشد: ' + (r.data && r.data.error || r.status)); }
    } catch (e) { alert('خطا در اتصال.'); }
  }

  (async function start() {
    try {
      var me = await api('/api/me');
      if (me.status !== 200 || me.data.who !== 'a') {
        document.getElementById('status').textContent = 'دسترسی فقط برای حساب اصلی مجاز است.';
        return;
      }
      currentSid = me.data.sid || null;
    } catch (e) {}
    await load();
    // رفرش خودکار هر ۳۰ ثانیه
    setInterval(load, 30000);
  })();
})();
