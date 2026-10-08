// Language switch for the Craterpult site: ?lang=hu / #hu, then the saved choice, then the browser.
(function () {
  var LANGS = ['en', 'hu', 'de', 'es', 'pt'];
  var root = document.documentElement;
  function known(l) {
    return LANGS.indexOf(l) >= 0;
  }
  function pick() {
    var q = new URLSearchParams(location.search).get('lang');
    if (known(q)) return q;
    if (known(location.hash.slice(1))) return location.hash.slice(1);
    try {
      var saved = localStorage.getItem('craterpult-site-lang');
      if (known(saved)) return saved;
    } catch {
      /* storage unavailable */
    }
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    var code = nav.toLowerCase().slice(0, 2);
    return known(code) ? code : 'en';
  }
  function apply(lang) {
    root.setAttribute('data-lang', lang);
    root.setAttribute('lang', lang);
    var buttons = document.querySelectorAll('[data-set-lang]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute(
        'aria-pressed',
        buttons[i].getAttribute('data-set-lang') === lang ? 'true' : 'false',
      );
    }
    var title = document.querySelector('meta[name="title-' + lang + '"]');
    if (title) document.title = title.getAttribute('content');
  }
  apply(pick());
  document.addEventListener('DOMContentLoaded', function () {
    apply(root.getAttribute('data-lang'));
    var buttons = document.querySelectorAll('[data-set-lang]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function (e) {
        var lang = e.currentTarget.getAttribute('data-set-lang');
        try {
          localStorage.setItem('craterpult-site-lang', lang);
        } catch {
          /* ignore */
        }
        apply(lang);
      });
    }
  });
})();
