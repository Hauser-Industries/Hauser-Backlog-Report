import type { ConnectionStatus } from '../types/backlog'

export function requiresStartupAuthorization(
  status: Pick<ConnectionStatus, 'dataSource' | 'startupAuthorization'>
): boolean {
  return (
    status.dataSource === 'live' &&
    status.startupAuthorization !== undefined &&
    status.startupAuthorization !== 'not-required' &&
    status.startupAuthorization !== 'approved'
  )
}

export function shouldBeginStartupAuthorization(
  status: Pick<ConnectionStatus, 'dataSource' | 'startupAuthorization'>
): boolean {
  return status.dataSource === 'live' && status.startupAuthorization === 'required'
}

/** Live data loads only after this process has completed its required interactive authorization. */
export function shouldLoadBacklogAtStartup(
  status: Pick<ConnectionStatus, 'dataSource' | 'authenticated' | 'startupAuthorization'>
): boolean {
  return (
    status.dataSource === 'mock' || (status.authenticated && !requiresStartupAuthorization(status))
  )
}
