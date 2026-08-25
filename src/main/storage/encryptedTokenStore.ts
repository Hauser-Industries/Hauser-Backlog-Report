import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import electron from 'electron'

import { NetSuiteIntegrationError } from '../netsuite/errors'

const { app, safeStorage } = electron
const TOKEN_FILENAME = 'netsuite-refresh-token.bin'
const CONSUMING_SUFFIX = '.consuming'
const LEGACY_SETTINGS_FILENAME = 'secure-oauth.json'

export interface TokenEncryption {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encrypted: Buffer): string
}

export interface RefreshTokenStore {
  hasRefreshToken(): Promise<boolean>
  takeRefreshToken(): Promise<string | undefined>
  setRefreshToken(refreshToken: string): Promise<void>
  clearRefreshToken(): Promise<void>
}

export interface SafeStorageRefreshTokenStoreOptions {
  filePath?: string
  userDataDirectory?: string
  tokenNamespace?: string
  migrateLegacyGenericToken?: boolean
  legacySettingsFilePath?: string
  encryption?: TokenEncryption
}

function isFileNotFound(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

/**
 * Stores only DPAPI-protected binary ciphertext under Electron's userData
 * directory. A token is atomically consumed before a refresh request so a
 * one-time NetSuite refresh token can never be replayed after a crash or an
 * ambiguous network failure.
 */
export class SafeStorageRefreshTokenStore implements RefreshTokenStore {
  private readonly filePath: string
  private readonly consumingFilePath: string
  private readonly legacyGenericTokenFilePath: string | undefined
  private readonly legacySettingsFilePath: string
  private readonly encryption: TokenEncryption
  private operationQueue: Promise<void> = Promise.resolve()
  private initialized = false

  constructor(options: SafeStorageRefreshTokenStoreOptions = {}) {
    const userDataDirectory = options.filePath
      ? dirname(options.filePath)
      : (options.userDataDirectory ?? app.getPath('userData'))
    const namespacedFilename = options.tokenNamespace
      ? `netsuite-refresh-token-${this.namespaceFragment(options.tokenNamespace)}.bin`
      : TOKEN_FILENAME
    this.filePath = options.filePath ?? join(userDataDirectory, namespacedFilename)
    this.consumingFilePath = `${this.filePath}${CONSUMING_SUFFIX}`
    this.legacyGenericTokenFilePath =
      options.tokenNamespace && options.migrateLegacyGenericToken
        ? join(userDataDirectory, TOKEN_FILENAME)
        : undefined
    this.legacySettingsFilePath =
      options.legacySettingsFilePath ?? join(userDataDirectory, LEGACY_SETTINGS_FILENAME)
    this.encryption = options.encryption ?? safeStorage
  }

  hasRefreshToken(): Promise<boolean> {
    return this.runExclusive(async () => {
      await this.initialize()
      try {
        const encrypted = await readFile(this.filePath)
        this.assertEncryptionAvailable()
        return this.encryption.decryptString(encrypted).length > 0
      } catch (error) {
        if (isFileNotFound(error)) return false
        throw this.readError(error)
      }
    })
  }

  takeRefreshToken(): Promise<string | undefined> {
    return this.runExclusive(async () => {
      await this.initialize()

      try {
        // Renaming first is the durable consume marker. If the process stops
        // after this point, startup deletes the marker instead of replaying it.
        await rename(this.filePath, this.consumingFilePath)
      } catch (error) {
        if (isFileNotFound(error)) return undefined
        throw this.readError(error)
      }

      try {
        const encrypted = await readFile(this.consumingFilePath)
        this.assertEncryptionAvailable()
        const refreshToken = this.encryption.decryptString(encrypted)
        if (!refreshToken) throw new Error('Decrypted refresh token was empty.')
        return refreshToken
      } catch (error) {
        throw this.readError(error)
      } finally {
        await this.removeIfPresent(this.consumingFilePath)
      }
    })
  }

  setRefreshToken(refreshToken: string): Promise<void> {
    return this.runExclusive(async () => {
      await this.initialize()
      if (!refreshToken) {
        throw new NetSuiteIntegrationError('NetSuite returned an empty refresh token.', {
          code: 'authentication-failed'
        })
      }

      this.assertEncryptionAvailable()
      let encrypted: Buffer
      try {
        encrypted = this.encryption.encryptString(refreshToken)
      } catch (error) {
        throw new NetSuiteIntegrationError('The NetSuite sign-in could not be encrypted.', {
          code: 'authentication-failed',
          cause: error
        })
      }

      await mkdir(dirname(this.filePath), { recursive: true })
      const temporaryPath = join(
        dirname(this.filePath),
        `.${basename(this.filePath)}.${process.pid}.${randomUUID()}.tmp`
      )

      try {
        const handle = await open(temporaryPath, 'wx', 0o600)
        try {
          await handle.writeFile(encrypted)
          await handle.sync()
        } finally {
          await handle.close()
        }
        await rename(temporaryPath, this.filePath)
      } catch (error) {
        await this.removeIfPresent(temporaryPath)
        throw new NetSuiteIntegrationError('The encrypted NetSuite sign-in could not be saved.', {
          code: 'authentication-failed',
          cause: error
        })
      }
    })
  }

  clearRefreshToken(): Promise<void> {
    return this.runExclusive(async () => {
      await this.initialize()
      await this.removeIfPresent(this.filePath)
      await this.removeIfPresent(this.consumingFilePath)
      await this.removeIfPresent(this.legacySettingsFilePath)
    })
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation)
    this.operationQueue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return

    if (this.legacyGenericTokenFilePath) {
      await this.removeIfPresent(`${this.legacyGenericTokenFilePath}${CONSUMING_SUFFIX}`)
      await this.migrateLegacyGenericToken(this.legacyGenericTokenFilePath)
    }

    // The previous implementation used electron-store. Do not migrate or keep
    // that JSON ciphertext: discard it and require a clean sign-in instead.
    await this.removeIfPresent(this.legacySettingsFilePath)
    await this.removeIfPresent(this.consumingFilePath)
    this.initialized = true
  }

  private async migrateLegacyGenericToken(legacyFilePath: string): Promise<void> {
    try {
      await readFile(this.filePath)
      await this.removeIfPresent(legacyFilePath)
      return
    } catch (error) {
      if (!isFileNotFound(error)) throw this.readError(error)
    }

    try {
      await rename(legacyFilePath, this.filePath)
    } catch (error) {
      if (!isFileNotFound(error)) throw this.readError(error)
    }
  }

  private async removeIfPresent(filePath: string): Promise<void> {
    try {
      await unlink(filePath)
    } catch (error) {
      if (!isFileNotFound(error)) throw error
    }
  }

  private assertEncryptionAvailable(): void {
    if (!this.encryption.isEncryptionAvailable()) {
      throw new NetSuiteIntegrationError(
        'Secure Windows credential encryption is unavailable. NetSuite tokens were not stored.',
        { code: 'authentication-failed' }
      )
    }
  }

  private namespaceFragment(namespace: string): string {
    const fragment = namespace
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
    if (!fragment) {
      throw new NetSuiteIntegrationError('The NetSuite token namespace is invalid.', {
        code: 'authentication-failed'
      })
    }
    return fragment
  }

  private readError(error: unknown): NetSuiteIntegrationError {
    if (error instanceof NetSuiteIntegrationError) return error
    return new NetSuiteIntegrationError('The saved NetSuite sign-in could not be decrypted.', {
      code: 'authentication-failed',
      cause: error
    })
  }
}
