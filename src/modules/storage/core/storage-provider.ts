export interface StoredObject {
  key: string
  publicUrl: string
  checksum: string
}

export interface StorageProvider {
  createUploadUrl(key: string, contentType: string): Promise<string>
  publicUrl(key: string): string
  delete(key: string): Promise<void>
}
