import type { Profile, Settings } from '../../shared/types'
import { cleanKeywords } from './text'

const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/

export function validateProfile(input: {
  profile: Profile
  settings: Settings
}): { ok: true; profile: Profile; settings: Settings } | { ok: false; errors: string[] } {
  const keywordsEn = cleanKeywords(input.profile.keywordsEn)
  const keywordsKo = cleanKeywords(input.profile.keywordsKo)
  const errors: string[] = []
  if (keywordsEn.length === 0) errors.push('영문 주제 키워드를 1개 이상 입력해 주십시오.')
  if (!TIME_FORMAT.test(input.settings.notifyTime))
    errors.push('알림 시각은 00:00~23:59 형식이어야 합니다.')
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    profile: { ...input.profile, keywordsEn, keywordsKo },
    settings: input.settings
  }
}
