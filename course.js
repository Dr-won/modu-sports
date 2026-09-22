// 모두의 특수체육 — 강좌 찾기
(function () {
  const PAGE = 30;
  const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
  const $ = (id) => document.getElementById(id);
  const el = {
    form: $('cfilters'), dtype: $('cdtype'), days: $('cdays'), sport: $('csport'), time: $('ctime'), fee: $('cfee'),
    city: $('ccity'), local: $('clocal'), q: $('cq'), list: $('clist'), count: $('ccount'), more: $('cmore'), hint: $('chint'),
  };

  let loaded = false, dtypes = [], places = [], rows = [], hits = [], shown = 0;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const opt = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`;
  const won = (n) => n.toLocaleString() + '원';

  // 강좌 데이터는 크기가 커서 강좌 찾기 화면을 처음 열 때 불러옴
  function activate() {
    if (loaded) return;
    loaded = true;
    fetch('data/courses.json')
      .then((r) => r.json())
      .then((data) => {
        dtypes = data.dtypes;
        places = data.places.map((p) => ({ name: p[0], city: p[1], localCd: p[2], local: p[3], addr: p[4], daddr: p[5], tel: p[6] }));
        rows = data.rows.map((r) => ({
          name: r[0], sport: r[1], mask: r[2], days: r[3], start: r[4], end: r[5], fee: r[6], desc: r[7],
          place: r[8] >= 0 ? places[r[8]] : null, text: (r[0] + ' ' + r[1] + ' ' + r[7]).toLowerCase(),
        }));
        build();
        readHash();
        search();
      })
      .catch(() => { el.count.textContent = '강좌 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'; });
  }

  function build() {
    el.dtype.insertAdjacentHTML('beforeend', dtypes.map((d, i) =>
      `<label><input type="radio" name="dtype" value="${i}"> ${esc(d)}</label>`).join(''));
    el.days.insertAdjacentHTML('beforeend', DAYS.map((d, i) =>
      `<label><input type="checkbox" name="day" value="${i}"> ${d}</label>`).join(''));

    const cnt = {};
    rows.forEach((r) => { cnt[r.sport] = (cnt[r.sport] || 0) + 1; });
    el.sport.innerHTML = opt('', '전체') + Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])
      .map((s) => opt(s, `${s} (${cnt[s].toLocaleString()})`)).join('');

    if (places.length) {
      const cities = [...new Set(places.map((p) => p.city))].sort((a, b) => a.localeCompare(b, 'ko'));
      el.city.innerHTML = opt('', '전체') + cities.map((c) => opt(c, c)).join('');
      const nLinked = rows.filter((r) => r.place).length;
      el.hint.textContent = `위치가 확인된 강좌 ${nLinked.toLocaleString()}개만 지역으로 찾을 수 있어요. 신청 전에 시설에 확인해 주세요.`;
    } else {
      el.city.disabled = true;
      el.hint.textContent = '강좌 위치 연결은 준비 중입니다. 지금은 장애유형·종목·요일·시간·수강료로 찾을 수 있어요.';
    }
  }

  function fillLocals() {
    const city = el.city.value;
    if (!city) { el.local.innerHTML = opt('', '전체'); el.local.disabled = true; return; }
    const m = new Map();
    places.forEach((p) => { if (p.city === city) m.set(p.localCd, p.local); });
    el.local.innerHTML = opt('', '전체') + [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ko')).map(([cd, nm]) => opt(cd, nm)).join('');
    el.local.disabled = false;
  }

  const checkedDtype = () => (el.form.querySelector('input[name="dtype"]:checked') || {}).value || '';
  const checkedDays = () => [...el.form.querySelectorAll('input[name="day"]:checked')].map((c) => +c.value);

  function inTime(start, band) {
    if (!band) return true;
    const h = parseInt(start, 10);
    if (isNaN(h)) return false;
    return band === 'am' ? h < 12 : band === 'pm' ? h >= 12 && h < 18 : h >= 18;
  }

  function search() {
    const dt = checkedDtype(), days = checkedDays(), sport = el.sport.value, band = el.time.value;
    const fee = +el.fee.value || 0, city = el.city.value, local = el.local.value;
    const words = el.q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const bit = dt === '' ? 0 : 1 << +dt;
    hits = rows.filter((r) =>
      (!bit || (r.mask & bit)) &&
      (!days.length || days.some((d) => r.days[d] === '1')) &&
      (!sport || r.sport === sport) && inTime(r.start, band) && (!fee || r.fee <= fee) &&
      (!city || (r.place && r.place.city === city)) && (!local || (r.place && r.place.localCd === local)) &&
      words.every((w) => r.text.includes(w)));
    shown = 0;
    el.list.innerHTML = '';
    render();
    writeHash();
  }

  function render() {
    el.count.innerHTML = `강좌 <b>${hits.length.toLocaleString()}</b>개`;
    if (!hits.length) {
      el.list.innerHTML = '<li class="empty">조건에 맞는 강좌가 없습니다.<br>요일이나 시간대를 넓혀 보세요.</li>';
      el.more.hidden = true;
      return;
    }
    const next = hits.slice(shown, shown + PAGE);
    el.list.insertAdjacentHTML('beforeend', next.map(card).join(''));
    shown += next.length;
    el.more.hidden = shown >= hits.length;
    el.more.textContent = `더 보기 (${(hits.length - shown).toLocaleString()}개 남음)`;
  }

  function card(r) {
    const types = dtypes.filter((_, i) => r.mask & (1 << i));
    const week = DAYS.map((d, i) => `<span class="day${r.days[i] === '1' ? ' on' : ''}" aria-hidden="true">${d}</span>`).join('');
    const weekText = DAYS.filter((_, i) => r.days[i] === '1').join('·') || '요일 정보 없음';
    const time = r.start ? `${esc(r.start)}~${esc(r.end)}` : '시간 정보 없음';
    let where = '';
    if (r.place) {
      const p = r.place, mapQ = encodeURIComponent(p.addr || p.name);
      where = `<p class="place"><b>${esc(p.name)}</b> · ${esc(p.city)} ${esc(p.local)}<br>${esc([p.addr, p.daddr].filter(Boolean).join(' '))}</p>
        <div class="actions">
          ${p.tel ? `<a class="act call" href="tel:${esc(p.tel.replace(/-/g, ''))}">☎ ${esc(p.tel)}</a>` : ''}
          <a class="act" href="https://map.naver.com/p/search/${mapQ}" target="_blank" rel="noopener" aria-label="${esc(p.name)} 네이버 지도에서 보기 (새 창)">지도 보기</a>
        </div>`;
    } else {
      where = '<p class="place none">시설 위치 정보가 없는 강좌입니다. 강좌 설명의 연락처를 참고해 주세요.</p>';
    }
    return `<li class="card">
      <div class="badges"><span class="badge">${esc(r.sport)}</span>${types.map((t) => `<span class="badge dtype">${esc(t)}</span>`).join('')}</div>
      <h2>${esc(r.name)}</h2>
      <div class="week" role="img" aria-label="운영 요일 ${weekText}">${week}</div>
      <p class="meta"><span>${time}</span><span class="fee">${won(r.fee)}</span></p>
      ${r.desc ? `<p class="desc">${esc(r.desc)}</p>` : ''}
      ${where}
    </li>`;
  }

  function writeHash() {
    const p = new URLSearchParams();
    if (checkedDtype() !== '') p.set('dtype', checkedDtype());
    const days = checkedDays(); if (days.length) p.set('days', days.join(''));
    if (el.sport.value) p.set('sport', el.sport.value);
    if (el.time.value) p.set('time', el.time.value);
    if (el.fee.value) p.set('fee', el.fee.value);
    if (el.city.value) p.set('city', el.city.value);
    if (el.local.value) p.set('local', el.local.value);
    if (el.q.value.trim()) p.set('q', el.q.value.trim());
    const s = p.toString();
    if (location.hash.startsWith('#course')) history.replaceState(null, '', s ? '#course?' + s : '#course');
  }

  function readHash() {
    const i = location.hash.indexOf('?');
    if (i < 0 || !location.hash.startsWith('#course')) return;
    const p = new URLSearchParams(location.hash.slice(i + 1));
    const d = el.form.querySelector(`input[name="dtype"][value="${p.get('dtype') || ''}"]`);
    if (d) d.checked = true;
    (p.get('days') || '').split('').forEach((n) => { const c = el.form.querySelector(`input[name="day"][value="${n}"]`); if (c) c.checked = true; });
    ['sport', 'time', 'fee'].forEach((k) => { if (p.get(k)) el[k].value = p.get(k); });
    if (p.get('city')) { el.city.value = p.get('city'); fillLocals(); }
    if (p.get('local')) el.local.value = p.get('local');
    if (p.get('q')) el.q.value = p.get('q');
  }

  let timer;
  el.form.addEventListener('change', (e) => {
    if (e.target === el.q) return;
    if (e.target === el.city) fillLocals();
    search();
  });
  el.q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 200); });
  el.form.addEventListener('submit', (e) => { e.preventDefault(); search(); });
  el.form.addEventListener('reset', () => setTimeout(() => { fillLocals(); search(); }, 0));
  el.more.addEventListener('click', render);

  window.courseView = { activate };
})();
