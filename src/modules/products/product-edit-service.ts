import type { ProductRow } from '@/lib/db/schema'
import { draftInputSchema, imagesFromSupplier, optionsFromSupplier, readyErrors, statusAfterSave, type DraftInput } from './product-domain'
import { ProductConflictError, ProductNotFoundError, ProductValidationError } from './product-errors'
import type { ProductEditRepository } from './product-edit-repository'

export class ProductEditService {
  constructor(private repo:ProductEditRepository){}
  list(ownerId:string,input:{search?:string;filter?:string;sort?:string;page?:number}) { return this.repo.list({ownerId,...input,page:Math.max(1,input.page??1),pageSize:20}) }
  async get(id:string,ownerId:string){ const row=await this.repo.find(id,ownerId); if(!row) throw new ProductNotFoundError(); return row }
  categories(){ return this.repo.categories() }
  async saveDraft(id:string,ownerId:string,raw:unknown){ const input=draftInputSchema.parse(raw); const current=await this.get(id,ownerId); const changed=changedFields(current.product,input); const status=statusAfterSave(current.product.status,changed); return this.handle(await this.repo.save(id,ownerId,input,status,changed,'product_draft_saved',{},status==='ready'?current.product.readyAt:null)) }
  async markReady(id:string,ownerId:string,raw:unknown){ const input=draftInputSchema.parse(raw); const errors=readyErrors(input); if(Object.keys(errors).length) throw new ProductValidationError(errors); const current=await this.get(id,ownerId); return this.handle(await this.repo.save(id,ownerId,input,'ready',changedFields(current.product,input),'product_marked_ready',{},new Date())) }
  async revert(id:string,ownerId:string,raw:unknown){ const input=draftInputSchema.parse(raw); const current=await this.get(id,ownerId); return this.handle(await this.repo.save(id,ownerId,input,'draft',changedFields(current.product,input),'product_reverted_to_draft',{},null)) }
  async reset(id:string,ownerId:string,version:number,kind:'images'|'options'){ const current=await this.get(id,ownerId); const value=kind==='images'?imagesFromSupplier(current.supplier.originalImages):optionsFromSupplier(current.supplier.originalOptions); return this.handle(await this.repo.reset(id,ownerId,version,kind,value)) }
  private handle<T extends {kind:string}>(result:T){ if(result.kind==='conflict') throw new ProductConflictError(); if(result.kind==='not_found') throw new ProductNotFoundError(); return result }
}
function changedFields(product:ProductRow,input:DraftInput){ return (['title','searchTags','sellingPrice','currency','description','categoryId','selectedImages','editedOptions'] as const).filter((key)=>JSON.stringify(product[key])!==JSON.stringify(input[key])) }
