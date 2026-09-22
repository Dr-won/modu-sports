// 모두의 특수체육 — 신청·문의 도우미
// 이용자가 원하는 내용을 고르면 기관에 보낼 문의 문장을 만들어 주고(문자 보내기·복사·전화 대본),
// 서비스별 신청 경로를 안내한다. 입력 내용은 이 기기 밖으로 보내지 않는다(문자는 이용자 휴대폰에서 직접 발송).
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
  const DEV_AREAS = ['심리운동', '감각발달재활', '운동발달재활', '언어재활', '놀이심리재활', '미술심리재활', '음악재활', '행동발달재활'];
  const BOKJIRO = {
    dev: 'https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00003195&wlfareInfoReldBztpCd=01',
  };

  // 카드에서 쓰는 등록부: 버튼에 id 만 달고, 누르면 여기서 기관 정보를 찾는다
  const reg = new Map();
  let seq = 0;
  function register(item) { const id = 'c' + (++seq); reg.set(id, item); return id; }
  function button(item, label) {
    return `<button type="button" class="act ask" data-ask="${register(item)}" aria-label="${esc(item.name)}에 신청·문의하기">${label || '✉ 신청·문의'}</button>`;
  }

  // 서비스 종류별 신청 경로 (자격·서류는 기관·주민센터 확인을 안내)
  function route(item) {
    switch (item.kind) {
      case 'course':
      case 'K':
        return ['<b>장애인스포츠강좌이용권</b>으로 수강하려면 먼저 이용권 대상자로 선정되어야 해요(만 5~69세 등록 장애인, 월 최대 11만 원).',
          '선정된 뒤 이 시설에 수강을 신청하고 이용권으로 결제해요.',
          '<a href="https://dvoucher.kspo.or.kr" target="_blank" rel="noopener">이용권 누리집</a> · 콜센터 <a href="tel:15510078">1551-0078</a>'];
      case 'D':
        return ['<b>발달재활서비스</b>는 만 18세 미만 등록 장애아동이 대상인 바우처예요.',
          '주소지 <b>주민센터(행정복지센터)</b>에 바우처를 신청하고, 선정되면 이 기관과 이용 계약을 맺어요. 복지로에서 온라인 신청도 돼요.',
          `<a href="${BOKJIRO.dev}" target="_blank" rel="noopener">복지로 발달재활서비스 안내</a>`];
      case 'V':
        return ['<b>지역사회서비스투자사업</b> 바우처 서비스예요. 소득 기준과 본인부담금이 있고 시·군·구마다 달라요.',
          '주소지 <b>주민센터(행정복지센터)</b>에 이 서비스 바우처를 신청하고, 선정되면 이 기관과 계약해 이용해요.',
          '대상이 되는지는 주민센터나 이 기관에 먼저 물어보세요.'];
      case 'welfare':
        return [`<b>${esc(item.service)}</b>${item.apply ? ` · 신청 방법: ${esc(item.apply)}` : ''}`,
          '자격과 준비 서류는 복지로 안내를 확인하고, 모르면 주민센터나 129 보건복지상담센터에 물어보세요.',
          item.link ? `<a href="${esc(item.link)}" target="_blank" rel="noopener">복지로에서 자세히 보기·신청</a>` : ''];
      default:
        return ['이용 방법과 비용은 기관에 확인해 주세요.'];
    }
  }

  function serviceOptions(item) {
    if (item.kind === 'D') {
      const own = (item.areaTxt || '').split('·').filter(Boolean);
      return own.length ? own : DEV_AREAS;
    }
    return item.services && item.services.length ? item.services : [item.service || '이용 상담'];
  }

  function profile() {
    try { return JSON.parse(localStorage.getItem('modu.profile.v1') || 'null'); } catch (e) { return null; }
  }

  // ── 창 ───────────────────────────────
  const modal = document.createElement('div');
  modal.className = 'survey-modal ask-modal';
  modal.hidden = true;
  document.body.appendChild(modal);
  let cur = null;

  function open(item) {
    cur = item;
    const p = profile();
    const opts = serviceOptions(item);
    const who = p ? (p.who === 'family' ? '자녀·가족' : '본인') : '';
    const age = p && p.age ? p.age : '';
    const dtypes = ['지체', '뇌병변', '시각', '청각·언어', '지적·자폐', '기타'];
    const dname = p && p.dtype !== '' && p.dtype != null ? dtypes[+p.dtype] : '';
    const tel = (item.tel || '').replace(/[^0-9]/g, '');
    const mobile = /^01[016789]/.test(tel);
    modal.innerHTML = `<div class="survey-box" role="dialog" aria-modal="true" aria-labelledby="ask-title">
      <div class="survey-top"><h2 id="ask-title">신청·문의하기</h2><button type="button" class="survey-x" data-x aria-label="닫기">✕</button></div>
      <p class="ask-org"><b>${esc(item.name)}</b>${item.sub ? ` <span class="muted">· ${esc(item.sub)}</span>` : ''}</p>

      <div class="ask-route"><p class="fit-tag">이용·신청 방법</p><ul>${route(item).filter(Boolean).map((l) => `<li>${l}</li>`).join('')}</ul></div>

      <form id="ask-form">
        <p class="fit-tag">기관에 보낼 문의 만들기</p>
        <fieldset><legend>원하는 서비스 <span class="muted">(여러 개 가능)</span></legend><div class="choices">${opts.map((o, i) => `<label class="pick"><input type="checkbox" name="svc" value="${esc(o)}"${opts.length === 1 || (/심리운동/.test(o) && i < 8) ? ' checked' : ''}> ${esc(o)}</label>`).join('')}</div></fieldset>
        <fieldset><legend>누가 이용하나요?</legend><div class="choices">
          ${['본인', '자녀·가족'].map((w) => `<label class="pick"><input type="radio" name="who" value="${w}"${who === w ? ' checked' : ''}> ${w}</label>`).join('')}
          <label class="pick age"><input type="number" name="age" min="0" max="120" inputmode="numeric" value="${esc(age)}" aria-label="나이"> 세</label>
        </div>
        ${dname ? `<label class="pick"><input type="checkbox" name="withtype" value="${esc(dname)}"> 장애유형(${esc(dname)})도 적기</label>` : ''}</fieldset>
        <fieldset><legend>희망 요일·시간 <span class="muted">(선택)</span></legend><div class="choices">
          ${DAYS.map((d) => `<label class="pick num"><input type="checkbox" name="day" value="${d}"> ${d}</label>`).join('')}
          ${['오전', '오후', '저녁'].map((t) => `<label class="pick"><input type="radio" name="time" value="${t}"> ${t}</label>`).join('')}
        </div></fieldset>
        <label class="sv-comment"><span>더 적을 말 <span class="muted">(선택)</span></span><textarea name="note" rows="2" maxlength="300" placeholder="예: 방문 수업이 가능한지 궁금해요"></textarea></label>
        <label class="sv-comment"><span>보낼 문장 <span class="muted">(고쳐 써도 돼요)</span></span><textarea name="msg" rows="7"></textarea></label>
        <div class="actions ask-actions">
          ${mobile ? `<a class="btn" id="ask-sms" href="#">💬 문자로 보내기</a>` : ''}
          ${tel ? `<a class="${mobile ? 'btn-ghost' : 'btn'}" href="tel:${tel}">☎ 전화하기 (${esc(item.tel)})</a>` : ''}
          <button type="button" class="btn-ghost" id="ask-copy">문장 복사</button>
        </div>
        <p class="hint">${tel && !mobile ? '이 번호는 일반 전화라 문자를 받지 못해요. 전화하면서 위 문장을 읽어 주시거나, 복사해서 기관 누리집·카카오톡 채널에 남겨 주세요. ' : ''}${!tel ? '전화번호가 등록되어 있지 않아요. 복사해서 주민센터·기관에 문의할 때 써 주세요. ' : ''}문자는 이 휴대폰에서 직접 보내지고, 모두의 특수체육 서버에는 아무것도 저장되지 않아요.</p>
        <p class="hint" id="ask-copied" role="status"></p>
      </form>
    </div>`;
    modal.hidden = false;
    build();
    modal.querySelector('#ask-form').addEventListener('input', (e) => { if (e.target.name !== 'msg') build(); });
    modal.querySelector('#ask-form').addEventListener('change', (e) => { if (e.target.name !== 'msg') build(); });
    const sms = modal.querySelector('#ask-sms');
    if (sms) sms.addEventListener('click', (e) => {
      e.preventDefault();
      const body = modal.querySelector('textarea[name="msg"]').value;
      // iOS·안드로이드 모두 열리는 형식
      location.href = `sms:${tel}?&body=${encodeURIComponent(body)}`;
    });
    modal.querySelector('#ask-copy').addEventListener('click', () => {
      const t = modal.querySelector('textarea[name="msg"]');
      const done = () => { modal.querySelector('#ask-copied').textContent = '복사했어요. 문자·카카오톡 등에 붙여 넣으세요.'; };
      if (navigator.clipboard) navigator.clipboard.writeText(t.value).then(done, () => { t.select(); document.execCommand('copy'); done(); });
      else { t.select(); document.execCommand('copy'); done(); }
    });
    const first = modal.querySelector('input');
    if (first) first.focus();
  }

  function build() {
    const f = modal.querySelector('#ask-form');
    const vals = (n) => [...f.querySelectorAll(`input[name="${n}"]:checked`)].map((x) => x.value);
    const svc = vals('svc'), who = vals('who')[0] || '', days = vals('day'), time = vals('time')[0] || '';
    const age = f.age.value.trim(), withtype = vals('withtype')[0] || '', note = f.note.value.trim();
    const target = [who, age && `만 ${age}세`, withtype && `${withtype} 장애`].filter(Boolean).join(', ');
    const lines = [
      '안녕하세요. 「모두의 특수체육」에서 보고 연락드립니다.',
      `${cur.name}의 ${svc.length ? svc.join(', ') : (cur.service || '서비스')} 이용을 문의드립니다.`,
      target && `- 대상: ${target}`,
      (days.length || time) && `- 희망: ${[days.join('·'), time].filter(Boolean).join(' ')}`,
      note && `- ${note}`,
      '이용 가능 여부와 신청 방법(비용, 바우처·이용권 사용 가능 여부)을 알려 주시면 감사하겠습니다.',
    ].filter(Boolean);
    f.msg.value = lines.join('\n');
  }

  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-x]')) modal.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) modal.hidden = true; });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ask]');
    if (!b) return;
    const item = reg.get(b.dataset.ask);
    if (item) open(item);
  });

  window.modu = window.modu || {};
  window.modu.ask = { button, open };
})();
