"""장애 관련 서비스 분류: 자동 규칙 + 전문가 검수표.

검수표(pipeline/review/classification.csv)에 '확정_' 칸이 채워진 서비스는 그 값을 그대로 쓰고,
검수표에 없거나 비어 있는 서비스는 아래 자동 규칙으로 분류한다.

분류 결과 (dict)
  include  : 1 넣음 / 0 뺌
  targets  : '*'(모든 장애유형) 또는 '뇌병변|지적·자폐' 처럼 대상 장애유형
  age      : ''(제한 없음) / 'child'(18세 이하) / 'adult'(19세 이상)
  ex       : 1 운동·재활 서비스 / 0 그 밖 (사회서비스만)
  degree   : ''(무관) / 'severe'(심한 장애만) / 'mild'(심하지 않은 장애만) (복지로만)
"""
import csv, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
REVIEW = os.path.join(HERE, 'review', 'classification.csv')
DTYPES = ['지체', '뇌병변', '시각', '청각·언어', '지적·자폐']

TARGET_WORDS = [
    ('뇌병변', re.compile(r'뇌병변|뇌혈관|뇌졸[중증]|뇌질환|뇌손상|편마비')),
    ('지적·자폐', re.compile(r'발달장애|자폐|지적장애|발달 및 뇌병변')),
    ('시각', re.compile(r'시각장애|점자|안내견|저시력')),
    ('청각·언어', re.compile(r'청각|언어장애|농아|수어|난청|인공달팽이|인공와우')),
    ('지체', re.compile(r'지체장애|척수|절단|휠체어')),
]
GENERIC_DISABILITY = re.compile(r'(?<!비)장애(?:인|아동|아|가족|가정|학생)|재활승마')
NOT_DISABILITY = re.compile(r'알코올 사용 장애|예방')  # 예: '뇌졸중 및 치매 예방 프로그램'은 노인 예방사업
EXERCISE = re.compile(r'운동|재활|승마|수중|신체|보행|자세|건강증진|플레이핏|PlayFit|체육|스포츠', re.I)
CHILD = re.compile(r'아동|청소년|영유아|장애아(?!버지)|학생')
ADULT = re.compile(r'성인')
SEVERE = re.compile(r'중증|장애의 정도가 심한|심한 장애')
MILD = re.compile(r'중증장애인이 아닌|중증장애인은 제외|장애의 정도가 심하지 않은|경증')
LOW = re.compile(r'저소득|기초생활|수급자|차상위|소득인정액|중위소득')


def targets_of(text):
    t = [name for name, rx in TARGET_WORDS if rx.search(text)]
    return '|'.join(t) if t else '*'


def auto_social(name):
    """지역사회서비스투자사업 서비스명 → 분류"""
    if NOT_DISABILITY.search(name):
        return dict(include=0, targets='*', age='', ex=0, degree='', why='장애 대상 아님(예방·알코올)')
    specific = [n for n, rx in TARGET_WORDS if rx.search(name)]
    if not specific and not GENERIC_DISABILITY.search(name):
        return dict(include=0, targets='*', age='', ex=0, degree='', why='장애 관련 단어 없음')
    return dict(include=1, targets='|'.join(specific) or '*',
                age='adult' if ADULT.search(name) else 'child' if CHILD.search(name) else '',
                ex=1 if EXERCISE.search(name) else 0, degree='', why='서비스명 자동 분류')


# 장애 전용 바우처 사업(장애아동가족지원·발달장애인지원·장애인활동지원)의 서비스별 분류.
# ex: 1 운동·재활 / 0 그 밖 사회서비스 / 2 발달재활(장애아동, 심리운동 등 제공 영역은 데이터에 없음)
DISABILITY_PROGRAMS = {
    '발달재활': dict(targets='*', age='child', ex=2, why='장애아동 발달재활서비스(만 18세 미만)'),
    '언어발달': dict(targets='*', age='child', ex=0, why='장애부모 가정 아동 언어발달지원'),
    '부모상담지원': dict(targets='*', age='child', ex=0, why='장애아동 부모 상담'),
    '발달장애인 주간활동서비스': dict(targets='지적·자폐', age='adult', ex=0, why='성인 발달장애인'),
    '청소년 발달장애인 방과후활동서비스': dict(targets='지적·자폐', age='child', ex=0, why='청소년 발달장애인'),
    '최중증발달장애인 통합돌봄서비스': dict(targets='지적·자폐', age='', ex=0, why='최중증 발달장애인'),
    '장애인활동지원': dict(targets='*', age='', ex=0, why='장애인활동지원'),
}


