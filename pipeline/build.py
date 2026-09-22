"""받아 둔 원본(RAW_DIR)을 사이트 데이터(data/*.json)로 만든다.

- facilities.json : 강좌이용권 등록시설(K) + 장애 관련 지역사회서비스 제공기관(V)
- courses.json    : 장애인스포츠강좌이용권 강좌 (사업자번호로 시설 위치 연결)
- welfare.json    : 복지로 장애인 대상 복지서비스 (중앙부처·지자체)
- gap.json        : 시도·시군구별 공급 현황
- 처음 발견한 날짜를 pipeline/cache/seen.json 에 모아, 새로 생긴 항목을 사이트가 알려 줄 수 있게 한다.
- 이전보다 건수가 크게 줄면(데이터 이상) 아무것도 바꾸지 않고 멈춘다.
"""
import collections, csv, datetime, io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from classify import auto_social, auto_welfare, classify, DTYPES  # noqa: E402

RAW = os.environ.get('RAW_DIR') or os.path.join(HERE, '..', '_raw')
OUT = os.path.join(HERE, '..', 'data')
STATIC = os.path.join(HERE, 'static')
SEEN = os.path.join(HERE, 'cache', 'seen.json')
REVIEW_OUT = os.path.join(HERE, 'review')
KST = datetime.timezone(datetime.timedelta(hours=9))
TODAY = datetime.datetime.now(KST).strftime('%Y-%m-%d')
BASELINE = '2026-09-22'  # 서비스를 처음 연 날. 이날 이미 있던 항목은 '새로 생긴' 것으로 치지 않음

