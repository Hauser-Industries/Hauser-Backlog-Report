import type { ConnectionStatus } from '../types/backlog'

/** The report is the home screen; live data loads immediately when an OAuth session is available. */
export function shouldLoadBacklogAtStartup(
  status: Pick<ConnectionStatus, 'dataSource' | 'authenticated'>
): boolean {
  return status.dataSource === 'mock' || status.authenticated
}
