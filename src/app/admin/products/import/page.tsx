import { requireAdminPage } from '@/lib/auth/admin'
import { ImportForm } from './import-form'

export default async function ImportProductPage() {
  await requireAdminPage()
  return <main className="container"><h1>친구도매 상품 가져오기</h1><p>상품번호를 입력하고 버튼을 누를 때만 친구도매 API를 호출합니다.</p><ImportForm /></main>
}
