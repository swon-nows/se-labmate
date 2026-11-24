import { expect, test } from 'vitest'
import { isWindowOpen } from '../../src/main/core/visibility'

test('트레이로 닫히지 않았고, 내려지지 않았고, 앱이 가려지지 않았을 때만 열려 있다', () => {
  expect(isWindowOpen(false, false, false)).toBe(true)
  for (const [closedToTray, minimised, appHidden] of [
    [true, false, false],
    [false, true, false],
    [false, false, true],
    [true, true, true]
  ])
    expect(isWindowOpen(closedToTray, minimised, appHidden)).toBe(false)
})
