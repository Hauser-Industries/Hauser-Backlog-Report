import type { HauserBacklogApi } from '@shared/types/backlog'

declare global {
  interface Window {
    hauserBacklog: HauserBacklogApi
  }
}

export {}
