'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function RefreshButton({ goodsno }: { goodsno: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function refresh() {
    if (loading || !window.confirm('공급사 API 호출 1회를 사용해 최신 정보로 갱신할까요?')) return
    setLoading(true); setMessage(null)
    try {
      const response = await fetch('/api/suppliers/dome/products/refresh', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goodsno }),
      })
      const body = await response.json()
      if (!response.ok || !body.success) throw new Error(body.error?.message ?? '갱신에 실패했습니다.')
      setMessage('최신 정보로 갱신했습니다.')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '갱신에 실패했습니다.')
    } finally { setLoading(false) }
  }

  return <div className="row"><button type="button" onClick={refresh} disabled={loading}>{loading ? '갱신 중…' : '공급사 최신 정보 갱신'}</button>{message && <span className="notice" role="status">{message}</span>}</div>
}
