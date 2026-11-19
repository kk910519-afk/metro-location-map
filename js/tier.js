// 급지(1~7급) 계산. 서버(Node)와 화면(브라우저)이 함께 쓰는 순수 모듈이라 다른 파일에 기대지 않는다.
// 서버는 server/districts.js가 이 파일을 다시 내보내고, 공개 사이트는 브라우저에서 이 파일로 급지·순위를 다시 매긴다.

// 100점 = 시세 50 + 교통 25 + 학군 15 + 생활 10. 시세는 시장이 매긴 성적, 나머지는 우리가 매긴 입지 점수다.
// 시세 점수는 ㎡당 가격의 배수(로그) 눈금: priceLow가 0점, priceHigh가 만점. 구간(cuts)은 한 번 정하면 지구가 늘어도 바꾸지 않는다.
export const TIER_RULE = {
  weights: { price: 50, transit: 25, school: 15, living: 10 },
  priceLow: 5_000_000,   // ㎡당 500만 원(전용 84㎡ 약 4.2억)
  priceHigh: 40_000_000, // ㎡당 4,000만 원(전용 84㎡ 약 33.6억)
  cuts: [85, 75, 65, 55, 45, 35], // 85점 이상 1급 … 35점 미만 7급
};
const round1 = (v) => Math.round(v * 10) / 10;
// 내가 정한 비중을 합계 100으로 맞춘다. 0 이상의 숫자만 받고, 모두 0이면 쓸 수 없다(null).
export function normalizeTierWeights(input) {
  const keys = Object.keys(TIER_RULE.weights);
  const vals = keys.map((k) => Number(input?.[k]));
  if (vals.some((v) => !Number.isFinite(v) || v < 0)) return null;
  const sum = vals.reduce((a, b) => a + b, 0); if (!(sum > 0)) return null;
  const out = vals.map((v) => round1((v / sum) * 100));
  // 반올림으로 생긴 차이는 가장 큰 항목에 더해 합계를 정확히 100으로 만든다
  const i = out.indexOf(Math.max(...out)); out[i] = round1(out[i] + (100 - out.reduce((a, b) => a + b, 0)));
  return Object.fromEntries(keys.map((k, n) => [k, out[n]]));
}
const rawPricePoints = (perM2, rule) => (perM2 > 0 ? Math.min(rule.weights.price, Math.max(0, (rule.weights.price * Math.log(perM2 / rule.priceLow)) / Math.log(rule.priceHigh / rule.priceLow))) : null);
const rawStarPoints = (stars, weight) => (typeof stars === 'number' ? ((stars - 1) / 4) * weight : null);
export const pricePoints = (perM2, rule = TIER_RULE) => { const p = rawPricePoints(perM2, rule); return p === null ? null : round1(p); };
export const starPoints = (stars, weight) => { const p = rawStarPoints(stars, weight); return p === null ? null : round1(p); };
export function tierOf(score, rule = TIER_RULE) {
  if (typeof score !== 'number') return null;
  const i = rule.cuts.findIndex((c) => score >= c);
  return i === -1 ? rule.cuts.length + 1 : i + 1;
}
// price: { perM2, count } 또는 없음. 시세가 없으면(입주 전·거래 없음) 급지를 매기지 않는다.
// 미래 급지는 교통만 개통 후 점수로 바꿔 다시 계산한다(시세·학군·생활은 그대로).
export function districtTier(scores, price, rule = TIER_RULE) {
  const w = rule.weights;
  const raw = { price: rawPricePoints(price?.perM2, rule), transit: rawStarPoints(scores.transitNow.stars, w.transit), transitFuture: rawStarPoints(scores.transitFuture.stars, w.transit),
    school: rawStarPoints(scores.school.stars, w.school), living: rawStarPoints(scores.living.stars, w.living) };
  const r = (v) => (v === null ? null : round1(v));
  const parts = {
    price: { max: w.price, points: r(raw.price), perM2: price?.perM2 ?? null, count: price?.count ?? 0 },
    transit: { max: w.transit, points: r(raw.transit), pointsFuture: r(raw.transitFuture ?? raw.transit) },
    school: { max: w.school, points: r(raw.school) },
    living: { max: w.living, points: r(raw.living) },
  };
  if (raw.price === null) return { tier: null, tierFuture: null, score: null, scoreFuture: null, partial: false, parts };
  const rest = raw.price + (raw.school ?? 0) + (raw.living ?? 0);
  const score = round1(rest + (raw.transit ?? 0)); const scoreFuture = round1(rest + (raw.transitFuture ?? raw.transit ?? 0));
  return { tier: tierOf(score, rule), tierFuture: tierOf(scoreFuture, rule), score, scoreFuture, partial: [raw.transit, raw.school, raw.living].some((v) => v === null), parts };
}
// 급지용 시세: 59형·84형 각각의 최근 ㎡당 중앙값을 거래 건수로 가중 평균한다. bands = [{ perM2, count }]
export function tierPriceOf(bands) {
  const ok = (bands || []).filter((b) => b && b.count > 0 && b.perM2 > 0);
  const count = ok.reduce((a, b) => a + b.count, 0);
  return count ? { perM2: Math.round(ok.reduce((a, b) => a + b.perM2 * b.count, 0) / count), count } : { perM2: null, count: 0 };
}

// 모든 지구의 순위를 매긴다. 순위는 급지가 매겨진 지구끼리 비교하며 같은 값은 같은 순위다. 받은 목록의 각 항목에 tier.rank를 채워 돌려준다.
export function rankDistricts(list) {
  const ranked = list.filter((d) => d.tier.score !== null);
  const rankBy = (get, higherBetter = true) => { const vals = ranked.map(get).filter((v) => typeof v === 'number'); return (v) => (typeof v === 'number' ? 1 + vals.filter((x) => (higherBetter ? x > v : x < v)).length : null); };
  const by = { score: rankBy((d) => d.tier.score), scoreFuture: rankBy((d) => d.tier.scoreFuture), price: rankBy((d) => d.tier.parts.price.perM2), transit: rankBy((d) => d.scores.transitNow.avgMin, false),
    transitFuture: rankBy((d) => d.scores.transitFuture.avgMin, false), school: rankBy((d) => d.scores.school.stars), living: rankBy((d) => d.scores.living.stars) };
  for (const d of list) d.tier.rank = d.tier.score === null ? null : { of: ranked.length, score: by.score(d.tier.score), scoreFuture: by.scoreFuture(d.tier.scoreFuture), price: by.price(d.tier.parts.price.perM2),
    transit: by.transit(d.scores.transitNow.avgMin), transitFuture: by.transitFuture(d.scores.transitFuture.avgMin), school: by.school(d.scores.school.stars), living: by.living(d.scores.living.stars) };
  return list;
}

// 이미 매겨진 지구 목록을 다른 비중으로 다시 매긴다(공개 사이트에서 방문자가 비중을 바꿀 때). 시세는 목록에 든 값을 그대로 쓴다.
// weights가 없거나 쓸 수 없는 값(문자·음수·모두 0)이면 기본 비중으로 계산한다.
export function retier(list, weights = null) {
  const w = weights && typeof weights === 'object' ? normalizeTierWeights(weights) : null;
  const rule = w ? { ...TIER_RULE, weights: w } : TIER_RULE;
  for (const d of list) { const p = d.tier?.parts?.price; d.tier = districtTier(d.scores, p ? { perM2: p.perM2, count: p.count } : null, rule); }
  return rankDistricts(list);
}
