"""공공데이터를 전부 새로 받는다 (매주 자동 실행용).

인증키: 환경변수 DATA_GO_KR_KEY (GitHub Actions 에서는 저장소 Secret)
저장 위치: 환경변수 RAW_DIR (기본값 ./_raw). 이 폴더는 사이트에 올라가지 않는다.
복지로 상세 정보는 pipeline/cache/welfare_detail.json 에 모아 두고, 새로 생기거나 바뀐 서비스만 다시 받는다.
"""
import json, os, re, sys, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('RAW_DIR') or os.path.join(HERE, '..', '_raw')
CACHE = os.path.join(HERE, 'cache', 'welfare_detail.json')
KEY = os.environ.get('DATA_GO_KR_KEY', '').strip()
if not KEY:
    sys.exit('DATA_GO_KR_KEY 가 없습니다.')
os.makedirs(RAW, exist_ok=True)
os.makedirs(os.path.dirname(CACHE), exist_ok=True)


def get(url, params, fmt='json', tries=6):
    q = urllib.parse.urlencode(dict(serviceKey=KEY, **params))
    for t in range(tries):
        try:
            raw = urllib.request.urlopen(urllib.request.Request(url + '?' + q, headers={'User-Agent': 'modu-sports'}), timeout=120).read()
            return json.loads(raw) if fmt == 'json' else ET.fromstring(raw)
        except Exception as e:  # 429(요청 과다)·일시 오류는 기다렸다 다시
            wait = 5 * (t + 1) if '429' in str(e) else 2 ** t
            print(f'  다시 시도 {t + 1}: {str(e)[:80]} ({wait}초 뒤)', flush=True)
            time.sleep(wait)
    raise RuntimeError(f'받기 실패: {url} {params}')


def kspo_all(url):
    """체육공단 API (JSON, 1000건씩)"""
    rows, p = [], 1
    while True:
        b = get(url, dict(pageNo=p, numOfRows=1000, resultType='json'))['response']['body']
        it = b['items']['item'] if b.get('items') else []
        it = it if isinstance(it, list) else [it]
        rows += it
        if not it or len(rows) >= int(b['totalCount']):
            return int(b['totalCount']), rows
        p += 1


def xml_items(root, tag):
    return [{c.tag: (c.text or '').strip() for c in it if len(c) == 0} for it in root.iter(tag)]


def xml_all(url, tag, n, **extra):
    rows, p = [], 1
    while True:
        root = get(url, dict(pageNo=p, numOfRows=n, **extra), fmt='xml')
        tot = int(root.findtext('.//totalCount') or 0)
        it = xml_items(root, tag)
        rows += it
        if not it or len(rows) >= tot:
            return tot, rows
        p += 1


def file_data(pk, out_name):
    """공공데이터포털 '파일 데이터'(인증키 불필요)를 받아 RAW 에 저장. 실패하면 False"""
    try:
        page = urllib.request.urlopen(urllib.request.Request(f'https://www.data.go.kr/data/{pk}/fileData.do', headers={'User-Agent': 'Mozilla/5.0'}), timeout=60).read().decode('utf-8', 'ignore')
        uddi = re.search(r'uddi:[0-9a-f-]+', page).group(0)
        info = urllib.request.urlopen(urllib.request.Request(
            f'https://www.data.go.kr/tcs/dss/selectFileDataDownload.do?publicDataPk={pk}&fileDetailSn=1&publicDataDetailPk={uddi}',
            headers={'User-Agent': 'Mozilla/5.0'}), timeout=60).read().decode('utf-8', 'ignore')
        fid = re.search(r'"atchFileId":"(FILE_\d+)"', info).group(1)
        data = urllib.request.urlopen(urllib.request.Request(
            f'https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId={fid}&fileDetailSn=1', headers={'User-Agent': 'Mozilla/5.0'}), timeout=120).read()
        if len(data) < 200:
            return False
        open(os.path.join(RAW, out_name), 'wb').write(data)
        return True
    except Exception as e:
        print(f'  파일 데이터 {pk} 받기 실패: {str(e)[:80]}', flush=True)
        return False


