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

  function post(data) {
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: data
    });
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

      var label = button ? button.innerHTML : '';
      if (button) { button.disabled = true; button.innerHTML = 'Subscribing...'; }
      say(form, 'Sending...', 'info');

      var fd = new FormData();
      fd.append('email', email);
      fd.append('_subject', 'New newsletter subscriber - Emily\'s Pet Heaven');
      fd.append('_template', 'table');
      fd.append('_honey', '');

      post(fd)
        .then(function (res) { return res.json().catch(function () { return {}; }); })
        .then(function (body) {
          if (body && body.success === 'false') throw new Error(body.message || 'failed');
          say(form, 'Thank you. You are on the list.', 'success');
          form.reset();
        })
        .catch(function () {
          say(form, 'Could not subscribe right now. Please email contact@emilyspetheaven.com.', 'error');
        })
        .finally(function () {
          if (button) { button.disabled = false; button.innerHTML = label; }
        });
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

      post(fd).catch(function () {});
    });
  });
})();
