import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  SafeStorageRefreshTokenStore,
  type TokenEncryption
} from '../src/main/storage/encryptedTokenStore'

const testDirectories: string[] = []

const fakeWindowsEncryption: TokenEncryption = {
  isEncryptionAvailable: () => true,
  encryptString: (plainText) => {
    const payload = Buffer.from(plainText, 'utf8').map((byte) => byte ^ 0xa5)
    return Buffer.concat([Buffer.from([0x48, 0x42, 0x00, 0xff]), payload])
  },
  decryptString: (encrypted) => {
    if (!encrypted.subarray(0, 4).equals(Buffer.from([0x48, 0x42, 0x00, 0xff]))) {
      throw new Error('Invalid encrypted test payload.')
    }
    return Buffer.from(encrypted.subarray(4).map((byte) => byte ^ 0xa5)).toString('utf8')
  }
}

async function createStore(encryption: TokenEncryption = fakeWindowsEncryption) {
  const directory = await mkdtemp(join(tmpdir(), 'hauser-token-test-'))
  testDirectories.push(directory)
  const filePath = join(directory, 'netsuite-refresh-token.bin')
  const legacySettingsFilePath = join(directory, 'secure-oauth.json')
  return {
    directory,
    filePath,
    legacySettingsFilePath,
    store: new SafeStorageRefreshTokenStore({ filePath, legacySettingsFilePath, encryption })
  }
}

afterEach(async () => {
  await Promise.all(
    testDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('SafeStorageRefreshTokenStore', () => {
  it('persists only binary ciphertext and consumes a token exactly once', async () => {
    const { filePath, store } = await createStore()
    const refreshToken = 'refresh-token-that-must-never-be-plaintext'

    await store.setRefreshToken(refreshToken)
    const persisted = await readFile(filePath)

    expect(persisted.includes(Buffer.from(refreshToken))).toBe(false)
    expect(() => JSON.parse(persisted.toString('utf8'))).toThrow()
    expect(await store.hasRefreshToken()).toBe(true)
    expect(await store.takeRefreshToken()).toBe(refreshToken)
    expect(await store.takeRefreshToken()).toBeUndefined()
    expect(await store.hasRefreshToken()).toBe(false)
  })

  it('atomically replaces old ciphertext with the newest refresh token', async () => {
    const { store } = await createStore()

    await store.setRefreshToken('old-one-time-token')
    await store.setRefreshToken('new-rotated-token')

    expect(await store.takeRefreshToken()).toBe('new-rotated-token')
    expect(await store.takeRefreshToken()).toBeUndefined()
  })

  it('deletes the previous JSON settings store without migrating its contents', async () => {
    const { legacySettingsFilePath, store } = await createStore()
    await writeFile(
      legacySettingsFilePath,
      JSON.stringify({ refreshTokenCiphertext: 'obsolete-ciphertext' })
    )

    expect(await store.hasRefreshToken()).toBe(false)
    await expect(stat(legacySettingsFilePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses to persist a token when Windows credential encryption is unavailable', async () => {
    const { store } = await createStore({
      isEncryptionAvailable: () => false,
      encryptString: () => Buffer.alloc(0),
      decryptString: () => ''
    })

    await expect(store.setRefreshToken('must-not-be-written')).rejects.toThrow(
      'Secure Windows credential encryption is unavailable'
    )
    expect(await store.hasRefreshToken()).toBe(false)
  })

  it('rejects corrupt ciphertext instead of returning token material', async () => {
    const { filePath, store } = await createStore()
    await writeFile(filePath, Buffer.from('not-valid-ciphertext'))

    await expect(store.hasRefreshToken()).rejects.toThrow(
      'The saved NetSuite sign-in could not be decrypted'
    )
  })

  it('isolates encrypted refresh tokens by NetSuite account namespace', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hauser-token-namespace-test-'))
    testDirectories.push(directory)
    const sandbox = new SafeStorageRefreshTokenStore({
      userDataDirectory: directory,
      tokenNamespace: '3850367_SB1',
      encryption: fakeWindowsEncryption
    })
    const production = new SafeStorageRefreshTokenStore({
      userDataDirectory: directory,
      tokenNamespace: '3850367',
      encryption: fakeWindowsEncryption
    })

    await sandbox.setRefreshToken('sandbox-refresh-token')
    await production.setRefreshToken('production-refresh-token')

    expect(await readFile(join(directory, 'netsuite-refresh-token-3850367_sb1.bin'))).toBeTruthy()
    expect(await readFile(join(directory, 'netsuite-refresh-token-3850367.bin'))).toBeTruthy()
    expect(await sandbox.takeRefreshToken()).toBe('sandbox-refresh-token')
    expect(await production.takeRefreshToken()).toBe('production-refresh-token')
  })

  it('migrates the existing generic sandbox token only into the sandbox namespace', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hauser-token-migration-test-'))
    testDirectories.push(directory)
    const legacyFilePath = join(directory, 'netsuite-refresh-token.bin')
    await writeFile(legacyFilePath, fakeWindowsEncryption.encryptString('existing-sandbox-token'))
    const sandbox = new SafeStorageRefreshTokenStore({
      userDataDirectory: directory,
      tokenNamespace: '3850367_SB1',
      migrateLegacyGenericToken: true,
      encryption: fakeWindowsEncryption
    })
    const production = new SafeStorageRefreshTokenStore({
      userDataDirectory: directory,
      tokenNamespace: '3850367',
      encryption: fakeWindowsEncryption
    })

    expect(await production.hasRefreshToken()).toBe(false)
    expect(await sandbox.takeRefreshToken()).toBe('existing-sandbox-token')
    await expect(stat(legacyFilePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
