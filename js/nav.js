/**
 * nav.js -- Scroll-based active navigation highlighting
 *
 * Uses IntersectionObserver to detect which section is currently in view
 * and highlights the corresponding nav link. Also handles smooth-scroll
 * click events and auto-scrolls the nav bar on mobile to keep the
 * active link visible.
 */

document.addEventListener('DOMContentLoaded', () => {
  const navLinks = document.querySelectorAll('.nav-bar a[href^="#"]');
  const sections = [];

  // Build a parallel list of { link, section } pairs
  navLinks.forEach(link => {
    const id = link.getAttribute('href').slice(1);
    const section = document.getElementById(id);
    if (section) {
      sections.push({ link, section });
    }
  });

  if (sections.length === 0) return;

  // ----------------------------------------------------------------
  // Intersection Observer -- mark the active nav link
  // ----------------------------------------------------------------
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Remove active class from every nav link
        navLinks.forEach(l => l.classList.remove('active'));

        // Add active class to the matching link
        const match = sections.find(s => s.section === entry.target);
        if (match) {
          match.link.classList.add('active');
          scrollNavLinkIntoView(match.link);
        }
      }
    });
  }, {
    threshold: 0.3,
    rootMargin: '-60px 0px 0px 0px'  // offset for the fixed nav height
  });

  sections.forEach(({ section }) => observer.observe(section));

  // ----------------------------------------------------------------
  // Click handler -- smooth scroll to section
  // ----------------------------------------------------------------
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const id = link.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // ----------------------------------------------------------------
  // Mobile helper -- auto-scroll the nav bar so the active link
  // is visible when the nav overflows horizontally.
  // ----------------------------------------------------------------
  function scrollNavLinkIntoView(activeLink) {
    const navEl = activeLink.closest('nav');
    if (!navEl) return;

    // Only needed when the nav element is scrollable
    if (navEl.scrollWidth <= navEl.clientWidth) return;

    // Centre the active link within the visible nav area
    const offset = activeLink.offsetLeft
      - navEl.offsetLeft
      - (navEl.clientWidth / 2)
      + (activeLink.offsetWidth / 2);

    navEl.scrollTo({ left: offset, behavior: 'smooth' });
  }
});
