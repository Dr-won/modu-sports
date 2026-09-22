// 모두의 특수체육 — 시설 찾기
(function () {
  const PAGE = 30;
  const $ = (id) => document.getElementById(id);
  const el = { city: $('city'), local: $('local'), sport: $('sport'), q: $('q'), list: $('list'), count: $('count'), more: $('more'), form: $('filters') };

  let rows = [];
  let hits = [];
  let shown = 0;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const opt = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`;

  fetch('data/facilities.json')
    .then((r) => r.json())
    .then((data) => {
      $('updated').textContent = data.updated;
      rows = data.rows.map((r) => ({
        kind: r[0], name: r[1], sport: r[2], city: r[3], localCd: r[4], local: r[5], addr: r[6], daddr: r[7], tel: r[8],
        text: (r[1] + ' ' + r[2] + ' ' + r[6] + ' ' + r[7]).toLowerCase(),
      }));
      fillCities();
      fillSports();
      readHash();
      search();
    })
    .catch(() => { el.count.textContent = '데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'; });

  function fillCities() {
    const cities = [...new Set(rows.map((r) => r.city))].sort((a, b) => a.localeCompare(b, 'ko'));
    el.city.innerHTML = opt('', '전체') + cities.map((c) => opt(c, c)).join('');
  }

  function fillLocals() {
    const city = el.city.value;
    if (!city) { el.local.innerHTML = opt('', '전체'); el.local.disabled = true; return; }
    const m = new Map();
    rows.forEach((r) => { if (r.city === city) m.set(r.localCd, r.local); });
    const locals = [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ko'));
    el.local.innerHTML = opt('', '전체') + locals.map(([cd, nm]) => opt(cd, nm)).join('');
    el.local.disabled = false;
  }

  const kindValue = () => (el.form.querySelector('input[name="kind"]:checked') || {}).value || '';
  const KIND_LABEL = { K: '스포츠강좌이용권 종목', V: '장애인 운동 바우처 서비스' };

  // 종목(강좌이용권)과 서비스명(바우처)을 구분별로 묶어 보여 줌. 고른 지역에 있는 것만, 그 지역 숫자로
  function fillSports() {
    const kind = kindValue(), keep = el.sport.value, city = el.city.value, local = el.local.value;
    const groups = { K: {}, V: {} };
    rows.forEach((r) => {
      if ((kind && r.kind !== kind) || (city && r.city !== city) || (local && r.localCd !== local)) return;
      groups[r.kind][r.sport] = (groups[r.kind][r.sport] || 0) + 1;
    });
    let html = opt('', '전체');
    ['K', 'V'].forEach((k) => {
      const cnt = groups[k], names = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
      if (!names.length) return;
      html += `<optgroup label="${KIND_LABEL[k]}">` + names.map((s) => opt(k + '|' + s, `${s} (${cnt[s].toLocaleString()})`)).join('') + '</optgroup>';
    });
    el.sport.innerHTML = html;
    if ([...el.sport.options].some((o) => o.value === keep)) el.sport.value = keep;
  }

  function search() {
    const kind = kindValue(), city = el.city.value, local = el.local.value, sport = el.sport.value;
    const words = el.q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    hits = rows.filter((r) =>
      (!kind || r.kind === kind) && (!city || r.city === city) && (!local || r.localCd === local) &&
      (!sport || r.kind + '|' + r.sport === sport) &&
      words.every((w) => r.text.includes(w)));
    shown = 0;
    el.list.innerHTML = '';
    render();
    writeHash();
  }

  function render() {
    const place = [el.city.value, el.local.selectedOptions[0] && el.local.value ? el.local.selectedOptions[0].text : ''].filter(Boolean).join(' ');
    const nK = hits.filter((r) => r.kind === 'K').length, nV = hits.length - nK;
    const parts = [];
    if (nK) parts.push(`강좌이용권 시설 <b>${nK.toLocaleString()}</b>곳`);
    if (nV) parts.push(`운동 바우처 기관 <b>${nV.toLocaleString()}</b>곳`);
    el.count.innerHTML = `${place ? esc(place) + ' · ' : ''}${parts.join(', ') || '<b>0</b>곳'}`;
    if (!hits.length) {
      el.list.innerHTML = '<li class="empty">조건에 맞는 시설이 없습니다.<br>종목을 "전체"로 바꾸거나 옆 지역을 골라 보세요.</li>';
      el.more.hidden = true;
      return;
    }
    const next = hits.slice(shown, shown + PAGE);
    el.list.insertAdjacentHTML('beforeend', next.map(card).join(''));
    shown += next.length;
    el.more.hidden = shown >= hits.length;
    el.more.textContent = `더 보기 (${(hits.length - shown).toLocaleString()}곳 남음)`;
  }

  function card(r) {
    const full = [r.addr, r.daddr].filter(Boolean).join(' ');
    const mapQ = encodeURIComponent(r.addr || r.name);
    const call = r.tel
      ? `<a class="act call" href="tel:${esc(r.tel.replace(/-/g, ''))}" aria-label="${esc(r.name)}에 전화하기">☎ ${esc(r.tel)}</a>`
      : '<span class="act none">전화번호 미등록</span>';
    return `<li class="card">
      <div class="badges">${r.kind === 'V'
        ? `<span class="badge voucher">운동 바우처</span><span class="badge voucher">${esc(r.sport)}</span>`
        : `<span class="badge">강좌이용권</span><span class="badge">${esc(r.sport)}</span>`}<span class="badge region">${esc(r.city)} ${esc(r.local)}</span></div>
      <h2>${esc(r.name)}</h2>
      <p class="addr">${esc(full)}</p>
      <div class="actions">
        ${call}
        <a class="act" href="https://map.naver.com/p/search/${mapQ}" target="_blank" rel="noopener" aria-label="${esc(r.name)} 네이버 지도에서 보기 (새 창)">지도 보기</a>
      </div>
    </li>`;
  }

  // 주소창에 조건을 남겨 두면 링크로 공유할 수 있음
  function writeHash() {
    const p = new URLSearchParams();
    if (kindValue()) p.set('kind', kindValue());
    if (el.city.value) p.set('city', el.city.value);
    if (el.local.value) p.set('local', el.local.value);
    if (el.sport.value) p.set('sport', el.sport.value);
    if (el.q.value.trim()) p.set('q', el.q.value.trim());
    const s = p.toString();
    if (location.hash.startsWith('#facility')) history.replaceState(null, '', s ? '#facility?' + s : '#facility');
  }

  function readHash() {
    const i = location.hash.indexOf('?');
    if (i < 0 || !location.hash.startsWith('#facility')) return;
    const p = new URLSearchParams(location.hash.slice(i + 1));
    const k = el.form.querySelector(`input[name="kind"][value="${p.get('kind') || ''}"]`);
    if (k) { k.checked = true; fillSports(); }
    if (p.get('city')) { el.city.value = p.get('city'); fillLocals(); }
    if (p.get('local')) el.local.value = p.get('local');
    fillSports();
    if (p.get('sport')) el.sport.value = p.get('sport');
    if (p.get('q')) el.q.value = p.get('q');
  }

  let timer;
  el.city.addEventListener('change', () => { fillLocals(); fillSports(); search(); });
  el.local.addEventListener('change', () => { fillSports(); search(); });
  el.sport.addEventListener('change', search);
  el.q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 200); });
  el.form.addEventListener('submit', (e) => { e.preventDefault(); search(); });
  el.form.querySelectorAll('input[name="kind"]').forEach((k) => k.addEventListener('change', () => { fillSports(); search(); }));
  el.form.addEventListener('reset', () => setTimeout(() => { fillLocals(); fillSports(); search(); }, 0));
  el.more.addEventListener('click', render);
})();
