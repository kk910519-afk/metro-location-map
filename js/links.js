// 단지의 외부 서비스 바로가기. 서버(Node)와 화면(브라우저)이 함께 쓰는 순수 모듈이다.
// 외부 서비스 바로가기(검색 링크). 호가·매물은 앱으로 가져오지 않고 해당 서비스에서 확인한다.
export function externalLinks({ aptNm, umdNm = '', sigungu = '' }) {
  const q = `${umdNm} ${aptNm}`.trim(); const e = encodeURIComponent;
  return [
    { key: 'hogang', label: '호갱노노', url: `https://hogangnono.com/search?q=${e(q)}`, note: '실거래·호가·입주민 이야기' },
    { key: 'naverLand', label: '네이버 부동산', url: `https://m.land.naver.com/search/result/${e(q)}`, note: '매물 호가' },
    { key: 'naverMap', label: '네이버 지도', url: `https://map.naver.com/p/search/${e(`${sigungu} ${q}`.trim())}`, note: '위치·거리뷰' },
    { key: 'kakaoMap', label: '카카오맵', url: `https://map.kakao.com/?q=${e(`${sigungu} ${q}`.trim())}`, note: '위치·로드뷰' },
  ];
}

// 링크 주소는 http·https만 쓴다(조사 자료에 다른 종류의 주소가 섞여 와도 누르면 실행되는 링크가 되지 않게). 아니면 '#'.
export const safeHref = (u) => (typeof u === 'string' && /^https?:\/\/\S+$/i.test(u) ? u : '#');