def auto_program(name):
    p = DISABILITY_PROGRAMS.get(name)
    if not p:
        return dict(include=0, targets='*', age='', ex=0, degree='', why='대상 사업 아님(예: 시도 추가지원은 같은 기관 반복)')
    return dict(include=1, degree='', **p)


def auto_welfare(name, target_text, life, summary=''):
    """복지로 서비스(이미 '장애인' 가구유형으로 걸러진 것) → 분류. 이름·요약을 먼저, 대상 원문은 보조로 본다."""
    targets = targets_of(name)
    if targets == '*':  # 이름에 없으면 대상 원문에서 한 가지 유형만 뚜렷할 때만 좁힘
        t = [n for n, rx in TARGET_WORDS if rx.search(target_text or '')]
        targets = t[0] if len(t) == 1 else '*'
    both = name + ' ' + (target_text or '')
    # '중증장애인이 아닌' 같은 말이 있으면 심하지 않은 장애만, 이름·요약에 '중증'이 있으면 심한 장애만
    degree = 'mild' if MILD.search(both) else 'severe' if SEVERE.search(name + ' ' + (summary or '')) else ''
    age = 'child' if re.search(r'장애아|장애아동', name) else ''
    return dict(include=1, targets=targets, age=age, ex=1 if EXERCISE.search(name) else 0, degree=degree,
                low=1 if LOW.search(both) else 0, why='이름·지원대상 자동 분류')


def load_review():
    """검수표 → {(구분, 키): 확정값 dict}. 확정 칸이 빈 줄은 무시"""
    out = {}
    if not os.path.exists(REVIEW):
        return out
    for r in csv.DictReader(open(REVIEW, encoding='utf-8-sig')):
        fixed = {}
        inc = (r.get('확정_포함') or '').strip()
        if inc in ('O', 'o', '1', '포함', 'Y'):
            fixed['include'] = 1
        elif inc in ('X', 'x', '0', '제외', 'N'):
            fixed['include'] = 0
        tg = (r.get('확정_대상장애유형') or '').strip()
        if tg:
            # 여러 유형은 '|' 또는 ',' 로 구분 (유형 이름 안의 '·' 는 나누지 않음)
            fixed['targets'] = '*' if tg in ('*', '전체', '모든 장애') else '|'.join(x.strip() for x in re.split(r'[|,]', tg) if x.strip())
        ag = (r.get('확정_나이') or '').strip()
        if ag:
            fixed['age'] = {'아동·청소년': 'child', '18세 이하': 'child', '성인': 'adult', '19세 이상': 'adult', '제한 없음': ''}.get(ag, '')
        ex = (r.get('확정_운동재활') or '').strip()
        if ex:
            fixed['ex'] = 1 if ex in ('O', 'o', '1', '예', 'Y') else 0
        dg = (r.get('확정_장애정도') or '').strip()
        if dg:
            fixed['degree'] = {'심한 장애만': 'severe', '심하지 않은 장애만': 'mild', '무관': ''}.get(dg, '')
        if fixed:
            fixed['why'] = '전문가 검수'
            out[(r['구분'], r['키'])] = fixed
    return out


REVIEWED = load_review()


def classify(kind, key, auto):
    """kind: '사회서비스' | '복지로'. 검수표 값이 있으면 덮어씀"""
    fixed = REVIEWED.get((kind, key))
    if fixed:
        auto = {**auto, **fixed}
    return auto
