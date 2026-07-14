import { SupplierError } from '../core/supplier-errors'

export class DomeParseError extends SupplierError {
  constructor(message = '친구도매 응답을 해석할 수 없습니다.') {
    super('supplier_invalid_xml', message)
    this.name = 'DomeParseError'
  }
}
