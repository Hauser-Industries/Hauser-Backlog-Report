import type { DataSourceMode } from '@shared/types/backlog'

/** Packaged builds are live; mock data is an explicit development override. */
export function getDataSourceMode(environment: NodeJS.ProcessEnv = process.env): DataSourceMode {
  return environment.DATA_SOURCE?.trim().toLowerCase() === 'mock' ? 'mock' : 'live'
}
