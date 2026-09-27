/* 급수 트랙 — 선생님이 쓰던 급수표(타자연습 급수제.hwpx, 리코더 급수제.hwpx) 그대로
   학생의 현재 급수 = 달성한 단계 수 (0 = 아직 없음, 1 = 첫 단계 달성 …)
   cat: 승급할 때 티어에 반영되는 기록 종류 */
(function () {
  const TRACKS = {
    typing: {
      name: '타자', ic: '⌨️', cat: 'lvTyping', who: 'request',
      levels: [
        { name: '왕초보', cond: '기본자리 연습 1분 이내 · 정확도 95% 이상', reward: '마이쮸 1' },
        { name: '초보', cond: '기본자리 연습 50초 이내 · 정확도 100%', reward: '마이쮸 2' },
        { name: '중수', cond: '낱말연습 1분 20초 이내 · 정확도 95% 이상', reward: '촉촉한 초코칩 1' },
        { name: '고수', cond: '낱말연습 50초 이내 · 정확도 100%', reward: '촉촉한 초코칩 2' },
        { name: '초고수', cond: '문장연습 300타 이상 · 정확도 97% 이상', reward: '상금 30만', prize: 300000 },
        { name: '달인', cond: '문장연습 500타 이상 · 정확도 100%', reward: '주급 추가 20만', wage: 200000 },
        { name: '전설', cond: '긴글연습 400타 이상 · 정확도 97% 이상', reward: '주급 추가 30만 · 인증서 발급', wage: 300000 },
        { name: '신', cond: '긴글연습 600타 이상 · 정확도 100%', reward: '주급 추가 50만 · 인증서 발급', wage: 500000 },
      ],
    },
    recorder: {
      name: '리코더', ic: '🎵', cat: 'lvRecorder', who: 'request',
      levels: [
        { name: '왕초보', songs: '에델바이스 · 나비야 · 비행기 · 잠자리', cond: '외워서 4곡 전체 연주', reward: '담라 1개' },
        { name: '초보', songs: '모두모두 자란다 · 풍선 · 언제나 몇 번이라도', cond: '외워서 2곡 연주', reward: '담라 2개' },
        { name: '삼류', songs: '친구가 되는 멋진 방법 · 가을 아침 · 시대를 초월한 마음', cond: '외워서 1곡 연주', reward: '촉촉한 초코칩 1개' },
        { name: '이류', songs: '사랑했나봐(보통) · 아이브 After like', cond: '1곡 골라서 연주', reward: '상금 20만', prize: 200000 },
        { name: '일류', songs: '첫 만남은 계획대로 되지 않아 · 벚꽃엔딩', cond: '1곡 골라서 연주', reward: '상금 40만', prize: 400000 },
        { name: '절정', songs: '슈퍼마리오 OST · 사건의 지평선', cond: '1곡 골라서 연주', reward: '주급 20만 추가', wage: 200000 },
        { name: '초절정', songs: '할아버지의 시계(명품시계) · 학교 가는 길(김광민, 이루마)', cond: '1곡 골라서 연주', reward: '주급 40만 추가', wage: 400000 },
        { name: '절대지경', songs: '내 이름 맑음', cond: '1곡 연주 (2회 실수 허용)', reward: '주급 100만 추가', wage: 1000000 },
      ],
    },
    hanja: {
      name: '한자', ic: '🀄', cat: 'lvHanja', who: 'test',
      levels: [
        { name: '8급', cond: '8급 50자 학습 후 승급 시험 통과', reward: '' },
        { name: '7급Ⅱ', cond: '7급Ⅱ 50자(누적 100자) 학습 후 승급 시험 통과', reward: '' },
        { name: '7급', cond: '7급 50자(누적 150자) 학습 후 승급 시험 통과', reward: '' },
      ],
    },
  };
  const levelName = (track, n) => (n > 0 ? TRACKS[track].levels[n - 1].name : '시작 전');
  // 급수 수당: 지금 급수의 「주급 추가」 금액 (단계마다 새 금액으로 바뀜, 종목끼리는 더함)
  const wageBonus = (track, n) => (n > 0 && TRACKS[track].levels[n - 1].wage) || 0;
  window.Tracks = { TRACKS, levelName, wageBonus };
})();
