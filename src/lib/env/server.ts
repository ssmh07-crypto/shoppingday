import 'server-only'
import { z } from 'zod'

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

// `.env.local` templates commonly keep optional settings as empty strings.
// Treat those as unset so unused integrations (such as R2 in the current
// URL-only image flow) do not prevent the application from starting.
const optionalString = z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional())
const optionalUrl = z.preprocess((value) => value === '' ? undefined : value, z.url().optional())

const serverEnvSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    DATABASE_URL: z.string().min(1),
    DOME_API_URL: z.url().default('https://79dome.com/Api/ProductSelect_Api_UTF8.php'),
    DOME_API_ID: optionalString,
    DOME_API_KEY: optionalString,
    DOME_API_MOCK_MODE: booleanString,
    DOME_API_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(10_000),
    DOME_API_MAX_RESPONSE_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(20 * 1024 * 1024)
      .default(5 * 1024 * 1024),
    R2_ACCOUNT_ID: optionalString,
    R2_ACCESS_KEY_ID: optionalString,
    R2_SECRET_ACCESS_KEY: optionalString,
    R2_BUCKET_NAME: optionalString,
    R2_PUBLIC_BASE_URL: optionalUrl,
  })
  .superRefine((env, ctx) => {
    if (!env.DOME_API_MOCK_MODE && (!env.DOME_API_ID || !env.DOME_API_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['DOME_API_ID'],
        message: 'DOME_API_ID and DOME_API_KEY are required outside mock mode',
      })
    }
  })

export type ServerEnv = z.infer<typeof serverEnvSchema>

let cached: ServerEnv | undefined

export function getServerEnv(): ServerEnv {
  cached ??= serverEnvSchema.parse(process.env)
  return cached
}

export function resetEnvCacheForTests() {
  cached = undefined
}
