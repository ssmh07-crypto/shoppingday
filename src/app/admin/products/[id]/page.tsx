import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminPage } from '@/lib/auth/admin'
import { DrizzleProductRepository } from '@/modules/products/product-repository'
import { RefreshButton } from './refresh-button'

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await params
  const detail = await new DrizzleProductRepository().findDetail(id)
  if (!detail) notFound()
  const item = detail.supplierProduct
  return <main className="container"><div className="row"><Link href="/admin/products">← 상품 목록</Link><Link className="button" href={`/admin/products/${detail.productId}/edit`}>판매 상품 편집</Link></div><h1>원본 상품 상세</h1>
    <section className="card"><RefreshButton goodsno={item.externalProductId} /><dl>
      <dt>내부 상품 ID</dt><dd>{detail.productId}</dd><dt>공급처</dt><dd>{detail.supplierName} ({detail.supplierCode})</dd>
      <dt>상품번호</dt><dd>{item.externalProductId}</dd><dt>원본 상품명</dt><dd>{item.originalName ?? '-'}</dd>
      <dt>공급가</dt><dd>{item.supplierPrice ? `${item.supplierPrice} ${item.currency}` : '-'}</dd><dt>판매 가능 상태</dt><dd>{item.availability}</dd>
      <dt>공급처 등록일</dt><dd>{format(item.supplierCreatedAt)}</dd><dt>공급처 수정일</dt><dd>{format(item.supplierUpdatedAt)}</dd>
      <dt>최초 가져온 시각</dt><dd>{format(item.firstImportedAt)}</dd><dt>마지막 동기화 시각</dt><dd>{format(item.lastSyncedAt)}</dd>
    </dl></section>
    <section className="card"><h2>원본 이미지</h2><div className="images">{item.originalImages.map((url) => <img key={url} src={url} alt="원본 상품" /> /* eslint-disable-line @next/next/no-img-element -- R2 import is outside this phase */)}</div></section>
    <section className="card"><h2>원본 옵션</h2>{item.originalOptions.length ? <ul>{item.originalOptions.map((option, index) => <li key={`${option.name}-${index}`}>{option.name} — {option.price ?? '-'} KRW</li>)}</ul> : <p>옵션 없음</p>}</section>
    <section className="card"><h2>원본 설명</h2>{item.rawDescription ? <iframe className="description" title="원본 상품 설명" sandbox="" srcDoc={item.rawDescription} style={{ width: '100%', minHeight: 480 }} /> : <p>설명 없음</p>}</section>
  </main>
}

function format(value: Date | null) { return value ? value.toISOString() : '-' }
