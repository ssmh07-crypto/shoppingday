import 'server-only'
import { ProductEditRepository } from './product-edit-repository'
import { ProductEditService } from './product-edit-service'
export function createProductEditService(){return new ProductEditService(new ProductEditRepository())}
