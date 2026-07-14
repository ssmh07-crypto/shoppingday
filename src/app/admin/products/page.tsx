import Link from 'next/link'
import { requireAdminPage } from '@/lib/auth/admin'

export default async function ProductsPage() {
  await requireAdminPage()
  return <main className="container"><h1>상품</h1><p>상품 목록은 다음 단계에서 확장합니다.</p><Link className="button" href="/admin/products/import">친구도매 상품 가져오기</Link></main>
}
