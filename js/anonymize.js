/**
 * anonymize.js -- Hide identifying information for blind review.
 *
 * Activates in two ways:
 *  1. URL path contains "/anon" (e.g. /anon, /anon/, /anon/index.html).
 *     On such visits we ALSO set a long-lived cookie so future visits to "/"
 *     stay anonymized for the same user.
 *  2. Cookie "drvla_anon=1" is set.
 *
 * Removes/replaces:
 *   - Author names + personal links (.authors block)
 *   - "Dr.VLA" branding (nav brand, hero logo)
 *   - PDF download (filename + content de-anonymize)
 *   - Footer credit
 *   - <title>, meta description
 *   - Google Analytics (gtag stub so it never fires)
 * Adds:
 *   - A small banner at the top noting anon mode.
 *
 * IMPORTANT: this script must run as the first script in <head> so the gtag
 * override beats the real GA loader, and so anonymization is applied before
 * the page paints.
 */

(function () {
  'use strict';

  var COOKIE_NAME = 'drvla_anon';
  var COOKIE_SET = COOKIE_NAME + '=1; path=/; max-age=' + (60 * 60 * 24 * 30) + '; SameSite=Lax';

  function isAnonPath() {
    return /(^|\/)anon(\/|$)/.test(window.location.pathname);
  }
  function hasAnonCookie() {
    return new RegExp('(^|;\\s*)' + COOKIE_NAME + '=1(;|$)').test(document.cookie);
  }

  if (!isAnonPath() && !hasAnonCookie()) return;

  if (isAnonPath()) {
    document.cookie = COOKIE_SET;
  }

  // Mark <html> early so CSS rules can hide identifying elements
  // before paint; helps avoid a flash of un-anonymized content.
  document.documentElement.classList.add('anon-mode');

  // Disable Google Analytics in anon mode. Stub gtag + dataLayer so the
  // real loader's calls become no-ops.
  window.gtag = function () {};
  window.dataLayer = [];

  function applyAnon() {
    // Authors
    var authors = document.querySelector('.authors');
    if (authors) authors.innerHTML = '<em>Author list withheld for blind review</em>';

    // Brand text in nav and hero
    var brand = document.querySelector('.nav-brand');
    if (brand) brand.textContent = 'Anonymous Submission';
    var heroLogo = document.querySelector('.hero-logo');
    if (heroLogo) heroLogo.textContent = '';
    var heroH1 = document.querySelector('.hero h1');
    if (heroH1) {
      // Title may include the project name "Dr.VLA" -- strip it just in case.
      heroH1.textContent = heroH1.textContent.replace(/Dr\.?VLA/gi, '[Anonymous Method]');
    }

    // Hide all PDF links (paper PDF de-anonymizes)
    var pdfLinks = document.querySelectorAll('a[href$=".pdf"]');
    for (var i = 0; i < pdfLinks.length; i++) pdfLinks[i].style.display = 'none';

    // Hide any author-personal links that survive (just in case)
    var personalDomains = ['aidenswann.com', 'linkedin.com', 'monroekennedy3.com',
                           'web.stanford.edu', 'stanfordasl.github.io'];
    var allLinks = document.querySelectorAll('a[href]');
    for (var j = 0; j < allLinks.length; j++) {
      var href = allLinks[j].getAttribute('href') || '';
      for (var d = 0; d < personalDomains.length; d++) {
        if (href.indexOf(personalDomains[d]) !== -1) {
          allLinks[j].removeAttribute('href');
          allLinks[j].style.color = 'inherit';
          allLinks[j].style.textDecoration = 'none';
          break;
        }
      }
    }

    // Footer
    var footer = document.querySelector('.footer');
    if (footer) footer.textContent = 'Anonymized for blind review';

    // Document metadata
    document.title = 'Anonymous Submission';
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', 'Anonymous submission. Identifying details have been withheld for blind review.');

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAnon);
  } else {
    applyAnon();
  }
})();
