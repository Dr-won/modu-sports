// 모두의 특수체육 — 지역 공백 보기
(function () {
  const $ = (id) => document.getElementById(id);
  const el = {
    tiles: $('gtiles'), metric: $('gmetric'), group: $('ggroup'), base: $('gbase'), toggle: $('gtoggle'),
    caption: $('gcaption'), chart: $('gchart'), table: $('gtable'), note: $('gnote'), tip: $('gtip'),
    local: $('glocal'), localTitle: $('glocal-title'), localTable: $('glocal-table'),
  };
  const METRIC = {
    fac: { label: '스포츠강좌이용권 등록시설', unit: '곳' },
    crs: { label: '강좌', unit: '개' },
    vou: { label: '장애인 운동·재활 바우처 기관', unit: '곳' },
    use: { label: '강좌이용권 이용 기록(합성)', unit: '건' },
  };
  const NOTES = {
    fac: '등록시설: 체육공단 장애인스포츠강좌이용권 등록시설 정보. 등록장애인 수: 보건복지부 2024년.',
    crs: '강좌: 사업자번호로 시설 위치가 확인된 강좌만 셉니다(전체의 약 67%). 장애유형을 고르면 그 유형 등록장애인 수로 나눕니다.',
    vou: '운동·재활 바우처 기관: 한국사회보장정보원 사회서비스 제공기관 중 장애인 대상 운동·재활 서비스(뇌졸중·뇌혈관질환자 재활 포함). 지역사회서비스투자사업은 시도마다 사업이 달라 0곳인 시도가 많습니다.',
    use: '이용 기록: 체육공단이 원본의 통계적 특성을 흉내 내어 만든 합성 데이터입니다. 실제 이용 실적이 아니므로 경향 참고용으로만 보세요.',
  };

  let loaded = false, data = null, selected = null, tableMode = false;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, per) => per ? v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : Math.round(v).toLocaleString();

  function activate() {
    if (loaded) return;
    loaded = true;
    fetch('data/gap.json').then((r) => r.json()).then((d) => {
      data = d;
      el.group.innerHTML = d.groups.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
      readHash();
      render();
    }).catch(() => { el.caption.textContent = '데이터를 불러오지 못했습니다.'; });
  }

  // 시도별 값 계산
  function values() {
    const m = el.metric.value, per = el.base.value === 'per';
    const g = m === 'crs' ? el.group.value : '전체';
    return data.sido.map((s) => {
      const count = m === 'fac' ? s.fac : m === 'vou' ? s.vou : m === 'use' ? s.use : (s.crs[g] || 0);
      const pop = s.dis[g] || 0;
      return { name: s.name, count, pop, v: per ? (pop ? count / pop * 1e4 : 0) : count };
    });
  }

  function render() {
    const m = el.metric.value, per = el.base.value === 'per', meta = METRIC[m];
    el.group.disabled = m !== 'crs';
    if (m !== 'crs') el.group.value = '전체';
    const g = el.group.value;
    const rows = values().sort((a, b) => b.v - a.v);
    const totalCount = rows.reduce((a, r) => a + r.count, 0), totalPop = rows.reduce((a, r) => a + r.pop, 0);
    const avg = per ? totalCount / totalPop * 1e4 : totalCount / rows.length;
    const max = Math.max(...rows.map((r) => r.v), avg) || 1;
    const who = m === 'crs' && g !== '전체' ? `${g} 장애인` : '등록장애인';
    const what = m === 'crs' ? (g === '전체' ? '강좌' : `${g} 대상 강좌`) : meta.label;
    el.caption.textContent = per ? `${who} 1만 명당 ${what} 수` : `시도별 ${what} 수`;
    el.note.textContent = NOTES[m];

    tiles(rows, avg, per, meta.unit);

    const avgFrac = avg / max;
    el.chart.innerHTML = rows.map((r) => {
      const pct = r.v / max * 100;
      const text = `${fmt(r.v, per)}${per ? '' : meta.unit}`;
      return `<div class="bar-row${selected === r.name ? ' is-selected' : ''}" role="listitem">
        <button type="button" class="bar-hit" data-sido="${esc(r.name)}"
          aria-label="${esc(r.name)} ${text}${per ? ` (${what} ${r.count.toLocaleString()}${meta.unit}, ${who} ${r.pop.toLocaleString()}명)` : ''}. 눌러서 시군구 보기">
          <span class="bar-name">${esc(r.name)}</span>
          <span class="bar-track"><span class="bar" style="width:${pct.toFixed(2)}%"></span><span class="bar-val">${text}</span></span>
        </button>
      </div>`;
    }).join('') + `<div class="avg-line" style="--avg:${avgFrac.toFixed(4)}"><span>${per ? '전국' : '평균'} ${fmt(avg, per)}</span></div>`;

    el.table.innerHTML = `<table class="gt"><thead><tr><th scope="col">시도</th><th scope="col">${esc(what)} (${meta.unit})</th><th scope="col">${esc(who)} (명)</th><th scope="col">1만 명당</th></tr></thead><tbody>` +
      rows.map((r) => `<tr><th scope="row">${esc(r.name)}</th><td>${r.count.toLocaleString()}</td><td>${r.pop.toLocaleString()}</td><td>${r.pop ? fmt(r.count / r.pop * 1e4, true) : '-'}</td></tr>`).join('') +
      '</tbody></table>';
    el.chart.hidden = tableMode;
    el.table.hidden = !tableMode;
    writeHash();
  }

  function tiles(rows, avg, per, unit) {
    const pos = rows.filter((r) => r.v > 0);
    const top = rows[0], low = pos.length ? pos[pos.length - 1] : rows[rows.length - 1];
    const zero = rows.filter((r) => r.v === 0).map((r) => r.name);
    const ratio = low && low.v ? top.v / low.v : 0;
    const u = per ? '' : unit;
    el.tiles.innerHTML = [
      [per ? '전국 평균' : '시도 평균', fmt(avg, per) + u],
      ['가장 많은 곳', `${top.name} ${fmt(top.v, per)}${u}`],
      [zero.length ? '0인 시도' : '가장 적은 곳', zero.length ? `${zero.length}곳` : `${low.name} ${fmt(low.v, per)}${u}`],
      ['최다 ÷ 최소', ratio ? ratio.toFixed(1) + '배' : '-'],
    ].map(([k, v]) => `<div class="tile"><p class="tile-label">${k}</p><p class="tile-value">${esc(v)}</p></div>`).join('');
  }

  // 시군구 표
  function showLocal(sido) {
    selected = sido;
    const list = data.local.filter((l) => l[0] === sido);
    el.localTitle.textContent = `${sido} 시군구별 현황 (${list.length}곳)`;
    const cell = (v) => v ? v.toLocaleString() : '<span class="zero">없음</span>';
    el.localTable.innerHTML = '<thead><tr><th scope="col">시군구</th><th scope="col">강좌이용권 시설</th><th scope="col">위치 확인 강좌</th><th scope="col">운동·재활 바우처</th><th scope="col">이용 기록(합성)</th></tr></thead><tbody>' +
      list.sort((a, b) => a[3] - b[3]).map((l) => `<tr><th scope="row">${esc(l[2])}</th><td>${cell(l[3])}</td><td>${cell(l[5])}</td><td>${cell(l[4])}</td><td>${cell(l[6])}</td></tr>`).join('') +
      '</tbody>';
    el.local.hidden = false;
    render();
    el.local.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // 막대 위에 올리면 자세한 수치
  el.chart.addEventListener('mousemove', (e) => {
    const b = e.target.closest('.bar-hit');
    if (!b) { el.tip.hidden = true; return; }
    const r = values().find((x) => x.name === b.dataset.sido), meta = METRIC[el.metric.value];
    el.tip.innerHTML = `<b>${esc(r.name)}</b><br>${meta.label} ${r.count.toLocaleString()}${meta.unit}<br>등록장애인 ${r.pop.toLocaleString()}명` +
      (r.pop ? `<br>1만 명당 ${fmt(r.count / r.pop * 1e4, true)}` : '');
    el.tip.hidden = false;
    el.tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 220) + 'px';
    el.tip.style.top = e.clientY + 14 + 'px';
  });
  el.chart.addEventListener('mouseleave', () => { el.tip.hidden = true; });
  el.chart.addEventListener('click', (e) => { const b = e.target.closest('.bar-hit'); if (b) showLocal(b.dataset.sido); });

  function writeHash() {
    if (!location.hash.startsWith('#gap')) return;
    const p = new URLSearchParams();
    if (el.metric.value !== 'fac') p.set('metric', el.metric.value);
    if (el.group.value && el.group.value !== '전체') p.set('group', el.group.value);
    if (el.base.value !== 'per') p.set('base', el.base.value);
    if (selected) p.set('sido', selected);
    const s = p.toString();
    history.replaceState(null, '', s ? '#gap?' + s : '#gap');
  }

  function readHash() {
    const i = location.hash.indexOf('?');
    if (i < 0) return;
    const p = new URLSearchParams(location.hash.slice(i + 1));
    if (p.get('metric')) el.metric.value = p.get('metric');
    if (p.get('group')) el.group.value = p.get('group');
    if (p.get('base')) el.base.value = p.get('base');
    if (p.get('sido')) setTimeout(() => showLocal(p.get('sido')), 0);
  }

  [el.metric, el.group, el.base].forEach((s) => s.addEventListener('change', render));
  el.toggle.addEventListener('click', () => {
    tableMode = !tableMode;
    el.toggle.setAttribute('aria-pressed', String(tableMode));
    el.toggle.textContent = tableMode ? '그래프로 보기' : '표로 보기';
    render();
  });

  window.gapView = { activate };
})();
