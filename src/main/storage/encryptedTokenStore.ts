import electron from 'electron'
import Store from 'electron-store'

import { NetSuiteIntegrationError } from '../netsuite/errors'

const { safeStorage } = electron

interface SecureTokenStoreSchema {
  refreshTokenCiphertext?: string
}

export interface RefreshTokenStore {
  getRefreshToken(): Promise<string | undefined>
  setRefreshToken(refreshToken: string): Promise<void>
  clearRefreshToken(): Promise<void>
}

export class SafeStorageRefreshTokenStore implements RefreshTokenStore {
  private readonly store: Store<SecureTokenStoreSchema>

  constructor(store = new Store<SecureTokenStoreSchema>({ name: 'secure-oauth' })) {
    this.store = store
  }

  async getRefreshToken(): Promise<string | undefined> {
    const ciphertext = this.store.get('refreshTokenCiphertext')
    if (!ciphertext) return undefined
    this.assertEncryptionAvailable()

    try {
      return safeStorage.decryptString(Buffer.from(ciphertext, 'base64'))
    } catch (error) {
      throw new NetSuiteIntegrationError('The saved NetSuite sign-in could not be decrypted.', {
        code: 'authentication-failed',
        cause: error
      })
    }
  }

  async setRefreshToken(refreshToken: string): Promise<void> {
    if (!refreshToken) {
      throw new NetSuiteIntegrationError('NetSuite returned an empty refresh token.', {
        code: 'authentication-failed'
      })
    }

    this.assertEncryptionAvailable()
    const encrypted = safeStorage.encryptString(refreshToken).toString('base64')
    this.store.set('refreshTokenCiphertext', encrypted)
  }

  async clearRefreshToken(): Promise<void> {
    this.store.delete('refreshTokenCiphertext')
  }

  private assertEncryptionAvailable(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new NetSuiteIntegrationError(
        'Secure Windows credential encryption is unavailable. NetSuite tokens were not stored.',
        { code: 'authentication-failed' }
      )
    }
  }
}
