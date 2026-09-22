// 메뉴에 따라 화면 바꾸기 (#fit 기본, #facility, #course, #gap)
(function () {
  const views = {
    fit: document.getElementById('view-fit'),
    facility: document.getElementById('view-facility'),
    course: document.getElementById('view-course'),
    gap: document.getElementById('view-gap'),
  };
  const tabs = document.querySelectorAll('.tab[data-view]');

  function current() {
    const h = location.hash;
    if (h.startsWith('#facility')) return 'facility';
    if (h.startsWith('#course')) return 'course';
    if (h.startsWith('#gap')) return 'gap';
    return 'fit';
  }

  function show() {
    const name = current();
    Object.entries(views).forEach(([k, v]) => { v.hidden = k !== name; });
    tabs.forEach((t) => {
      if (t.dataset.view === name) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    if (name === 'course' && window.courseView) window.courseView.activate();
    if (name === 'gap' && window.gapView) window.gapView.activate();
    if (name === 'fit' && window.fitView) window.fitView.activate();
  }

  tabs.forEach((t) => t.addEventListener('click', () => setTimeout(() => window.scrollTo(0, 0), 0)));
  window.addEventListener('hashchange', show);
  show();
})();
