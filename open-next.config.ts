import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// Images remain supplier URL references. No R2 cache or image storage binding
// is configured for this phase.
export default defineCloudflareConfig()
