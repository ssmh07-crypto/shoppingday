'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import type { ImportProductResult } from '@/modules/products/product-service'

export function ImportForm() {
  const [goodsno, setGoodsno] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportProductResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (loading) return
    setLoading(true); setError(null); setResult(null)
    try {
      const response = await fetch('/api/suppliers/dome/products/import', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goodsno }),
      })
      const body = await response.json()
      if (!response.ok || !body.success) throw new Error(body.error?.message ?? '가져오기에 실패했습니다.')
      setResult(body)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '가져오기에 실패했습니다.')
    } finally { setLoading(false) }
  }

  return <>
    <form className="card" onSubmit={submit}>
      <label htmlFor="goodsno">친구도매 상품번호</label>
      <div className="row" style={{ marginTop: 10 }}>
        <input id="goodsno" value={goodsno} onChange={(e) => setGoodsno(e.target.value)} maxLength={64} required autoComplete="off" />
        <button disabled={loading}>{loading ? '가져오는 중…' : '상품 가져오기'}</button>
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
    </form>
    {result && <section className="card" aria-live="polite">
      <p className="notice">{result.alreadyExists ? '이미 가져온 상품입니다. 외부 API를 다시 호출하지 않았습니다.' : '상품을 가져왔습니다.'}</p>
      <div className="preview">
        {/* Supplier URLs are shown as-is; importing/optimizing into R2 is outside this phase. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {result.preview.imageUrl ? <img src={result.preview.imageUrl} alt="원본 대표 이미지" /> : <div>이미지 없음</div>}
        <dl>
          <dt>상품번호</dt><dd>{result.preview.externalProductId}</dd>
          <dt>원본 상품명</dt><dd>{result.preview.originalName ?? '-'}</dd>
          <dt>공급가</dt><dd>{result.preview.supplierPrice ? `${result.preview.supplierPrice} ${result.preview.currency}` : '-'}</dd>
          <dt>판매 상태</dt><dd>{result.preview.availability}</dd>
          <dt>이미지 / 옵션</dt><dd>{result.preview.imageCount}개 / {result.preview.optionCount}개</dd>
          <dt>공급처 수정일</dt><dd>{result.preview.supplierUpdatedAt ?? '-'}</dd>
          <dt>내부 상품 ID</dt><dd>{result.productId}</dd>
        </dl>
      </div>
      <div className="row" style={{ marginTop: 20 }}><Link className="button secondary" href="/admin/products">상품 목록으로 이동</Link><Link className="button" href={`/admin/products/${result.productId}`}>상품 상세 보기</Link></div>
    </section>}
  </>
}
