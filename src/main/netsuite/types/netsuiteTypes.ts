import type { WorkOrderNode } from '@shared/types/backlog'

export type SuiteQlRecord = Record<string, unknown>

export interface DataRequestOptions {
  signal?: AbortSignal
}

export interface SuiteQlQuery {
  name: string
  sql: string
}

export interface SuiteQlQueryResult {
  items: SuiteQlRecord[]
  totalResults: number
  pages: number
}

export interface SuiteQLResponse<T> {
  count: number
  offset: number
  totalResults: number
  hasMore: boolean
  items: T[]
}

export type WorkOrderRecord = Omit<WorkOrderNode, 'children'>

export type NetSuiteEndpointCategory = 'suiteql' | 'rest-record' | 'oauth'
