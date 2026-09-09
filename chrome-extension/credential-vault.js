/* global chrome */
// This file runs only in extension-owned contexts, never in website scripts.
globalThis.ShoppingdayCredentialVault = (() => {
  const localKey = "supplier-vault-v1";
  const sessionKey = "supplier-vault-session-key";
  const encode = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const decode = (text) =>
    Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  async function derive(passphrase, salt) {
    if (
      typeof passphrase !== "string" ||
      passphrase.length < 12 ||
      passphrase.length > 256
    )
      throw new Error("보관함 암호는 12~256자로 입력해 주세요.");
    const material = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
  }
  async function read(key, record) {
    try {
      const data = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: decode(record.iv) },
        key,
        decode(record.ciphertext),
      );
      return JSON.parse(new TextDecoder().decode(data));
    } catch {
      throw new Error(
        "보관함 암호가 맞지 않거나 저장 정보를 읽을 수 없습니다.",
      );
    }
  }
  async function unlockedKey() {
    const value = (await chrome.storage.session.get(sessionKey))[sessionKey];
    if (!value) throw new Error("PC 로그인 보관함을 먼저 잠금 해제해 주세요.");
    return crypto.subtle.importKey("raw", decode(value), "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  }
  async function unlock(passphrase) {
    await chrome.storage.session.setAccessLevel({
      accessLevel: "TRUSTED_CONTEXTS",
    });
    await chrome.storage.local.setAccessLevel({
      accessLevel: "TRUSTED_CONTEXTS",
    });
    let record = (await chrome.storage.local.get(localKey))[localKey];
    const salt = record
      ? decode(record.salt)
      : crypto.getRandomValues(new Uint8Array(16));
    const key = await derive(passphrase, salt);
    if (record) await read(key, record);
    else {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      record = {
        salt: encode(salt),
        iv: encode(iv),
        ciphertext: encode(
          await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            key,
            new TextEncoder().encode("{}"),
          ),
        ),
      };
      await chrome.storage.local.set({ [localKey]: record });
    }
    await chrome.storage.session.set({
      [sessionKey]: encode(await crypto.subtle.exportKey("raw", key)),
    });
  }
  async function credentials(provider) {
    if (!["zicgam", "ebulsamchon"].includes(provider))
      throw new Error("지원하지 않는 도매처입니다.");
    const record = (await chrome.storage.local.get(localKey))[localKey];
    if (!record) return null;
    return (await read(await unlockedKey(), record))[provider] ?? null;
  }
  async function save(provider, username, password) {
    if (!["zicgam", "ebulsamchon"].includes(provider))
      throw new Error("지원하지 않는 도매처입니다.");
    if (
      !username?.trim() ||
      username.length > 200 ||
      !password ||
      password.length > 256
    )
      throw new Error("아이디와 비밀번호를 확인해 주세요.");
    const record = (await chrome.storage.local.get(localKey))[localKey];
    const key = await unlockedKey();
    const values = await read(key, record);
    values[provider] = { username: username.trim(), password };
    const iv = crypto.getRandomValues(new Uint8Array(12));
    await chrome.storage.local.set({
      [localKey]: {
        salt: record.salt,
        iv: encode(iv),
        ciphertext: encode(
          await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            key,
            new TextEncoder().encode(JSON.stringify(values)),
          ),
        ),
      },
    });
  }
  async function status() {
    try {
      const record = (await chrome.storage.local.get(localKey))[localKey];
      if (!record)
        return { initialized: false, unlocked: false, providers: [] };
      const values = await read(await unlockedKey(), record);
      return {
        initialized: true,
        unlocked: true,
        providers: Object.keys(values),
      };
    } catch {
      return { initialized: true, unlocked: false, providers: [] };
    }
  }
  return {
    unlock,
    credentials,
    save,
    status,
    lock: () => chrome.storage.session.remove(sessionKey),
    clear: async () => {
      await chrome.storage.session.remove(sessionKey);
      await chrome.storage.local.remove(localKey);
    },
  };
})();