SIDO = {
    '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구', '인천광역시': '인천', '광주광역시': '전남광주',
    '대전광역시': '대전', '울산광역시': '울산', '세종특별자치시': '세종', '경기도': '경기', '강원특별자치도': '강원',
    '강원도': '강원', '충청북도': '충북', '충청남도': '충남', '전북특별자치도': '전북', '전라북도': '전북',
    '전라남도': '전남광주', '전남광주통합특별시': '전남광주', '경상북도': '경북', '경상남도': '경남', '제주특별자치도': '제주',
}
SIDO_ORDER = ['서울', '부산', '대구', '인천', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남광주', '경북', '경남', '제주']
CITY_FIX = {'광주': '전남광주', '전남': '전남광주'}


def load(name):
    return json.load(open(os.path.join(RAW, name), encoding='utf-8'))


def tel(t):
    t = re.sub(r'\D', '', t or '')
    if not t:
        return ''
    if re.match(r'^1[5-8]\d{6}$', t):  # 1588·1660 같은 대표번호
        return t[:4] + '-' + t[4:]
    if t.startswith('02'):
        return re.sub(r'^(02)(\d{3,4})(\d{4})$', r'\1-\2-\3', t)
    return re.sub(r'^(\d{3})(\d{3,4})(\d{4})$', r'\1-\2-\3', t)


def clean(s):
    return re.sub(r'\s+', ' ', (s or '').strip())


def short(s, n):
    s = clean(s)
    return s if len(s) <= n else s[:n] + '…'


def split_names(s):
    return [x.strip().replace(' · ', '·') for x in (s or '').split(',') if x.strip()]


# ── 처음 발견한 날 ─────────────────────────────────
seen = json.load(open(SEEN, encoding='utf-8')) if os.path.exists(SEEN) else {}


def first_seen(kind, key):
    d = seen.setdefault(kind, {})
    if key not in d:
        d[key] = TODAY
    return d[key]


# ── 시설: K 강좌이용권 등록시설 / V 장애 관련 지역사회서비스 ──
rows, keys = [], set()
local_code = {}
for r in load('장애인스포츠강좌이용권_등록시설.json'):
    city, local, cd = clean(r.get('city_nm')), clean(r.get('local_nm')), r.get('local_cd', '')
    local_code[(city, local)] = cd
    name, addr = clean(r.get('facil_nm')), clean(r.get('road_addr'))
    key = 'K|' + name + '|' + addr + '|' + clean(r.get('main_event_nm')) + '|' + clean(r.get('faci_daddr'))
    if key in keys:
        continue
    keys.add(key)
    rows.append(['K', name, clean(r.get('main_event_nm')), city, cd, local, addr, clean(r.get('faci_daddr')),
                 tel(r.get('res_telno')), '', '', 1, first_seen('facility', key)])
n_k = len(rows)

social_names = collections.Counter()
for r in load('ssis_providers.json'):
    if r.get('serviceTypeName') != '지역사회서비스투자':
        continue
    svc = clean(r.get('serviceName'))
    cls = classify('사회서비스', svc, auto_social(svc))
    social_names[svc] += 1
    if not cls['include']:
        continue
    sido_full = clean(r.get('sidoName'))
    city = SIDO.get(sido_full, sido_full)
    rest = clean(r.get('signguName')).replace(sido_full, '').strip()
    local = rest.split(' ')[0] if rest else ''
    if city == '세종':  # 세종은 시군구가 없어 하나뿐인 코드로
        local = next((l for (ci, l) in local_code if ci == '세종'), local)
    cd = local_code.get((city, local)) or ('V-' + city + '-' + local)
    addr = clean(r.get('loadAddress')) or clean(r.get('address'))
    # 같은 기관이 여러 시군구에서 같은 서비스를 하면 시군구마다 따로 둠
    key = 'V|' + clean(r.get('providerId')) + '|' + svc + '|' + clean(r.get('signguName')) + '|' + addr
    if key in keys:
        continue
    keys.add(key)
    # 기관장명·이메일은 개인정보라 넣지 않음
    rows.append(['V', clean(r.get('providerName')), svc, city, cd, local, addr,
                 clean(r.get('loadAddressDetail')) or clean(r.get('addressDetail')), tel(r.get('telNumber')),
                 cls['targets'], cls['age'], cls['ex'], first_seen('facility', key)])

# ── 강좌 ─────────────────────────────────────────
DTYPE = {'지체': '지체', '뇌병변': '뇌병변', '시각': '시각', '청각/언어': '청각·언어', '언어': '청각·언어',
         '지적/자폐': '지적·자폐', '지적': '지적·자폐', '기타': '기타'}
DORDER = DTYPES + ['기타']

# 사업자번호 → 위치 (일반 스포츠강좌이용권 등록시설). 대표자명은 개인정보라 쓰지 않음.
# 한 사업자가 여러 주소면 어느 지점인지 알 수 없어 연결하지 않음. 옛 광주·전남 코드는 새 코드로 맞춤
old_code, where, ambiguous = {}, {}, set()
for r in load('스포츠강좌이용권_등록시설.json'):
    city = CITY_FIX.get(clean(r.get('city_nm')), clean(r.get('city_nm')))
    lname, cd = clean(r.get('local_nm')), r.get('local_cd', '')
    new_cd = local_code.get((city, lname), cd)
    if new_cd != cd:
        old_code[cd] = new_cd
    b = re.sub(r'\D', '', r.get('brno') or '')
    if not b:
        continue
    rec = [clean(r.get('facil_nm')), city, new_cd, lname, clean(r.get('road_addr')), clean(r.get('faci_daddr')), tel(r.get('res_telno'))]
    if b in where and where[b][4] != rec[4]:
        ambiguous.add(b)
    where.setdefault(b, rec)
for b in ambiguous:
    del where[b]

courses, ckeys, places, place_idx = [], set(), [], {}
for r in load('장애인스포츠강좌이용권_등록강좌.json'):
    key = (r.get('course_num') or '') + '|' + (r.get('busi_reg_no') or '')
    if key in ckeys:
        continue
    ckeys.add(key)
    types = []
    for t in (r.get('dspsn_ty_nm') or '').split(','):
        d = DTYPE.get(t.strip())
        if d and d not in types:
            types.append(d)
    b = re.sub(r'\D', '', r.get('busi_reg_no') or '')
    pi = -1
    if b in where:
        if b not in place_idx:
            place_idx[b] = len(places)
            places.append(where[b])
        pi = place_idx[b]
    courses.append([clean(r.get('course_nm')), clean(r.get('cntnt_fst')), sum(1 << DORDER.index(d) for d in types),
                    r.get('weekday') or '', r.get('start_time') or '', r.get('end_time') or '', int(r.get('settl_amt') or 0),
                    short(r.get('course_seta_desc'), 140), pi, first_seen('course', key)])

# ── 복지로 장애인 복지서비스 ───────────────────────
W = load('welfare_disability.json')
wrows = []
for level in ('central', 'local'):
    for r in W[level]:
        d = r.get('detail') or {}
        name = clean(r.get('servNm'))
        target = clean(d.get('tgtrDtlCn') or d.get('sprtTrgtCn'))
        life = split_names(r.get('lifeArray') or r.get('lifeNmArray') or d.get('lifeArray') or d.get('lifeNmArray'))
        summary = clean(r.get('servDgst') or d.get('wlfareInfoOutlCn') or d.get('servDgst'))
        cls = classify('복지로', r['servId'], auto_welfare(name, target, life, summary))
        if not cls['include']:
            continue
        city = sgg = ''
        if level == 'local':
            full = clean(r.get('ctpvNm'))
            city = SIDO.get(full, full)
            sgg = clean(r.get('sggNm'))
            if sgg == '-':
                sgg = ''
            # 시군구 칸이 비었어도 담당부서가 특정 시군구면 그 시군구 사업 (서비스명이 시도 이름으로 시작하면 시도 사업)
            m = re.match(r'\S+\s+(\S+(?:시|군|구))\s', clean(r.get('bizChrDeptNm')) + ' ')
            if not sgg and m and not name.startswith(full[:2]):
                sgg = m.group(1)
        who = split_names(r.get('trgterIndvdlArray') or r.get('trgterIndvdlNmArray') or d.get('trgterIndvdlArray') or d.get('trgterIndvdlNmArray'))
        wrows.append([
            'C' if level == 'central' else 'L', name,
            short(r.get('servDgst') or d.get('wlfareInfoOutlCn') or d.get('servDgst'), 160),
            short(target, 200), short(d.get('alwServCn'), 200),
            clean(r.get('srvPvsnNm') or d.get('srvPvsnNm')), clean(r.get('sprtCycNm') or d.get('sprtCycNm')),
            clean(r.get('rprsCtadr') or d.get('rprsCtadr') or r.get('bizChrDeptNm')), clean(r.get('servDtlLink')),
            life, who, city, sgg, clean(r.get('aplyMtdNm')) or ('온라인 가능' if r.get('onapPsbltYn') == 'Y' else ''),
            r['servId'], cls['targets'], cls['age'], cls['degree'], 1 if (cls.get('low') or '저소득' in who) else 0,
            first_seen('welfare', r['servId']),
        ])

# ── 지역 공백 ───────────────────────────────────
DIS_YEAR = '2024'
DIS_GROUP = {'지체': ['지체장애'], '뇌병변': ['뇌병변장애'], '시각': ['시각장애'], '청각·언어': ['청각장애', '언어장애'], '지적·자폐': ['지적장애', '자폐성장애']}
dis = {s: collections.Counter() for s in SIDO_ORDER}
drows = list(csv.reader(io.StringIO(open(os.path.join(STATIC, 'disabled_sido.csv'), 'rb').read().decode('cp949'))))
for r in drows[1:]:
    if r[0] != DIS_YEAR:
        continue
    s = r[1].split(' ')[0]
    s = '전남광주' if s in ('광주', '전남') else s
    for i, h in enumerate(drows[0][2:], 2):
        typ, v = h.rsplit('_', 1)[0], int(r[i] or 0)
        dis[s]['전체'] += v
        for g, members in DIS_GROUP.items():
            if typ in members:
                dis[s][g] += v

CODE_SIDO = {'11': '서울', '26': '부산', '27': '대구', '28': '인천', '30': '대전', '31': '울산', '36': '세종', '41': '경기',
             '51': '강원', '42': '강원', '43': '충북', '44': '충남', '52': '전북', '45': '전북', '12': '전남광주', '29': '전남광주',
             '46': '전남광주', '47': '경북', '48': '경남', '50': '제주'}
use_sido, use_local = collections.Counter(), collections.Counter()
for r in csv.DictReader(open(os.path.join(STATIC, 'usage_synthetic.csv'), encoding='utf-8-sig')):
    use_sido[CODE_SIDO.get(r['시도코드'], '?')] += 1
    use_local[old_code.get(r['시군구코드'], r['시군구코드'])] += 1

fac_sido, vou_sido, crs_sido = collections.Counter(), collections.Counter(), {s: collections.Counter() for s in SIDO_ORDER}
local = {}
for r in rows:
    if r[0] == 'V' and not r[11]:  # '운동·재활 바우처'는 운동·재활 서비스만 셈
        continue
    L = local.setdefault(r[4], {'sido': r[3], 'name': r[5], 'K': 0, 'V': 0, 'C': 0})
    L[r[0]] += 1
    (fac_sido if r[0] == 'K' else vou_sido)[r[3]] += 1
for c in courses:
    if c[8] < 0:
        continue
    p = places[c[8]]
    if p[1] not in crs_sido:
        continue
    crs_sido[p[1]]['전체'] += 1
    for i, d in enumerate(DTYPES):
        if c[2] & (1 << i):
            crs_sido[p[1]][d] += 1
    L = local.setdefault(p[2], {'sido': p[1], 'name': p[3], 'K': 0, 'V': 0, 'C': 0})
    L['C'] += 1

gap = {'updated': TODAY, 'disYear': DIS_YEAR, 'groups': ['전체'] + list(DIS_GROUP),
       'sido': [{'name': s, 'dis': dict(dis[s]), 'fac': fac_sido[s], 'vou': vou_sido[s], 'crs': dict(crs_sido[s]), 'use': use_sido[s]}
                for s in SIDO_ORDER],
       'local': sorted([[v['sido'], k, v['name'], v['K'], v['V'], v['C'], use_local.get(k, 0)] for k, v in local.items()],
                       key=lambda x: (x[0], x[2]))}

# ── 이상 점검: 이전보다 30% 넘게 줄면 멈춤 ─────────────
def old_count(name, pick):
    p = os.path.join(OUT, name)
    try:
        return pick(json.load(open(p, encoding='utf-8')))
    except Exception:
        return 0


checks = [
    ('강좌이용권 시설', n_k, old_count('facilities.json', lambda d: sum(1 for r in d['rows'] if r[0] == 'K'))),
    ('지역사회서비스 기관', len(rows) - n_k, old_count('facilities.json', lambda d: sum(1 for r in d['rows'] if r[0] == 'V'))),
    ('강좌', len(courses), old_count('courses.json', lambda d: len(d['rows']))),
    ('복지서비스', len(wrows), old_count('welfare.json', lambda d: len(d['rows']))),
]
bad = [f'{n}: {old} → {new}' for n, new, old in checks if old and new < old * 0.7]
for n, new, old in checks:
    print(f'{n}: {old} → {new}')
if bad:
    sys.exit('데이터가 크게 줄어 사이트를 바꾸지 않습니다: ' + ', '.join(bad))

# ── 저장 ───────────────────────────────────────
def dump(name, obj):
    json.dump(obj, open(os.path.join(OUT, name), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


meta = {'updated': TODAY, 'baseline': BASELINE}
dump('facilities.json', {**meta, 'fields': ['구분', '기관명', '종목/서비스', '시도', '시군구코드', '시군구', '주소', '상세주소', '전화',
                                            '대상장애유형(*=전체)', '나이조건', '운동·재활(1/0)', '처음 발견일'], 'rows': rows})
dump('courses.json', {**meta, 'dtypes': DORDER,
                      'fields': ['강좌명', '종목', '장애유형비트', '요일(월~일)', '시작', '종료', '수강료', '설명', '장소번호', '처음 발견일'],
                      'placeFields': ['시설명', '시도', '시군구코드', '시군구', '주소', '상세주소', '전화'], 'places': places, 'rows': courses})
dump('welfare.json', {**meta, 'fields': ['구분(C중앙/L지자체)', '서비스명', '요약', '지원대상', '지원내용', '제공유형', '지원주기', '문의',
                                         '복지로링크', '생애주기', '가구상황', '시도', '시군구', '신청방법', '서비스ID', '대상장애유형',
                                         '나이조건', '장애정도조건', '소득조건', '처음 발견일'], 'rows': wrows})
dump('gap.json', gap)
json.dump(seen, open(SEEN, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)

# 검수표에 아직 없는 사회서비스 이름 (석 달에 한 번 훑어보기용)
from classify import REVIEWED  # noqa: E402
new_social = sorted(n for n in social_names if ('사회서비스', n) not in REVIEWED and auto_social(n)['include'])
with open(os.path.join(REVIEW_OUT, '_자동분류_목록.csv'), 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f)
    w.writerow(['구분', '서비스명', '자동_대상장애유형', '자동_나이', '자동_운동재활', '제공기관 수'])
    for n in new_social:
        a = auto_social(n)
        w.writerow(['사회서비스', n, a['targets'], a['age'], a['ex'], social_names[n]])

vr = rows[n_k:]
print(f'완료 {TODAY}: 시설 K {n_k} / V {len(vr)} (운동·재활 {sum(r[11] for r in vr)}) · 강좌 {len(courses)} (위치 연결 {sum(1 for c in courses if c[8] >= 0)}) · 복지서비스 {len(wrows)}')
print('새로 발견(오늘):', {k: sum(1 for v in d.values() if v == TODAY) for k, d in seen.items()})
