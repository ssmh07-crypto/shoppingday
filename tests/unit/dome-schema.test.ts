import { describe, expect, it } from 'vitest'
import { goodsnoSchema } from '@/modules/suppliers/dome/dome-schemas'

describe('goodsno 검증', () => {
  it('공백을 제거하고 영문, 숫자, 하이픈을 허용한다', () => expect(goodsnoSchema.parse(' AB-123 ')).toBe('AB-123'))
  it.each(['', 'a/b', '한글', 'a_b', 'x'.repeat(65)])('잘못된 값 %s을 거부한다', (value) => expect(goodsnoSchema.safeParse(value).success).toBe(false))
})
