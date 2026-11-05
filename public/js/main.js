/**
 * main.js  -  ISMS front-end behaviour
 * ---------------------------------------------------------------------------
 * Progressive enhancement only: every page works without JavaScript, this file
 * just adds the nicer bits.
 *
 *   1. dark / light mode toggle            (bonus 15)
 *   2. Bootstrap client-side form validation + loading states  (FR-26)
 *   3. password strength meter on register
 *   4. role switcher on the registration form
 *   5. confirm modals for destructive actions
 *   6. live search suggestions (hero box + navbar)
 *   7. bookmark toggle (AJAX, no page reload)
 *   8. Chart.js dashboards driven by data-* attributes       (FR-24)
 *   9. animated stat counters on the landing page
 *  10. dismissible announcements / auto-hide flash messages
 */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // =========================================================================
  // 0. Page preloader / loading screen
  // =========================================================================
  function initPreloader() {
    var preloader = document.getElementById('pagePreloader');
    if (!preloader) return;
    function hide() {
      preloader.classList.add('loaded');
      setTimeout(function () {
        if (preloader && preloader.parentNode) {
          preloader.parentNode.removeChild(preloader);
        }
      }, 400);
    }
    if (document.readyState === 'complete') {
      hide();
    } else {
      window.addEventListener('load', hide);
      setTimeout(hide, 1200);
    }
  }
  initPreloader();

  // =========================================================================
  // 1. Dark / light toggle
  // =========================================================================
  function initTheme() {
    var btn = $('#themeToggle');
    if (!btn) return;

    function paintIcon() {
      var isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
      btn.innerHTML = isDark ? '<i class="bi bi-sun-fill"></i>' : '<i class="bi bi-moon-stars-fill"></i>';
      btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }

    paintIcon();

    btn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-bs-theme', next);
      try { localStorage.setItem('isms-theme', next); } catch (e) { /* ignore */ }
      paintIcon();
      // Redraw charts so they use the new palette.
      window.dispatchEvent(new CustomEvent('isms:themechange'));
    });
  }

  // =========================================================================
  // 2. Form validation + submit loading state
  // =========================================================================
  function initForms() {
    $$('.needs-validation').forEach(function (form) {
      form.addEventListener('submit', function (event) {
        if (!form.checkValidity()) {
          event.preventDefault();
          event.stopPropagation();
          var first = form.querySelector(':invalid');
          if (first) { first.focus(); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        } else {
          var btn = form.querySelector('button[type="submit"]');
          if (btn) {
            btn.setAttribute('disabled', 'disabled');
            var spinner = btn.querySelector('[data-loading-spinner]');
            if (spinner) spinner.classList.remove('d-none');
          }
        }
        form.classList.add('was-validated');
      });
    });
  }

  // =========================================================================
  // 3. Password strength meter
  // =========================================================================
  function initPasswordMeter() {
    var input = $('#password');
    var bar = $('#passwordStrengthBar');
    var text = $('#passwordStrengthText');
    if (!input || !bar || !text) return;

    var LABELS = [
      { min: 0, label: 'Password strength', color: 'bg-secondary' },
      { min: 1, label: 'Very weak', color: 'bg-danger' },
      { min: 2, label: 'Weak', color: 'bg-danger' },
      { min: 3, label: 'Fair', color: 'bg-warning' },
      { min: 4, label: 'Strong', color: 'bg-success' },
      { min: 5, label: 'Very strong', color: 'bg-success' }
    ];

    input.addEventListener('input', function () {
      var v = input.value;
      var score = 0;
      if (v.length >= 8) score++;
      if (v.length >= 12) score++;
      if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
      if (/\d/.test(v)) score++;
      if (/[^A-Za-z0-9]/.test(v)) score++;

      var entry = LABELS[0];
      LABELS.forEach(function (l) { if (score >= l.min) entry = l; });

      bar.className = 'progress-bar ' + entry.color;
      bar.style.width = Math.min(100, (score / 5) * 100) + '%';
      text.textContent = entry.label;
    });
  }

  // =========================================================================
  // 4. Registration role switcher
  // =========================================================================
  function initRoleTabs() {
    var inputs = $$('[data-role-tab]');
    if (!inputs.length) return;

    function apply(role) {
      $('#roleInput').value = role;
      $$('[data-role-field]').forEach(function (field) {
        var show = field.getAttribute('data-role-field') === role;
        field.classList.toggle('d-none', !show);
      });
      // Only the visible role block should be validated.
      var companyName = $('#companyName');
      if (companyName) companyName.required = role === 'company';
    }

    inputs.forEach(function (input) {
      apply(input.value);
      input.addEventListener('change', function () { apply(input.value); });
    });
  }

  // =========================================================================
  // 5. Confirm modals (delete / bulk actions)
  // =========================================================================
  function initConfirm() {
    var modalEl = document.getElementById('confirmModal');
    if (!modalEl) return;
    var modal = new bootstrap.Modal(modalEl);
    var messageEl = $('#confirmModalMessage');
    var formEl = $('#confirmModalForm');

    document.addEventListener('submit', function (event) {
      var trigger = event.target.getAttribute('data-confirm');
      if (!trigger) return;
      if (window.__ismsConfirmed) { window.__ismsConfirmed = false; return; }

      event.preventDefault();
      messageEl.textContent = trigger;
      formEl.setAttribute('action', event.target.getAttribute('action'));
      Array.prototype.slice.call(event.target.querySelectorAll('input[type="hidden"]')).forEach(function (input) {
        var clone = formEl.querySelector('input[name="' + input.name + '"]');
        if (clone) clone.value = input.value;
      });
      modal.show();
    });

    var confirmBtn = $('#confirmModalConfirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function () {
        window.__ismsConfirmed = true;
        formEl.submit();
      });
    }
  }

  // =========================================================================
  // 6. Live search suggestions
  // =========================================================================
  function initSuggestions() {
    var input = $('#heroSearchInput');
    var box = $('#heroSuggestions');
    if (!input || !box) return;

    var timer = null;
    var lastQuery = '';

    function hide() { box.classList.add('d-none'); box.innerHTML = ''; }

    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (q.length < 2 || q === lastQuery) { hide(); return; }
      lastQuery = q;

      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        fetch('/search/suggest?q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!data.results || !data.results.length) { hide(); return; }
            box.innerHTML = data.results.map(function (r) {
              var icon = r.type === 'scholarship' ? 'bi-mortarboard' : 'bi-briefcase';
              return '<a href="' + r.url + '">' +
                '<i class="bi ' + icon + ' text-primary"></i>' +
                '<span class="flex-grow-1 text-truncate">' + escapeHtml(r.title) + '</span>' +
                '<span class="small text-body-secondary text-nowrap">' + escapeHtml(r.company) + '</span>' +
                '</a>';
            }).join('');
            box.classList.remove('d-none');
          })
          .catch(hide);
      }, 220);
    });

    input.addEventListener('blur', function () { window.setTimeout(hide, 180); });
  }

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
  }

  // =========================================================================
  // 7. Bookmark toggle without a page reload
  // =========================================================================
  function initBookmarks() {
    document.addEventListener('submit', function (event) {
      var form = event.target.closest ? event.target.closest('.bookmark-form') : null;
      if (!form) return;

      event.preventDefault();
      var btn = form.querySelector('.bookmark-btn');
      if (!btn) return;

      fetch(form.action, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' }
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data || !data.ok) throw new Error('failed');
          var on = Boolean(data.saved);
          btn.classList.toggle('is-saved', on);
          btn.classList.toggle('text-warning', on);
          btn.innerHTML = '<i class="bi ' + (on ? 'bi-bookmark-fill' : 'bi-bookmark') + '"></i>';
          btn.setAttribute('title', on ? 'Remove from saved' : 'Save this opportunity');
          btn.setAttribute('aria-label', btn.getAttribute('title'));
        })
        .catch(function () { form.submit(); });
    });
  }

  // =========================================================================
  // 8. Chart.js dashboards
  // =========================================================================
  /**
   * Read a CSS custom property from the document root so the chart colours come
   * from the same :root palette as the rest of the theme (public/css/style.css)
   * instead of being duplicated here.
   */
  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  /** The Coastal Blues series palette, light to dark. */
  function chartPalette() {
    return [
      cssVar('--chart-1', '#014F86'), // Atlantic Blue
      cssVar('--chart-2', '#61A5C2'), // Sky Blue
      cssVar('--chart-3', '#2C7DA0'), // Coastal Blue
      cssVar('--chart-4', '#2A6F97'), // Steel Blue
      cssVar('--chart-5', '#89C2D9'), // Light Blue
      cssVar('--chart-6', '#A9D6E5'), // Pale Blue
      cssVar('--chart-7', '#01497C'), // Ocean Blue
      cssVar('--chart-8', '#013A63')  // Dark Blue
    ];
  }

  /** Every Chart.js instance currently on the page (module scoped). */
  var chartRegistry = [];

  function initCharts() {
    if (typeof window.Chart === 'undefined') return;

    var isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
    var textColor = cssVar('--chart-text', isDark ? '#b8d3e2' : '#2A6F97');
    var gridColor = cssVar('--chart-grid', 'rgba(137,194,217,.38)');
    var ringColor = cssVar('--chart-ring', isDark ? '#0d314e' : '#ffffff');
    var PALETTE = chartPalette();
    var registry = chartRegistry;

    $$('canvas[data-chart]').forEach(function (canvas) {
      var cfg;
      try { cfg = JSON.parse(canvas.getAttribute('data-chart')); } catch (e) { return; }

      var isDoughnut = cfg.type === 'doughnut';
      var options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: cfg.legend !== false,
            position: isDoughnut ? 'right' : 'bottom',
            labels: { color: textColor, boxWidth: 12, font: { size: 11 }, usePointStyle: true }
          },
          tooltip: { enabled: true }
        }
      };

      if (!isDoughnut) {
        options.scales = {
          x: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor, display: cfg.gridX !== false } },
          y: { beginAtZero: true, ticks: { color: textColor, precision: 0, font: { size: 10 } }, grid: { color: gridColor } }
        };
      }

      var dataset = {
        label: cfg.label || '',
        data: cfg.data || [],
        backgroundColor: cfg.colors || PALETTE,
        borderColor: isDoughnut ? ringColor : 'transparent',
        borderWidth: isDoughnut ? 2 : 0,
        tension: cfg.type === 'line' ? 0.35 : 0,
        fill: cfg.type === 'line' ? false : undefined,
        borderRadius: cfg.type === 'bar' ? 6 : 0,
        maxBarThickness: 46
      };

      var chart = new Chart(canvas, {
        type: cfg.type || 'bar',
        data: { labels: cfg.labels || [], datasets: [dataset] },
        options: options
      });
      registry.push(chart);
    });
  }

  /**
   * Destroy every chart created by initCharts().
   * The registry is module-scoped and the redraw listener is registered ONCE,
   * so toggling the theme repeatedly can never leave a second listener behind
   * (which would try to reuse the same canvases and throw "Canvas is already
   * in use").
   */
  function destroyCharts() {
    chartRegistry.forEach(function (c) {
      try { c.destroy(); } catch (e) { /* already gone */ }
    });
    chartRegistry = [];
  }

  window.addEventListener('isms:themechange', function () {
    destroyCharts();
    initCharts();
  });

  // =========================================================================
  // 9. Animated counters
  // =========================================================================
  function initCounters() {
    var nodes = $$('[data-target]');
    if (!nodes.length) return;

    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        var el = entry.target;
        var target = parseInt(String(el.getAttribute('data-target')).replace(/[^0-9]/g, ''), 10);
        if (!Number.isFinite(target) || target === 0) return;

        var suffix = String(el.getAttribute('data-target')).replace(/[0-9]/g, '');
        var start = performance.now();
        var duration = 900;

        function tick(now) {
          var progress = Math.min(1, (now - start) / duration);
          var eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.round(target * eased).toLocaleString() + suffix;
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.4 });

    nodes.forEach(function (n) { observer.observe(n); });
  }

  // =========================================================================
  // 10. Flash auto-dismiss + dismissible announcements
  // =========================================================================
  function initFlash() {
    $$('#flashContainer .alert').forEach(function (alert, i) {
      window.setTimeout(function () {
        if (window.bootstrap && bootstrap.Alert) {
          var inst = bootstrap.Alert.getOrCreateInstance(alert);
          inst.close();
        }
      }, 7000 + i * 500);
    });
  }

  // =========================================================================
  // 11. Checkbox bulk-selection bar (admin moderation + company applicants)
  // =========================================================================
  function initBulkSelect() {
    var all = $('#checkAll');
    var checks = $$('.app-check');
    var bar = $('#bulkBar');
    var sink = $('#bulkSelected');
    if (!all || !checks.length || !bar || !sink) return;

    function selected() { return checks.filter(function (c) { return c.checked; }); }

    function sync() {
      var picked = selected();
      bar.style.display = picked.length ? '' : 'none';
      sink.innerHTML = picked.map(function (c) {
        return '<input type="hidden" name="applicationId" value="' + c.value + '">';
      }).join('');
      all.checked = picked.length === checks.length;
      all.indeterminate = picked.length > 0 && picked.length < checks.length;
    }

    all.addEventListener('change', function () {
      checks.forEach(function (c) { c.checked = all.checked; });
      sync();
    });
    checks.forEach(function (c) { c.addEventListener('change', sync); });
    sync();
  }

  // =========================================================================
  // Go
  // =========================================================================
  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initForms();
    initPasswordMeter();
    initRoleTabs();
    initConfirm();
    initSuggestions();
    initBookmarks();
    initCharts();
    initCounters();
    initFlash();
    initBulkSelect();

    document.addEventListener('click', function (event) {
      if (event.target.closest('[data-history-back]')) window.history.back();
    });

    // Any <select data-auto-submit> re-submits its form when changed
    // (sort dropdowns). Inline onchange is blocked by the strict CSP.
    $$('[data-auto-submit]').forEach(function (select) {
      select.addEventListener('change', function () {
        if (select.form) select.form.submit();
      });
    });
  });
})();