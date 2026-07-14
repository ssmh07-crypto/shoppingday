import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { ProductEditService } from '@/modules/products/product-edit-service'
import { ProductEditRepository } from '@/modules/products/product-edit-repository'
import { productError } from './route-utils'
export async function GET(request:Request){try{const user=await requireAdmin();const url=new URL(request.url);return NextResponse.json({success:true,...await new ProductEditService(new ProductEditRepository()).list(user.id,{search:url.searchParams.get('search')??undefined,filter:url.searchParams.get('filter')??undefined,sort:url.searchParams.get('sort')??undefined,page:Number(url.searchParams.get('page'))||1})})}catch(error){return productError(error)}}
