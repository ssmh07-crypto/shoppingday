import Link from 'next/link'
import { requireAdminPage } from '@/lib/auth/admin'
import { createProductEditService } from '@/modules/products/product-edit-factory'
import { ProductEditor } from './product-editor'
export default async function EditPage({params}:{params:Promise<{id:string}>}){const user=await requireAdminPage();const id=(await params).id;const service=createProductEditService();const [record,categories]=await Promise.all([service.get(id,user.id),service.categories()]);return <main className="container wide"><Link href="/admin/products">← 내 상품 목록</Link><h1>판매 상품 편집</h1><ProductEditor initial={JSON.parse(JSON.stringify(record))} categories={categories}/></main>}
