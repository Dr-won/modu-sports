// 모두의 특수체육 — 홈: 나의 정보 → 맞춤 복지서비스 · 맞춤 운동
// 답한 내용은 이 기기 안에서만 계산한다. 사용자가 [저장]을 누를 때만 이 브라우저(localStorage)에 남기고, 서버로는 보내지 않는다.
(function () {
  const STORE = 'modu.profile.v1';
  const $ = (id) => document.getElementById(id);
  const el = { wizard: $('fit-wizard'), bar: $('fit-bar'), count: $('fit-count'), step: $('fit-step'), prev: $('fit-prev'), next: $('fit-next'), result: $('fit-result') };
  const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
  const VOUCHER_MAX = 110000; // 2026년 장애인스포츠강좌이용권 월 지원 한도
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let loaded = false, dtypes = [], courses = [], fac = [], regions = {}, sports = [], welfare = [];
  let i = 0;
  const a = { who: '', age: '', dtype: '', degree: '', income: '', city: '', local: '', days: [], time: '', sport: '' };

  const STEPS = [
    { key: 'who', q: () => '누구의 정보를 넣을까요?', type: 'choice', options: () => [['self', '나(본인)'], ['family', '자녀·가족']] },
    { key: 'age', q: () => a.who === 'family' ? '그분의 나이(만 나이)는요?' : '나이(만 나이)가 어떻게 되세요?', type: 'age' },
    { key: 'dtype', q: () => '장애유형을 골라 주세요', type: 'choice',
      options: () => dtypes.map((d, n) => [String(n), d]).concat([['', '잘 모르겠어요']]) },
    { key: 'degree', q: () => '장애 정도는요?', type: 'choice',
      options: () => [['severe', '심한 장애'], ['mild', '심하지 않은 장애'], ['unknown', '잘 모르겠어요']],
      note: '장애등급제는 2019년에 폐지되어 지금은 두 단계로 나뉘어요. "심한 장애"가 예전 중증(1~3급)에 해당해요.' },
    { key: 'income', q: () => '가구의 소득 구분은요?', type: 'choice',
      options: () => [['basic', '기초생활수급자'], ['near', '차상위계층 · 법정 한부모가족'], ['none', '해당 없음'], ['unknown', '잘 모르겠어요']],
      note: '강좌이용권 우선순위와 복지서비스 안내에만 써요.' },
    { key: 'region', q: () => '어디에 사세요?', type: 'region' },
    { key: 'days', q: () => '운동할 수 있는 요일과 시간대는요?', type: 'days', note: '고르지 않으면 모든 요일·시간을 보여 드려요.' },
    { key: 'sport', q: () => '관심 있는 종목이 있나요?', type: 'sport' },
  ];

  function activate() {
    if (loaded) return;
    loaded = true;
    el.step.innerHTML = '<p class="hint">불러오는 중…</p>';
    Promise.all([fetch('data/courses.json').then((r) => r.json()), fetch('data/facilities.json').then((r) => r.json()), fetch('data/welfare.json').then((r) => r.json())])
      .then(([c, f, w]) => {
        welfare = w.rows.map((r) => ({ level: r[0], name: r[1], sum: r[2], target: r[3], benefit: r[4], type: r[5], cycle: r[6], contact: r[7], link: r[8], life: r[9], who: r[10], city: r[11], sgg: r[12], apply: r[13] }));
        dtypes = c.dtypes;
        const places = c.places.map((p) => ({ name: p[0], city: p[1], localCd: p[2], local: p[3], addr: p[4], daddr: p[5], tel: p[6] }));
        courses = c.rows.map((r) => ({ name: r[0], sport: r[1], mask: r[2], days: r[3], start: r[4], end: r[5], fee: r[6], desc: r[7], place: r[8] >= 0 ? places[r[8]] : null }));
        fac = f.rows.map((r) => ({ kind: r[0], name: r[1], sport: r[2], city: r[3], localCd: r[4], local: r[5], addr: r[6], daddr: r[7], tel: r[8] }));
        fac.forEach((r) => { (regions[r.city] = regions[r.city] || {})[r.localCd] = r.local; });
        const cnt = {};
        courses.forEach((r) => { cnt[r.sport] = (cnt[r.sport] || 0) + 1; });
        sports = Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x]);
        const saved = loadProfile();
        if (saved) { Object.assign(a, saved); result(); } else draw();
      })
      .catch(() => { el.step.innerHTML = '<p class="hint">데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>'; });
  }

  // ── 질문 화면 ─────────────────────────────
  function draw() {
    const s = STEPS[i];
    el.bar.style.width = ((i + 1) / STEPS.length * 100) + '%';
    el.count.textContent = `${i + 1} / ${STEPS.length}`;
    el.prev.hidden = i === 0;
    el.next.textContent = i === STEPS.length - 1 ? '결과 보기' : '다음';
    let body = '';
    if (s.type === 'choice') {
      body = `<div class="choices" role="radiogroup" aria-label="${esc(s.q())}">` + s.options().map(([v, t]) =>
        `<button type="button" class="choice${a[s.key] === v && a[s.key + 'Set'] ? ' on' : ''}" role="radio" aria-checked="${a[s.key] === v && !!a[s.key + 'Set']}" data-v="${esc(v)}">${esc(t)}</button>`).join('') + '</div>';
    } else if (s.type === 'age') {
      body = `<label class="big-input"><input id="fit-age" type="number" inputmode="numeric" min="0" max="120" value="${esc(a.age)}" aria-label="만 나이"> 세</label>`;
    } else if (s.type === 'region') {
      const cities = Object.keys(regions).sort((x, y) => x.localeCompare(y, 'ko'));
      const locals = a.city ? Object.entries(regions[a.city]).sort((x, y) => x[1].localeCompare(y[1], 'ko')) : [];
      body = `<div class="two">
        <label class="field"><span>시·도</span><select id="fit-city"><option value="">골라 주세요</option>${cities.map((c) => `<option${c === a.city ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="field"><span>시·군·구</span><select id="fit-local"${a.city ? '' : ' disabled'}><option value="">전체</option>${locals.map(([cd, nm]) => `<option value="${esc(cd)}"${cd === a.local ? ' selected' : ''}>${esc(nm)}</option>`).join('')}</select></label>
      </div>`;
    } else if (s.type === 'days') {
      body = `<div class="choices days-pick">${DAYS.map((d, n) => `<button type="button" class="choice sm${a.days.includes(n) ? ' on' : ''}" aria-pressed="${a.days.includes(n)}" data-day="${n}">${d}</button>`).join('')}</div>
        <div class="choices">${[['', '시간 상관없음'], ['am', '오전'], ['pm', '오후'], ['ev', '저녁']].map(([v, t]) => `<button type="button" class="choice sm${a.time === v ? ' on' : ''}" aria-pressed="${a.time === v}" data-time="${v}">${t}</button>`).join('')}</div>`;
    } else if (s.type === 'sport') {
      body = `<div class="choices">${[''].concat(sports.slice(0, 15)).map((sp) => `<button type="button" class="choice sm${a.sport === sp ? ' on' : ''}" aria-pressed="${a.sport === sp}" data-sport="${esc(sp)}">${sp ? esc(sp) : '상관없음'}</button>`).join('')}</div>`;
    }
    el.step.innerHTML = `<h2 class="q">${esc(s.q())}</h2>${s.note ? `<p class="hint">${esc(s.note)}</p>` : ''}${body}<p class="err" id="fit-err" role="alert"></p>`;
    // 사용자가 넘어온 뒤에만 첫 입력으로 초점 이동 (처음 열 때 골라진 것처럼 보이지 않게)
    if (moved) {
      const first = el.step.querySelector('input, select') || el.step.querySelector('.q');
      if (first) { if (first.classList.contains('q')) first.tabIndex = -1; first.focus({ preventScroll: true }); }
    }
  }
  let moved = false;

  el.step.addEventListener('click', (e) => {
    const s = STEPS[i], b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.v !== undefined) { a[s.key] = b.dataset.v; a[s.key + 'Set'] = true; go(1); return; }
    if (b.dataset.day !== undefined) { const d = +b.dataset.day; a.days = a.days.includes(d) ? a.days.filter((x) => x !== d) : a.days.concat(d); draw(); return; }
    if (b.dataset.time !== undefined) { a.time = b.dataset.time; draw(); return; }
    if (b.dataset.sport !== undefined) { a.sport = b.dataset.sport; draw(); }
  });
  el.step.addEventListener('change', (e) => {
    if (e.target.id === 'fit-city') { a.city = e.target.value; a.local = ''; draw(); }
    if (e.target.id === 'fit-local') a.local = e.target.value;
  });
  el.step.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'fit-age') { e.preventDefault(); go(1); } });

  function valid() {
    const s = STEPS[i], err = $('fit-err');
    if (s.type === 'age') {
      const v = $('fit-age').value.trim();
      if (v === '' || isNaN(+v) || +v < 0 || +v > 120) { err.textContent = '나이를 숫자로 넣어 주세요.'; return false; }
      a.age = String(Math.floor(+v));
    }
    if (s.type === 'choice' && !a[s.key + 'Set']) { err.textContent = '하나를 골라 주세요.'; return false; }
    if (s.type === 'region' && !a.city) { err.textContent = '시·도를 골라 주세요.'; return false; }
    return true;
  }

  function go(d) {
    if (d > 0 && !valid()) return;
    if (i + d >= STEPS.length) { result(); return; }
    i = Math.max(0, i + d);
    moved = true;
    draw();
  }
  el.next.addEventListener('click', () => go(1));
  el.prev.addEventListener('click', () => go(-1));

  // ── 결과 ─────────────────────────────────
  function priority(age, inc) {
    const young = age <= 18;
    const map = young ? { basic: 1, near: 1, none: 4, unknown: '1 또는 4' } : { basic: 2, near: 3, none: 5, unknown: '2~5' };
    return map[inc];
  }

  // 바우처 서비스명에 드러난 대상(성인·청소년·노인, 발달·뇌병변)과 맞지 않으면 추천에서 뺌
  function voucherFits(name, age) {
    if (/성인/.test(name) && age < 19) return false;
    if (/청소년|아동/.test(name) && !/성인|노인/.test(name) && age >= 19) return false;
    if (/^노인[^·]/.test(name) && age < 65) return false;
    const dname = a.dtype === '' ? '' : dtypes[+a.dtype];
    if (/발달 및 뇌병변/.test(name) && dname && !['지적·자폐', '뇌병변'].includes(dname)) return false;
    return true;
  }

  function inTime(start) {
    if (!a.time) return true;
    const h = parseInt(start, 10);
    if (isNaN(h)) return false;
    return a.time === 'am' ? h < 12 : a.time === 'pm' ? h >= 12 && h < 18 : h >= 18;
  }

  // ── 나의 정보 저장 (이 브라우저에만) ───────────
  const KEYS = ['who', 'age', 'dtype', 'degree', 'income', 'city', 'local', 'days', 'time', 'sport'];
  function loadProfile() {
    try { const p = JSON.parse(localStorage.getItem(STORE) || 'null'); return p && p.city ? p : null; } catch (e) { return null; }
  }
  function saveProfile() {
    const p = {};
    KEYS.forEach((k) => { p[k] = a[k]; });
    ['who', 'dtype', 'degree', 'income'].forEach((k) => { p[k + 'Set'] = true; });
    try { localStorage.setItem(STORE, JSON.stringify(p)); return true; } catch (e) { return false; }
  }
  function clearProfile() { try { localStorage.removeItem(STORE); } catch (e) { /* 저장소를 못 쓰는 브라우저 */ } }

  // ── 복지서비스 고르기 ────────────────────────
  function lifeStage(age) {
    return age <= 5 ? '영유아' : age <= 12 ? '아동' : age <= 18 ? '청소년' : age <= 34 ? '청년' : age <= 64 ? '중장년' : '노년';
  }
  // 서비스명에 특정 장애유형이 드러나면 그 유형만 (예: 발달장애 → 지적·자폐)
  const TYPE_WORDS = [[/발달장애|자폐|지적장애/, '지적·자폐'], [/시각/, '시각'], [/청각|농아|수어|난청|인공달팽이/, '청각·언어'], [/뇌병변/, '뇌병변'], [/지체/, '지체']];
  function welfareFor(age) {
    const stage = lifeStage(age), dname = a.dtype === '' ? '' : dtypes[+a.dtype];
    const localName = a.local ? regions[a.city][a.local] : '';
    const ok = (w) => {
      if (w.life.length && !w.life.includes(stage)) return false;
      if (/중증/.test(w.name) && a.degree === 'mild') return false;
      if (/장애아|장애아동/.test(w.name) && age > 18) return false;
      const types = TYPE_WORDS.filter(([re]) => re.test(w.name)).map(([, t]) => t);
      if (dname && types.length && !types.includes(dname)) return false;
      return true;
    };
    const score = (w) => (/장애|발달|중증/.test(w.name) ? 3 : 0) + (w.who.length === 1 ? 2 : 0) +
      (w.sgg && w.sgg === localName ? 2 : 0) - (isLow(w) && a.income === 'none' ? 4 : 0);
    const sort = (list) => list.sort((x, y) => score(y) - score(x));
    const local = sort(welfare.filter((w) => w.level === 'L' && w.city === a.city && (!w.sgg || w.sgg === '-' || !localName || w.sgg === localName) && ok(w)));
    const central = sort(welfare.filter((w) => w.level === 'C' && ok(w)));
    return { local, central, stage, localName };
  }

  function isLow(w) { return w.who.includes('저소득') || /저소득|수급자|차상위/.test(w.name); }

  function welfareCard(w) {
    const low = isLow(w);
    return `<li class="card wcard">
      <div class="badges">${w.level === 'L' ? `<span class="badge region">${esc(w.sgg && w.sgg !== '-' ? w.sgg : w.city)}</span>` : '<span class="badge region">전국</span>'}${w.type ? `<span class="badge">${esc(w.type)}</span>` : ''}${low ? '<span class="badge voucher">저소득 조건</span>' : ''}</div>
      <h2>${esc(w.name)}</h2>
      ${w.sum ? `<p class="desc">${esc(w.sum)}</p>` : ''}
      ${w.target || w.benefit ? `<details><summary>누가, 무엇을 받나요?</summary>${w.target ? `<p><b>대상</b> ${esc(w.target)}</p>` : ''}${w.benefit ? `<p><b>내용</b> ${esc(w.benefit)}</p>` : ''}</details>` : ''}
      <div class="actions">
        ${w.link ? `<a class="act call" href="${esc(w.link)}" target="_blank" rel="noopener" aria-label="${esc(w.name)} 복지로에서 자세히 보기 (새 창)">복지로에서 보기</a>` : ''}
        ${w.contact ? `<span class="act none" title="문의">문의 ${esc(w.contact.length > 22 ? w.contact.slice(0, 22) + '…' : w.contact)}</span>` : ''}
      </div>
    </li>`;
  }

  function welfareSection(age) {
    const { local, central, stage } = welfareFor(age);
    const list = (arr, id) => `<ul class="cards" id="${id}">${arr.slice(0, 6).map(welfareCard).join('')}</ul>` +
      (arr.length > 6 ? `<div class="more-wrap"><button type="button" class="btn-ghost" data-more="${id}">${arr.length - 6}개 더 보기</button></div>` : '');
    window.__welfare = { local, central };
    return `<section class="fit-sec" id="sec-welfare">
      <h3>나에게 맞는 복지서비스 <b>${(local.length + central.length).toLocaleString()}</b>개 <span class="muted">(${esc(stage)} · 장애인 대상)</span></h3>
      <h4 class="subh">우리 지역 서비스 <b>${local.length}</b>개</h4>
      ${local.length ? list(local, 'wl-local') : '<p class="empty">우리 지역에 등록된 장애인 대상 지자체 서비스가 없어요.</p>'}
      <h4 class="subh">전국 공통 서비스 <b>${central.length}</b>개</h4>
      ${central.length ? list(central, 'wl-central') : ''}
      <p class="hint">복지로(한국사회보장정보원) 공개 정보로 고른 <b>받을 수 있을 가능성이 있는</b> 서비스예요. 실제 자격은 소득·장애 정도 등 기준에 따라 기관이 정해요. 가까운 주민센터(행정복지센터)나 129 보건복지상담센터에 문의해 주세요.</p>
    </section>`;
  }

  function profileCard(saved) {
    const dname = a.dtype === '' ? '장애유형 모름' : dtypes[+a.dtype];
    const deg = { severe: '심한 장애', mild: '심하지 않은 장애', unknown: '장애 정도 모름' }[a.degree] || '';
    const inc = { basic: '기초생활수급', near: '차상위·한부모', none: '소득 조건 해당 없음', unknown: '소득 구분 모름' }[a.income] || '';
    const localName = a.local ? regions[a.city][a.local] : '';
    const chips = [a.who === 'family' ? '자녀·가족' : '본인', `만 ${a.age}세`, dname, deg, inc, `${a.city}${localName ? ' ' + localName : ''}`]
      .filter(Boolean).map((c) => `<span class="chip">${esc(c)}</span>`).join('');
    return `<div class="profile">
      <div class="profile-top"><p class="fit-tag">나의 정보</p>
        <div class="profile-btns">
          <button type="button" class="btn-ghost sm" id="fit-edit">수정하기</button>
          ${saved ? '<button type="button" class="btn-ghost sm" id="fit-clear">이 기기에서 지우기</button>' : '<button type="button" class="btn sm" id="fit-save">이 기기에 저장</button>'}
        </div>
      </div>
      <div class="chips">${chips}</div>
      <p class="hint" id="fit-savemsg">${saved ? '이 기기(브라우저)에만 저장되어 있어요. 서버로 보내지 않아요.' : '저장하면 다음에 들어올 때 바로 맞춤 결과를 보여 드려요. 이 기기에만 저장돼요.'}</p>
      <nav class="jump" aria-label="바로가기"><a href="#sec-welfare" data-jump>복지서비스</a><a href="#sec-sport" data-jump>체육 지원·강좌</a><a href="#sec-voucher" data-jump>운동 바우처</a></nav>
    </div>`;
  }

  function result() {
    const age = +a.age, bit = a.dtype === '' ? 0 : 1 << +a.dtype;
    const dname = a.dtype === '' ? '' : dtypes[+a.dtype];
    const localName = a.local ? regions[a.city][a.local] : '';
    const place = `${a.city}${localName ? ' ' + localName : ''}`;

    // 강좌: 장애유형·지역·요일·시간·종목이 맞는 것. 같은 시군구 → 요일 많이 겹침 → 수강료 순
    const picked = courses.filter((r) => r.place && r.place.city === a.city && (!a.local || r.place.localCd === a.local) &&
      (!bit || (r.mask & bit)) && (!a.sport || r.sport === a.sport) && inTime(r.start) &&
      (!a.days.length || a.days.some((d) => r.days[d] === '1')))
      .map((r) => ({ r, overlap: a.days.filter((d) => r.days[d] === '1').length }))
      .sort((x, y) => y.overlap - x.overlap || x.r.fee - y.r.fee);

    const vouchers = fac.filter((f) => f.kind === 'V' && f.city === a.city && voucherFits(f.sport, age))
      .sort((x, y) => (y.localCd === a.local) - (x.localCd === a.local));
    const nearV = a.local ? vouchers.filter((f) => f.localCd === a.local) : vouchers;
    const kCount = fac.filter((f) => f.kind === 'K' && f.city === a.city && (!a.local || f.localCd === a.local)).length;

    // ① 지원 안내
    let support;
    if (age >= 5 && age <= 69) {
      const p = priority(age, a.income);
      support = `<div class="fit-card ok">
        <p class="fit-tag">받을 수 있는 지원</p>
        <h3>장애인스포츠강좌이용권 신청 대상이에요</h3>
        <ul>
          <li>등록 장애인 · 만 5~69세 → 월 최대 <b>11만 원</b>, 12개월 이내 수강료 지원</li>
          <li>예상 선정 우선순위: <b>${esc(p)}순위</b> <span class="muted">(1~5순위, 2026년 기준)</span></li>
          <li>장애 정도(심한/심하지 않은)는 신청 자격에 영향이 없어요.</li>
          <li>2026년 신청은 마감되었어요(2025.11.10~28). 다음 신청 일정은 누리집에서 확인해 주세요.</li>
        </ul>
        <div class="actions">
          <a class="act call" href="https://dvoucher.kspo.or.kr" target="_blank" rel="noopener">신청 누리집 가기</a>
          <a class="act" href="tel:15510078">☎ 1551-0078</a>
        </div>
      </div>`;
    } else {
      support = `<div class="fit-card warn">
        <p class="fit-tag">받을 수 있는 지원</p>
        <h3>강좌이용권은 만 5~69세가 대상이에요</h3>
        <p>입력한 나이(${age}세)는 대상 밖이에요. 아래의 <b>장애인 운동 바우처 기관</b>이나 지역 장애인체육회·복지관 프로그램을 알아보세요.</p>
      </div>`;
    }

    const courseCards = picked.slice(0, 12).map(({ r }) => {
      const p = r.place, mapQ = encodeURIComponent(p.addr || p.name);
      return `<li class="card">
        <div class="badges"><span class="badge">${esc(r.sport)}</span>${r.fee <= VOUCHER_MAX ? '<span class="badge ok">이용권 한도 안</span>' : ''}</div>
        <h2>${esc(r.name)}</h2>
        <div class="week" role="img" aria-label="운영 요일 ${DAYS.filter((_, n) => r.days[n] === '1').join('·')}">${DAYS.map((d, n) => `<span class="day${r.days[n] === '1' ? ' on' : ''}" aria-hidden="true">${d}</span>`).join('')}</div>
        <p class="meta"><span>${r.start ? esc(r.start) + '~' + esc(r.end) : '시간 정보 없음'}</span><span class="fee">${r.fee.toLocaleString()}원</span></p>
        <p class="place"><b>${esc(p.name)}</b> · ${esc(p.local)}<br>${esc(p.addr)}</p>
        <div class="actions">${p.tel ? `<a class="act call" href="tel:${esc(p.tel.replace(/-/g, ''))}">☎ ${esc(p.tel)}</a>` : ''}<a class="act" href="https://map.naver.com/p/search/${mapQ}" target="_blank" rel="noopener">지도 보기</a></div>
      </li>`;
    }).join('');

    const vCards = (nearV.length ? nearV : vouchers).slice(0, 6).map((f) => `<li class="card">
        <div class="badges"><span class="badge voucher">운동 바우처</span><span class="badge region">${esc(f.local)}</span></div>
        <h2>${esc(f.name)}</h2>
        <p class="desc">${esc(f.sport)}</p>
        <p class="addr">${esc([f.addr, f.daddr].filter(Boolean).join(' '))}</p>
        <div class="actions">${f.tel ? `<a class="act call" href="tel:${esc(f.tel.replace(/-/g, ''))}">☎ ${esc(f.tel)}</a>` : ''}<a class="act" href="https://map.naver.com/p/search/${encodeURIComponent(f.addr || f.name)}" target="_blank" rel="noopener">지도 보기</a></div>
      </li>`).join('');

    const q = new URLSearchParams();
    if (a.dtype !== '') q.set('dtype', a.dtype);
    if (a.days.length) q.set('days', a.days.slice().sort().join(''));
    if (a.time) q.set('time', a.time);
    if (a.sport) q.set('sport', a.sport);
    q.set('city', a.city);
    if (a.local) q.set('local', a.local);
    const fq = new URLSearchParams({ city: a.city });
    if (a.local) fq.set('local', a.local);

    const cond = [dname && `${dname} 장애`, a.days.length && DAYS.filter((_, n) => a.days.includes(n)).join('·'), a.time && { am: '오전', pm: '오후', ev: '저녁' }[a.time], a.sport].filter(Boolean).join(' · ');

    el.result.innerHTML = `
      ${profileCard(!!loadProfile())}
      ${welfareSection(age)}
      <section class="fit-sec" id="sec-sport">
      <h3>나에게 맞는 체육 지원</h3>
      ${support}
        <h3>맞춤 강좌 <b>${picked.length.toLocaleString()}</b>개 ${picked.length > 12 ? '<span class="muted">(가까운 순 12개)</span>' : ''}</h3>
        ${picked.length ? `<ul class="cards">${courseCards}</ul>` : `<p class="empty">조건에 맞는 강좌가 없어요. 요일·시간이나 종목을 넓혀 보세요.${a.local ? ' 시·군·구를 "전체"로 바꿔 보셔도 좋아요.' : ''}</p>`}
        <p class="more-link"><a href="#course?${q.toString()}">강좌 찾기에서 조건 바꿔 더 보기 →</a></p>
      </section>
      <section class="fit-sec" id="sec-voucher">
        <h3>가까운 장애인 운동 바우처 기관 <b>${nearV.length}</b>곳${a.local && !nearV.length && vouchers.length ? ` <span class="muted">(${esc(a.city)} 전체 ${vouchers.length}곳 중 일부)</span>` : ''}</h3>
        ${vouchers.length ? `<ul class="cards">${vCards}</ul>` : `<p class="empty">${esc(a.city)}에는 나이·장애유형에 맞는 장애인 운동 바우처 기관이 없어요. 지역마다 사업이 달라요.</p>`}
        <p class="hint">바우처 대상·본인부담은 시·군·구마다 달라요. 주민센터나 기관에 문의해 주세요.</p>
      </section>
      <section class="fit-sec">
        <h3>${esc(place)}의 강좌이용권 등록시설 <b>${kCount.toLocaleString()}</b>곳</h3>
        <p class="more-link"><a href="#facility?${fq.toString()}">시설 찾기에서 모두 보기 →</a></p>
      </section>
      <p class="hint">기준: 2026년 장애인스포츠강좌이용권 공고(지자체 안내), 체육공단·한국사회보장정보원(복지로) 공공데이터(2026-09-22).</p>`;
    el.wizard.hidden = true;
    el.result.hidden = false;
    document.querySelector('#view-fit .intro').hidden = true;
    window.scrollTo(0, 0);
  }

  // 결과 화면 버튼들 (한 번만 연결)
  el.result.addEventListener('click', (e) => {
    const t = e.target.closest('button, a');
    if (!t) return;
    if (t.id === 'fit-save') {
      const ok = saveProfile();
      $('fit-savemsg').textContent = ok ? '저장했어요. 이 기기(브라우저)에만 있고 서버로 보내지 않아요.' : '이 브라우저에서는 저장할 수 없어요.';
      if (ok) t.outerHTML = '<button type="button" class="btn-ghost sm" id="fit-clear">이 기기에서 지우기</button>';
    } else if (t.id === 'fit-clear') {
      clearProfile();
      $('fit-savemsg').textContent = '이 기기에서 지웠어요.';
      t.outerHTML = '<button type="button" class="btn sm" id="fit-save">이 기기에 저장</button>';
    } else if (t.id === 'fit-edit') {
      i = 0; moved = false;
      el.result.hidden = true; el.wizard.hidden = false;
      document.querySelector('#view-fit .intro').hidden = false;
      draw();
      window.scrollTo(0, 0);
    } else if (t.dataset.more) {
      const id = t.dataset.more, arr = id === 'wl-local' ? window.__welfare.local : window.__welfare.central;
      $(id).innerHTML = arr.map(welfareCard).join('');
      t.parentElement.remove();
    } else if (t.hasAttribute('data-jump')) {
      e.preventDefault();
      const target = document.querySelector(t.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  window.fitView = { activate };
})();
