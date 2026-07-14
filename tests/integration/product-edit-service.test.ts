import { describe,expect,it,vi } from 'vitest'
import { ProductEditService } from '@/modules/products/product-edit-service'
import { imagesFromSupplier } from '@/modules/products/product-domain'
import type { ProductEditRepository,ProductEditorRecord } from '@/modules/products/product-edit-repository'

const product={id:'p1',ownerId:'u1',status:'draft' as const,title:'원본',searchTags:[],sellingPrice:null,currency:'KRW',description:'설명',categoryId:null,selectedImages:imagesFromSupplier(['https://example.test/a.jpg']),editedOptions:{groups:[],combinations:[]},draftVersion:1,validationErrors:{},readyAt:null,createdAt:new Date(),updatedAt:new Date()}
const record:ProductEditorRecord={product,supplier:{code:'dome',name:'친구도매',externalProductId:'1',originalName:'원본',supplierPrice:'100',currency:'KRW',availability:'active',originalImages:['https://example.test/a.jpg'],originalOptions:[],rawDescription:'원본 설명',supplierCreatedAt:null,supplierUpdatedAt:null,lastSyncedAt:new Date()}}
const draft={draftVersion:1,title:'판매명',searchTags:[' 태그 ','태그'],sellingPrice:1000,currency:'KRW',description:'<p>설명</p>',categoryId:null,selectedImages:product.selectedImages,editedOptions:product.editedOptions}
function setup(result:unknown={kind:'ok',product:{...product,draftVersion:2,status:'editing'}}){const repo={find:vi.fn(async()=>record),save:vi.fn(async()=>result),list:vi.fn(),categories:vi.fn(),reset:vi.fn()};return{service:new ProductEditService(repo as unknown as ProductEditRepository),repo}}
describe('상품 편집 서비스',()=>{
 it('임시저장 시 정규화하고 버전 증가 결과를 반환하며 원본을 변경하지 않는다',async()=>{const {service,repo}=setup();const original=structuredClone(record.supplier);const result=await service.saveDraft('p1','u1',draft);expect(repo.save).toHaveBeenCalledWith('p1','u1',expect.objectContaining({searchTags:['태그']}),'editing',expect.any(Array),'product_draft_saved',{},null);expect(result).toMatchObject({product:{draftVersion:2}});expect(record.supplier).toEqual(original)})
 it('낙관적 잠금 충돌을 사용자 오류로 변환한다',async()=>{const {service}=setup({kind:'conflict'});await expect(service.saveDraft('p1','u1',draft)).rejects.toMatchObject({code:'product_conflict'})})
 it('필수값이 없으면 ready 저장을 호출하지 않는다',async()=>{const {service,repo}=setup();await expect(service.markReady('p1','u1',{...draft,title:''})).rejects.toMatchObject({code:'product_validation'});expect(repo.save).not.toHaveBeenCalled()})
 it('ready 검증 성공 시 ready 상태와 감사 action을 저장 계층에 전달한다',async()=>{const {service,repo}=setup({kind:'ok',product:{...product,status:'ready',draftVersion:2}});await service.markReady('p1','u1',draft);expect(repo.save).toHaveBeenCalledWith('p1','u1',expect.any(Object),'ready',expect.any(Array),'product_marked_ready',{},expect.any(Date))})
})
