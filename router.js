// 메뉴에 따라 화면 바꾸기 (#facility, #course, #gap)
(function () {
  const views = {
    facility: document.getElementById('view-facility'),
    course: document.getElementById('view-course'),
    gap: document.getElementById('view-gap'),
  };
  const tabs = document.querySelectorAll('.tab[data-view]');

  function show() {
    const name = location.hash.startsWith('#course') ? 'course' : location.hash.startsWith('#gap') ? 'gap' : 'facility';
    Object.entries(views).forEach(([k, v]) => { v.hidden = k !== name; });
    tabs.forEach((t) => {
      if (t.dataset.view === name) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    if (name === 'course' && window.courseView) window.courseView.activate();
    if (name === 'gap' && window.gapView) window.gapView.activate();
  }

  tabs.forEach((t) => t.addEventListener('click', () => setTimeout(() => window.scrollTo(0, 0), 0)));
  window.addEventListener('hashchange', show);
  show();
})();
