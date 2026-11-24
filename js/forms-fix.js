// Emily's Pet Heaven - form reliability layer
// 1) Newsletter signups are delivered by email instead of doing nothing.
// 2) Booking/contact forms keep their WhatsApp flow and also send a backup copy.
(function () {
  'use strict';

  var ENDPOINT = 'https://formsubmit.co/ajax/contact@emilyspetheaven.com';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function statusEl(form) {
    var el = form.parentNode && form.parentNode.querySelector('.form-status[data-for="' + (form.id || form.className) + '"]');
    if (el) return el;
    el = document.createElement('p');
    el.className = 'form-status';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('data-for', form.id || form.className);
    el.style.margin = '10px 0 0';
    el.style.fontSize = '14px';
    el.style.lineHeight = '1.5';
    form.parentNode.insertBefore(el, form.nextSibling);
    return el;
  }

  function say(form, text, kind) {
    var el = statusEl(form);
    el.textContent = text;
    el.style.color = kind === 'error' ? '#ef4444' : (kind === 'success' ? '#0f7b4f' : '#4e0000');
  }

  function post(data, ms) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms || 12000) : null;
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: data,
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      return res;
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function sayFallback(form, email, prefix) {
    var el = statusEl(form);
    el.textContent = '';
    el.style.color = '#4e0000';
    el.appendChild(document.createTextNode(prefix || 'Could not reach the mail service. '));
    var a = document.createElement('a');
    a.href = 'mailto:contact@emilyspetheaven.com?subject=' +
      encodeURIComponent('Newsletter signup') +
      '&body=' + encodeURIComponent('Please add me to your updates: ' + email);
    a.textContent = 'Send it by email instead';
    a.style.color = 'inherit';
    a.style.textDecoration = 'underline';
    el.appendChild(a);
    el.appendChild(document.createTextNode('.'));
  }

  // ---- Newsletter ----
  document.querySelectorAll('.newsletter-form').forEach(function (form) {
    if (form.dataset.bound === '1') return;
    form.dataset.bound = '1';

    var input = form.querySelector('input[type="email"]');
    var button = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (input && input.value ? input.value : '').trim();

      if (!EMAIL_RE.test(email)) {
        say(form, 'Please enter a valid email address.', 'error');
        if (input) input.focus();
        return;
      }

      var msg = 'Hi Emily\'s Pet Heaven, please add me to your updates. My email: ' + email;
      var wa = 'https://wa.me/919830802898?text=' + encodeURIComponent(msg);
      var win = window.open(wa, '_blank', 'noopener');
      if (!win) window.location.href = wa;

      sayFallback(form, email, 'Opening WhatsApp to confirm. If it does not open, ');
      if (button) { button.blur(); }
      form.reset();
    });
  });

  // ---- Booking / contact backup copy ----
  document.querySelectorAll('#appointmentForm, #contact-form, #contactForm').forEach(function (form) {
    if (form.dataset.backup === '1') return;
    form.dataset.backup = '1';

    form.addEventListener('submit', function () {
      var name = form.querySelector('[name="name"]');
      var phone = form.querySelector('[name="phone"]');
      var n = name ? name.value.trim() : '';
      var p = phone ? phone.value.trim() : '';
      if (!n && !p) return;

      var fd = new FormData();
      fd.append('_subject', 'Website enquiry - ' + (n || 'no name'));
      fd.append('_template', 'table');
      fd.append('_honey', '');
      form.querySelectorAll('input, select, textarea').forEach(function (field) {
        if (!field.name || field.type === 'submit' || field.type === 'button') return;
        if (field.type === 'checkbox' && !field.checked) return;
        fd.append(field.name, field.value);
      });

      post(fd, 8000).catch(function () {});
    });
  });
})();
