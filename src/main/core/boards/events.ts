// 일반 공지가 섞인 학회 게시판에서 학술행사·논문 모집 글만 남긴다. 지난 행사의 후기·사진·수상 글과 참가자 안내(확인서·숙박 등)는 뺀다.
const EVENT =
  /학술|심포지|세미나|워크숍|워크샵|컨퍼런스|콘퍼런스|포럼|강습회|강좌|웨비나|발표회|논문\s?모집|초록|CFP|conference|symposium|workshop|congress|seminar|webinar|call for|forum|colloquium|convention/i
const AFTER = /후기|성료|수상|사진|확인서|협조|숙박|택배/
export const isEventTitle = (title: string): boolean => EVENT.test(title) && !AFTER.test(title)
