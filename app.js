'use strict';
/**
 * AI Builder Study — frontend.
 * Static site, vanilla JS. Course content comes from content.js
 * (window.STUDY_CONTENT). Accounts and progress come from the
 * ai-study-backend API (config.js sets window.AI_STUDY_API_BASE).
 * Progress is read on sign-in and written on every lesson toggle,
 * the same pattern as the APICS study app.
 */
(function () {
  var API = (window.AI_STUDY_API_BASE || '').replace(/\/+$/, '');
  var CONTENT = window.STUDY_CONTENT;
  var TOKEN_KEY = 'ai-study-token';

  var state = {
    token: localStorage.getItem(TOKEN_KEY) || null,
    email: null,
    completed: {}, // lessonId -> { moduleId, completedAt }
    current: null, // { moduleId, lessonId }
    authMode: 'login',
  };

  // Flat lesson list for prev/next and totals.
  var flat = [];
  CONTENT.modules.forEach(function (m) {
    m.lessons.forEach(function (l) {
      flat.push({ moduleId: m.id, moduleTitle: m.title, lesson: l });
    });
  });

  function $(id) { return document.getElementById(id); }

  function api(path, options) {
    var opts = options || {};
    opts.headers = opts.headers || {};
    if (state.token) opts.headers['Authorization'] = 'Bearer ' + state.token;
    if (opts.body && typeof opts.body !== 'string') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(API + path, opts).then(function (res) {
      return res.text().then(function (text) {
        var data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (e) { /* keep {} */ }
        if (!res.ok) {
          var err = new Error(data.error || ('request failed: ' + res.status));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  // ---------- account area / auth ----------

  function renderAccount() {
    var area = $('account-area');
    area.textContent = '';
    if (state.token && state.email) {
      var span = document.createElement('span');
      span.textContent = state.email;
      var out = document.createElement('button');
      out.className = 'secondary';
      out.textContent = 'Sign out';
      out.addEventListener('click', signOut);
      area.appendChild(span);
      area.appendChild(out);
      $('auth-panel').hidden = true;
    } else {
      var btn = document.createElement('button');
      btn.textContent = 'Sign in to save progress';
      btn.addEventListener('click', function () {
        var panel = $('auth-panel');
        panel.hidden = !panel.hidden;
      });
      area.appendChild(btn);
    }
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    $('auth-title').textContent = mode === 'login' ? 'Sign in' : 'Create account';
    $('auth-submit').textContent = mode === 'login' ? 'Sign in' : 'Create account';
    $('auth-toggle').textContent = mode === 'login'
      ? 'No account yet? Create one'
      : 'Already have an account? Sign in';
    $('auth-password').setAttribute('autocomplete', mode === 'login' ? 'current-password' : 'new-password');
  }

  function showAuthError(msg) {
    var el = $('auth-error');
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function onAuthSubmit(ev) {
    ev.preventDefault();
    showAuthError('');
    var email = $('auth-email').value.trim();
    var password = $('auth-password').value;
    var path = state.authMode === 'login' ? '/auth/login' : '/auth/register';
    api(path, { method: 'POST', body: { email: email, password: password } })
      .then(function (data) {
        state.token = data.token;
        state.email = data.email;
        localStorage.setItem(TOKEN_KEY, data.token);
        $('auth-password').value = '';
        renderAccount();
        return loadProgress();
      })
      .then(renderAll)
      .catch(function (err) {
        showAuthError(err.message || 'sign-in failed');
      });
  }

  function signOut() {
    var done = function () {
      state.token = null;
      state.email = null;
      state.completed = {};
      localStorage.removeItem(TOKEN_KEY);
      renderAccount();
      renderAll();
    };
    if (state.token) {
      api('/auth/logout', { method: 'POST', body: {} }).then(done, done);
    } else {
      done();
    }
  }

  // ---------- progress ----------

  function loadProgress() {
    if (!state.token) return Promise.resolve();
    return api('/me/progress').then(function (data) {
      state.completed = {};
      (data.lessons || []).forEach(function (l) {
        state.completed[l.lessonId] = { moduleId: l.moduleId, completedAt: l.completedAt };
      });
    }).catch(function () {
      // Backend unreachable: keep local state, show content anyway.
    });
  }

  function setLessonDone(moduleId, lessonId, done, checkbox) {
    if (!state.token) {
      checkbox.checked = false;
      var panel = $('auth-panel');
      panel.hidden = false;
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    checkbox.disabled = true;
    api('/me/lesson', { method: 'POST', body: { lessonId: lessonId, moduleId: moduleId, done: done } })
      .then(function () {
        if (done) {
          state.completed[lessonId] = { moduleId: moduleId, completedAt: new Date().toISOString() };
        } else {
          delete state.completed[lessonId];
        }
      })
      .catch(function () {
        checkbox.checked = !done;
      })
      .then(function () {
        checkbox.disabled = false;
        renderNav();
        renderProgressSummary();
      });
  }

  // ---------- rendering ----------

  function renderProgressSummary() {
    var total = flat.length;
    var doneCount = flat.filter(function (f) { return state.completed[f.lesson.id]; }).length;
    var el = $('progress-summary');
    el.innerHTML = '';
    var text = document.createElement('div');
    text.textContent = state.token
      ? doneCount + ' of ' + total + ' lessons complete'
      : 'Read freely. Sign in to save progress.';
    var bar = document.createElement('div');
    bar.className = 'progress-bar';
    var fill = document.createElement('div');
    fill.style.width = total ? (100 * doneCount / total) + '%' : '0%';
    bar.appendChild(fill);
    el.appendChild(text);
    el.appendChild(bar);
  }

  function renderNav() {
    var nav = $('course-nav');
    nav.innerHTML = '';
    CONTENT.modules.forEach(function (m) {
      var h = document.createElement('h3');
      h.textContent = m.title + ' ';
      var doneInModule = m.lessons.filter(function (l) { return state.completed[l.id]; }).length;
      var count = document.createElement('span');
      count.className = 'module-count';
      count.textContent = doneInModule + '/' + m.lessons.length;
      h.appendChild(count);
      nav.appendChild(h);
      var ul = document.createElement('ul');
      m.lessons.forEach(function (l) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#';
        var isCurrent = state.current && state.current.lessonId === l.id;
        if (isCurrent) a.className = 'active';
        if (state.completed[l.id]) {
          var tick = document.createElement('span');
          tick.className = 'tick';
          tick.textContent = '✓ ';
          a.appendChild(tick);
        }
        a.appendChild(document.createTextNode(l.title));
        a.addEventListener('click', function (ev) {
          ev.preventDefault();
          openLesson(m.id, l.id);
        });
        li.appendChild(a);
        ul.appendChild(li);
      });
      nav.appendChild(ul);
    });
  }

  function openLesson(moduleId, lessonId) {
    var idx = flat.findIndex(function (f) { return f.lesson.id === lessonId; });
    if (idx < 0) return;
    state.current = { moduleId: moduleId, lessonId: lessonId };
    var entry = flat[idx];
    var view = $('lesson-view');
    view.innerHTML = '';

    var moduleLine = document.createElement('div');
    moduleLine.className = 'muted';
    moduleLine.textContent = entry.moduleTitle;
    view.appendChild(moduleLine);

    var h1 = document.createElement('h1');
    h1.textContent = entry.lesson.title;
    view.appendChild(h1);

    var body = document.createElement('div');
    body.innerHTML = entry.lesson.html;
    view.appendChild(body);

    var row = document.createElement('label');
    row.className = 'complete-row';
    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(state.completed[lessonId]);
    checkbox.addEventListener('change', function () {
      setLessonDone(moduleId, lessonId, checkbox.checked, checkbox);
    });
    row.appendChild(checkbox);
    row.appendChild(document.createTextNode('Mark this lesson complete'));
    view.appendChild(row);

    var navRow = document.createElement('div');
    navRow.className = 'lesson-nav-row';
    var prev = document.createElement('span');
    if (idx > 0) {
      var pa = document.createElement('a');
      pa.href = '#';
      pa.textContent = '← ' + flat[idx - 1].lesson.title;
      pa.addEventListener('click', function (ev) {
        ev.preventDefault();
        openLesson(flat[idx - 1].moduleId, flat[idx - 1].lesson.id);
      });
      prev.appendChild(pa);
    }
    var next = document.createElement('span');
    if (idx < flat.length - 1) {
      var na = document.createElement('a');
      na.href = '#';
      na.textContent = flat[idx + 1].lesson.title + ' →';
      na.addEventListener('click', function (ev) {
        ev.preventDefault();
        openLesson(flat[idx + 1].moduleId, flat[idx + 1].lesson.id);
      });
      next.appendChild(na);
    }
    navRow.appendChild(prev);
    navRow.appendChild(next);
    view.appendChild(navRow);

    renderNav();
    window.scrollTo(0, 0);
  }

  function renderAll() {
    renderProgressSummary();
    renderNav();
    if (!state.current && flat.length) {
      openLesson(flat[0].moduleId, flat[0].lesson.id);
    } else if (state.current) {
      openLesson(state.current.moduleId, state.current.lessonId);
    }
  }

  // ---------- boot ----------

  $('auth-form').addEventListener('submit', onAuthSubmit);
  $('auth-toggle').addEventListener('click', function (ev) {
    ev.preventDefault();
    setAuthMode(state.authMode === 'login' ? 'register' : 'login');
    showAuthError('');
  });
  setAuthMode('login');
  renderAccount();
  renderAll();

  if (state.token) {
    api('/me')
      .then(function (me) {
        state.email = me.email;
        renderAccount();
        return loadProgress();
      })
      .then(renderAll)
      .catch(function (err) {
        if (err.status === 401) {
          state.token = null;
          localStorage.removeItem(TOKEN_KEY);
          renderAccount();
        }
      });
  }
})();
