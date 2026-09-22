// 모두의 특수체육 — 익명 사용 설문
// 응답은 Supabase 표(modu_feedback)에 '보내기'만 된다. 이 공개 키로는 읽기·수정·삭제가 막혀 있다(RLS).
// 이름·연락처·장애 정보는 묻지 않는다.
(function () {
  const ENDPOINT = 'https://tqkjdtopialrjekpwofn.supabase.co/rest/v1/modu_feedback';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxa2pkdG9waWFscmpla3B3b2ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4NDIyNzMsImV4cCI6MjEwNTQxODI3M30.UH6newdpMJfnCqFpKHFxGG7K1BUFE8X3OqtMLwL97_U';
  const STORE = 'modu.survey.v1'; // 'done' 이면 다시 안 띄움, 'later' 면 자동으로는 안 띄움
  const ROLES = ['장애 당사자', '보호자·가족', '제공인력·지도자', '학생', '기타'];
  const FOUND = ['예', '일부 찾음', '아니오'];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const state = () => { try { return localStorage.getItem(STORE) || ''; } catch (e) { return ''; } };
  const remember = (v) => { try { localStorage.setItem(STORE, v); } catch (e) { /* 무시 */ } };
  const page = () => (location.hash.replace('#', '').split('?')[0] || 'fit').slice(0, 20);

  // 떠 있는 안내 (화면 아래)
  const nudge = document.createElement('div');
  nudge.className = 'survey-nudge';
  nudge.hidden = true;
  nudge.setAttribute('role', 'dialog');
  nudge.setAttribute('aria-label', '설문 참여 안내');
  nudge.innerHTML = `<p><b>📝 30초 설문에 참여해 주세요</b><br>이 서비스가 도움이 됐는지 알려 주시면 더 좋게 고치겠습니다.</p>
    <div class="survey-actions"><button type="button" class="btn sm" data-s="open">설문 참여</button><button type="button" class="btn-ghost sm" data-s="later">나중에</button></div>`;
  document.body.appendChild(nudge);

  // 설문 창
  const modal = document.createElement('div');
  modal.className = 'survey-modal';
  modal.hidden = true;
  modal.innerHTML = `<div class="survey-box" role="dialog" aria-modal="true" aria-labelledby="sv-title">
    <div class="survey-top"><h2 id="sv-title">사용 설문 (30초)</h2><button type="button" class="survey-x" data-s="close" aria-label="닫기">✕</button></div>
    <form id="sv-form">
      <fieldset><legend>1. 어떤 분이세요?</legend><div class="choices">${ROLES.map((r) => `<label class="pick"><input type="radio" name="role" value="${esc(r)}"> ${esc(r)}</label>`).join('')}</div></fieldset>
      <fieldset><legend>2. 원하는 강좌·시설·복지서비스를 찾으셨나요?</legend><div class="choices">${FOUND.map((r) => `<label class="pick"><input type="radio" name="found" value="${esc(r)}"> ${esc(r)}</label>`).join('')}</div></fieldset>
      <fieldset><legend>3. 쓰기 편했나요? <span class="muted">(1 매우 불편 ~ 5 매우 편함)</span></legend><div class="choices">${[1, 2, 3, 4, 5].map((n) => `<label class="pick num"><input type="radio" name="ease" value="${n}"> ${n}</label>`).join('')}</div></fieldset>
      <label class="sv-comment"><span>4. 한마디 <span class="muted">(불편한 점·좋은 점·틀린 정보, 선택)</span></span><textarea name="comment" rows="3" maxlength="1000" placeholder="예: 우리 동네 ○○센터가 빠져 있어요"></textarea></label>
      <p class="hint">이름·연락처는 받지 않습니다. 답은 익명으로 저장되어 서비스 개선과 공모전 보고서에만 쓰입니다.</p>
      <p class="err" id="sv-err" role="alert"></p>
      <button type="submit" class="btn" id="sv-send">보내기</button>
    </form>
    <div id="sv-thanks" hidden><p class="sv-done">감사합니다! 🙏<br>보내 주신 의견은 서비스를 고치는 데 쓰겠습니다.</p><button type="button" class="btn" data-s="close">닫기</button></div>
  </div>`;
  document.body.appendChild(modal);

  function open() {
    nudge.hidden = true;
    modal.hidden = false;
    const first = modal.querySelector('input');
    if (first) first.focus();
  }
  function close() { modal.hidden = true; }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-s]');
    if (!t) return;
    const s = t.dataset.s;
    if (s === 'open') open();
    if (s === 'later') { remember(state() === 'done' ? 'done' : 'later'); nudge.hidden = true; }
    if (s === 'close') close();
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

  modal.querySelector('#sv-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target, err = modal.querySelector('#sv-err'), btn = modal.querySelector('#sv-send');
    const val = (n) => (f.querySelector(`input[name="${n}"]:checked`) || {}).value;
    const body = { role: val('role') || null, found: val('found') || null, ease: val('ease') ? +val('ease') : null, comment: f.comment.value.trim().slice(0, 1000) || null, page: page() };
    if (!body.found || !body.ease) { err.textContent = '2번과 3번은 골라 주세요.'; return; }
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = '보내는 중…';
    fetch(ENDPOINT, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body) })
      .then((r) => {
        if (!r.ok) throw new Error(r.status);
        remember('done');
        f.hidden = true;
        modal.querySelector('#sv-thanks').hidden = false;
      })
      .catch(() => { err.textContent = '보내지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.'; btn.disabled = false; btn.textContent = '보내기'; });
  });

  // 머리말에 항상 보이는 '의견 보내기' 버튼
  const tabs = document.querySelector('.tabs');
  if (tabs) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab feedback-tab';
    b.dataset.s = 'open';
    b.textContent = '의견 보내기';
    tabs.appendChild(b);
  }

  // 맞춤 결과를 보고 20초 뒤, 또는 다른 화면을 1분 넘게 쓰면 한 번만 안내
  let timer = null, due = Infinity;
  function arm(ms) {
    if (state() || Date.now() + ms >= due) return; // 이미 더 이른 안내가 잡혀 있으면 그대로
    clearTimeout(timer);
    due = Date.now() + ms;
    timer = setTimeout(() => { if (!state() && modal.hidden) nudge.hidden = false; }, ms);
  }
  const result = document.getElementById('fit-result');
  if (result) new MutationObserver(() => { if (!result.hidden) arm(20000); }).observe(result, { attributes: true, attributeFilter: ['hidden'] });
  arm(60000);
  window.modu = window.modu || {};
  window.modu.openSurvey = open;
})();
