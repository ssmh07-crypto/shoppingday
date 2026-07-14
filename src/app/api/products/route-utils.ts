import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { AuthenticationError } from '@/lib/auth/admin'
import { ProductConflictError, ProductNotFoundError, ProductValidationError } from '@/modules/products/product-errors'
export function productError(error:unknown){ let code='internal_error',message='요청을 처리하지 못했습니다.',status=500,errors:Record<string,string>|undefined
  if(error instanceof AuthenticationError){code=error.code;message=error.message;status=401}
  else if(error instanceof ProductNotFoundError){code=error.code;message=error.message;status=404}
  else if(error instanceof ProductConflictError){code=error.code;message=error.message;status=409}
  else if(error instanceof ProductValidationError){code=error.code;message=error.message;status=422;errors=error.errors}
  else if(error instanceof ZodError){code='validation_error';message='입력값을 확인해 주세요.';status=400;errors=Object.fromEntries(error.issues.map((issue)=>[issue.path.join('.'),issue.message]))}
  return NextResponse.json({success:false,error:{code,message,errors}},{status}) }
