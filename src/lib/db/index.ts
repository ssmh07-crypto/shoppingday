import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { getServerEnv } from '@/lib/env/server'

let client: ReturnType<typeof postgres> | undefined
let database: ReturnType<typeof drizzle> | undefined

export function getDb() {
  if (!database) {
    client = postgres(getServerEnv().DATABASE_URL, { prepare: false, max: 5 })
    database = drizzle(client)
  }
  return database
}

export async function closeDb() {
  await client?.end()
  client = undefined
  database = undefined
}
