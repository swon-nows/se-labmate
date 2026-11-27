import { expect, test } from 'vitest'
import { isEventTitle } from '../../src/main/core/boards/events'

// 학회 게시판에서 실제로 읽은 제목들
test.each([
  ['2026년 정비사업 활성화를 위한 정책세미나(정비사업 공사비 분쟁해소 방안)(11/27)', true],
  ['학술행사 [부산울산경남지회] 2026 학술발표대회 및 임시총회(12/5)', true],
  ['[전구학]2026년도 학술심포지엄 발표신청 연장안내', true],
  ['2026년 한국지진공학회 제6회 웨비나 강좌', true],
  ['[외부행사]제10회 Structural Engineers World Congress(SEWC 2027)개최 안내', true],
  ['[공지] 2026 추계학술대회 CFP', true],
  ['[공지] 2026 추계학술대회 논문모집 기간 연장 (~11월 1일(일))', true],
  ['2026 강구조 기술발표회 접수 기한 연장 안내(~10/27(화) 17:00)', true],
  ['Save the Date: 2027 EERI Earthquake Conference!', true],
  ['Webinar: 2026 EERI Innovation Showcase', true],
  ['제1회 대학생 모듈러 건축설계 Studio 공모전 학생작품 접수 안내', false],
  ['학술행사 [행사후기]2026년 건설현장 정상화를 위한 정책세미나', false],
  ['[전구학] 2026 학술심포지 사진게재', false],
  ['[전구학]사무국 부재 안내(11.18~20)', false],
  ['제16기 임원 선출 결과 안내', false],
  ['KSCE 2026 CONVENTION 학술발표 우수논문 수상자 명단', false],
  ['2026년 제5회 한국강구조학회장배 당구대회 개최 (26.12.05)', false],
  ['[부고] 전남대학교 김선후 교수 부친상', false],
  ['장기미납회원 재가입', false],
  ['Adrian Rodriguez-Marek Selected as 2027 Joyner Lecturer', false],
  ['2026 한국공간구조학회 추계학술발표대회 출장 협조의뢰 건(공문 다운로드)', false],
  ['2026 가을 학술대회 참가확인서 발급안내', false],
  ['2026 추계학술발표대회 숙박 장소 추천 리스트 (부산)', false],
  ['가을 학술대회기간 주문도서 택배발송 중지 안내(11/2~11/9)', false],
  ['2026 가을 학술대회 프로그램 안내', true],
  ['미래 공동주택 활성화 포럼(11/24)', true]
])('%s → %s', (title, keep) => {
  expect(isEventTitle(title)).toBe(keep)
})
