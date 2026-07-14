import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin'
import { ProductEditService } from '@/modules/products/product-edit-service'
import { ProductEditRepository } from '@/modules/products/product-edit-repository'
import { productError } from '../route-utils'
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{const user=await requireAdmin();return NextResponse.json({success:true,data:await new ProductEditService(new ProductEditRepository()).get((await params).id,user.id)})}catch(error){return productError(error)}}
