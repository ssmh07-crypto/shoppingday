type LogValue = string | number | boolean | null | undefined

function write(level: 'info' | 'error', message: string, context: Record<string, LogValue>) {
  const entry = JSON.stringify({ level, message, ...context, timestamp: new Date().toISOString() })
  if (level === 'error') console.error(entry)
  else console.info(entry)
}

export const logger = {
  info: (message: string, context: Record<string, LogValue> = {}) => write('info', message, context),
  error: (message: string, context: Record<string, LogValue> = {}) =>
    write('error', message, context),
}