def save(name, rows):
    json.dump(rows, open(os.path.join(RAW, name), 'w', encoding='utf-8'), ensure_ascii=False)


def main():
    B = 'https://apis.data.go.kr/B551014/'
    jobs = [
        ('장애인스포츠강좌이용권_등록강좌.json', B + 'SRVC_DVOUCHER_FACI_COURSE/TODZ_DVOUCHER_FACI_COURSE'),
        ('장애인스포츠강좌이용권_등록시설.json', B + 'SRVC_OD_API_FACIL_MNG_DVOUCHER/TODZ_API_MNG_DVOUCHER_I'),
        ('스포츠강좌이용권_등록시설.json', B + 'SRVC_OD_API_FACIL_MNG/todz_api_facil_mng_i'),
    ]
    counts = {}
    for name, url in jobs:
        tot, rows = kspo_all(url)
        if len(rows) < tot:
            raise RuntimeError(f'{name}: {tot}건 중 {len(rows)}건만 받음')
        save(name, rows)
        counts[name] = len(rows)
        print(name, len(rows), flush=True)

    # 인천광역시 발달재활·언어발달 제공기관 현황 (센터별 '제공영역' — 심리운동 등). 실패하면 build 가 저장본(static)을 씀
    print('인천 발달재활 제공영역', '받음' if file_data('15103869', 'incheon_dev.csv') else '실패 → 저장본 사용', flush=True)

    tot, rows = xml_all('https://apis.data.go.kr/B554287/provider/providerList', 'item', 1000)
    save('ssis_providers.json', rows)
    counts['ssis_providers.json'] = len(rows)
    print('사회서비스 제공기관', len(rows), '/', tot, flush=True)

    CU = 'https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/'
    LU = 'https://apis.data.go.kr/B554287/LocalGovernmentWelfareInformations/'
    _, central = xml_all(CU + 'NationalWelfarelistV001', 'servList', 500, callTp='L', srchKeyCode='003')
    _, local = xml_all(LU + 'LcgvWelfarelist', 'servList', 500)
    print('복지로 중앙', len(central), '/ 지자체', len(local), flush=True)

    # 장애 관련만 상세 정보를 붙임 (캐시에 있고 수정일이 같으면 다시 안 받음)
    cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}
    dis = lambda r, k: '장애' in r.get(k, '') or '장애' in r.get('servNm', '')
    out = {'central': [r for r in central if dis(r, 'trgterIndvdlArray')],
           'local': [r for r in local if dis(r, 'trgterIndvdlNmArray')]}
    fetched = failed = 0
    for level, url, extra in (('central', CU + 'NationalWelfaredetailedV001', {'callTp': 'D'}), ('local', LU + 'LcgvWelfaredetailed', {})):
        for r in out[level]:
            sid, stamp = r['servId'], r.get('lastModYmd') or r.get('svcfrstRegTs') or ''
            c = cache.get(sid)
            # 중앙부처 목록엔 수정일이 없어서, 받은 지 30일 지나면 다시 받음
            fresh = c and (time.time() - c.get('_fetched', 0)) < 30 * 86400
            if c and c.get('_stamp') == stamp and c.get('detail') and (level == 'local' or fresh):
                r['detail'] = c['detail']
                continue
            try:
                root = get(url, dict(servId=sid, **extra), fmt='xml', tries=4)
                d = {c.tag: (c.text or '').strip() for c in root if len(c) == 0}
                cache[sid] = {'_stamp': stamp, '_fetched': int(time.time()), 'detail': d}
                r['detail'] = d
                fetched += 1
                time.sleep(0.3)  # 요청 과다(429) 막기
            except RuntimeError:
                r['detail'] = (c or {}).get('detail', {})
                failed += 1
    json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    save('welfare_disability.json', out)
    counts['welfare_central'] = len(out['central'])
    counts['welfare_local'] = len(out['local'])
    print(f'복지로 장애 관련 중앙 {len(out["central"])} / 지자체 {len(out["local"])} · 상세 새로 받음 {fetched}, 실패 {failed}', flush=True)
    json.dump(counts, open(os.path.join(RAW, '_counts.json'), 'w', encoding='utf-8'), ensure_ascii=False)


if __name__ == '__main__':
    main()
