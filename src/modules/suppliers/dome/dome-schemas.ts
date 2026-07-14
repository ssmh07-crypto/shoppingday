import { z } from 'zod'

export const goodsnoSchema = z
  .string()
  .trim()
  .min(1, '상품번호를 입력해 주세요.')
  .max(64, '상품번호는 64자 이하여야 합니다.')
  .regex(/^[A-Za-z0-9-]+$/, '상품번호에는 영문, 숫자, 하이픈만 사용할 수 있습니다.')

const optionalText = z.union([z.string(), z.number()]).optional().transform((value) =>
  value === undefined ? undefined : String(value),
)

export const domeProductSchema = z
  .object({
    goodsno: z.union([z.string(), z.number()]).transform(String),
    status: optionalText,
    category: optionalText,
    goodscd: optionalText,
    goodsnm: optionalText,
    madein: optionalText,
    option_value: optionalText,
    goods_price: optionalText,
    goods_consumer: optionalText,
    goods_minPrice: optionalText,
    img_l: z.record(z.string(), z.unknown()).optional(),
    options: optionalText,
    detailed_source: optionalText,
    regdate: optionalText,
    lastmodidate: optionalText,
  })
  .loose()

export const importProductInputSchema = z.object({ goodsno: goodsnoSchema })
