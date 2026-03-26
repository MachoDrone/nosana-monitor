/**
 * Web Push Encryption Module for Cloudflare Workers
 *
 * Implements RFC 8291 (Message Encryption for Web Push) and RFC 8292 (VAPID)
 * using ONLY the Web Crypto API available in Cloudflare Workers.
 *
 * No Node.js crypto, no npm packages — fully self-contained.
 *
 * Exports:
 *   - generateVapidKeys()
 *   - sendPushNotification(subscription, payload, vapidKeys)
 */

// ---------------------------------------------------------------------------
// Base64url helpers
// ---------------------------------------------------------------------------

/**
 * Encode a Uint8Array (or ArrayBuffer) to a base64url string (no padding).
 */
function base64urlEncode(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decode a base64url string to a Uint8Array.
 * Handles missing padding automatically.
 */
function base64urlDecode(str) {
  // Restore standard base64 characters and padding
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad === 2) base64 += '==';
  else if (pad === 3) base64 += '=';

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

/**
 * Concatenate multiple Uint8Arrays into one.
 */
function concat(...arrays) {
  const totalLength = arrays.reduce((acc, a) => acc + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Encode a 16-bit unsigned integer as 2 bytes big-endian.
 */
function uint16be(value) {
  return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
}

/**
 * Encode a 32-bit unsigned integer as 4 bytes big-endian.
 */
function uint32be(value) {
  return new Uint8Array([
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ]);
}

// ---------------------------------------------------------------------------
// HKDF (RFC 5869) using Web Crypto
// ---------------------------------------------------------------------------

/**
 * HKDF-Extract: PRK = HMAC-SHA-256(salt, IKM)
 */
async function hkdfExtract(salt, ikm) {
  const key = await crypto.subtle.importKey(
    'raw',
    salt.length ? salt : new Uint8Array(32), // RFC 5869: if salt not provided, use zeros
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const prk = await crypto.subtle.sign('HMAC', key, ikm);
  return new Uint8Array(prk);
}

/**
 * HKDF-Expand: OKM = T(1) || T(2) || ... truncated to length bytes
 * where T(i) = HMAC-SHA-256(PRK, T(i-1) || info || i)
 */
async function hkdfExpand(prk, info, length) {
  const key = await crypto.subtle.importKey(
    'raw',
    prk,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // For Web Push we only ever need <= 32 bytes, so one iteration suffices.
  // But implement the full loop for correctness.
  const hashLen = 32; // SHA-256 output
  const n = Math.ceil(length / hashLen);
  const okm = new Uint8Array(n * hashLen);
  let prev = new Uint8Array(0);

  for (let i = 1; i <= n; i++) {
    const input = concat(prev, info, new Uint8Array([i]));
    const signed = await crypto.subtle.sign('HMAC', key, input);
    prev = new Uint8Array(signed);
    okm.set(prev, (i - 1) * hashLen);
  }

  return okm.slice(0, length);
}

/**
 * Full HKDF: extract then expand.
 */
async function hkdf(salt, ikm, info, length) {
  const prk = await hkdfExtract(salt, ikm);
  return hkdfExpand(prk, info, length);
}

// ---------------------------------------------------------------------------
// VAPID Key Generation
// ---------------------------------------------------------------------------

/**
 * Generate a VAPID key pair (ECDSA P-256).
 *
 * Returns { publicKey, privateKey } as base64url-encoded strings.
 * - publicKey:  65 bytes uncompressed EC point (0x04 || x || y)
 * - privateKey: 32 bytes raw scalar
 */
export async function generateVapidKeys() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true, // extractable
    ['sign']
  );

  // Export public key as raw uncompressed point (65 bytes)
  const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);

  // Export private key as JWK to extract the 'd' parameter (raw scalar)
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

  return {
    publicKey: base64urlEncode(new Uint8Array(publicKeyRaw)),
    privateKey: privateJwk.d, // already base64url from JWK
  };
}

// ---------------------------------------------------------------------------
// JWT / VAPID Token
// ---------------------------------------------------------------------------

/**
 * Create a signed VAPID JWT (ES256 = ECDSA P-256 + SHA-256).
 *
 * @param {string} audience  - The push service origin (e.g. "https://fcm.googleapis.com")
 * @param {string} subject   - Contact URI (e.g. "mailto:admin@example.com")
 * @param {number} expiry    - Token lifetime in seconds (max 24h)
 * @param {string} privateKeyB64url - Base64url-encoded 32-byte private key scalar
 * @param {string} publicKeyB64url  - Base64url-encoded 65-byte public key
 * @returns {Promise<string>} The signed JWT string
 */
async function createVapidJwt(audience, subject, expiry, privateKeyB64url, publicKeyB64url) {
  const now = Math.floor(Date.now() / 1000);

  // JWT header
  const header = { typ: 'JWT', alg: 'ES256' };

  // JWT payload (claims)
  const payload = {
    aud: audience,
    exp: now + expiry,
    sub: subject,
  };

  const headerB64 = base64urlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(encoder.encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import the private key for signing.
  // We reconstruct a JWK from the raw private key scalar and public key.
  const publicKeyBytes = base64urlDecode(publicKeyB64url);
  // The public key is 65 bytes: 0x04 || x (32 bytes) || y (32 bytes)
  const x = base64urlEncode(publicKeyBytes.slice(1, 33));
  const y = base64urlEncode(publicKeyBytes.slice(33, 65));

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: x,
    y: y,
    d: privateKeyB64url,
  };

  const signingKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Sign with ECDSA + SHA-256
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    encoder.encode(unsignedToken)
  );

  // Web Crypto returns the signature in IEEE P1363 format (r || s, each 32 bytes),
  // which is exactly what JWT ES256 expects. No DER conversion needed.
  const signatureB64 = base64urlEncode(new Uint8Array(signature));

  return `${unsignedToken}.${signatureB64}`;
}

// ---------------------------------------------------------------------------
// RFC 8291 — Message Encryption for Web Push (aes128gcm)
// ---------------------------------------------------------------------------

/**
 * Build the "info" parameter for HKDF as specified in RFC 8291 Section 3.4.
 *
 * info = "WebPush: info\0" || ua_public (65 bytes) || as_public (65 bytes)
 *
 * @param {Uint8Array} clientPublicKey  - The subscriber's p256dh key (65 bytes)
 * @param {Uint8Array} serverPublicKey  - Our ephemeral ECDH public key (65 bytes)
 * @returns {Uint8Array}
 */
function buildInfo(clientPublicKey, serverPublicKey) {
  return concat(
    encoder.encode('WebPush: info\0'),
    clientPublicKey,
    serverPublicKey
  );
}

/**
 * Build a content-encryption key info string per RFC 8188.
 *
 * "Content-Encoding: <type>\0"
 */
function buildCEKInfo(type) {
  return encoder.encode(`Content-Encoding: ${type}\0`);
}

/**
 * Encrypt a payload for Web Push (RFC 8291 + RFC 8188 aes128gcm).
 *
 * Steps:
 *   1. Generate an ephemeral ECDH key pair (P-256)
 *   2. Perform ECDH with the subscriber's p256dh public key to get shared secret
 *   3. Derive IKM using HKDF(auth_secret, shared_secret, info)
 *   4. Generate a 16-byte salt
 *   5. Derive the content encryption key (CEK) and nonce via HKDF(salt, IKM, ...)
 *   6. Pad the plaintext (add 0x02 delimiter for final record)
 *   7. Encrypt with AES-128-GCM
 *   8. Assemble the aes128gcm header + ciphertext
 *
 * @param {Uint8Array} clientPublicKeyBytes - Subscriber's p256dh key (65 bytes)
 * @param {Uint8Array} authSecretBytes      - Subscriber's auth secret (16 bytes)
 * @param {Uint8Array} payloadBytes         - The plaintext to encrypt
 * @returns {Promise<{ body: Uint8Array, serverPublicKeyBytes: Uint8Array }>}
 */
async function encryptPayload(clientPublicKeyBytes, authSecretBytes, payloadBytes) {
  // --- Step 1: Generate ephemeral ECDH key pair ---
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  const serverPublicKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeyPair.publicKey)
  );

  // --- Step 2: Import subscriber's public key and derive shared secret ---
  const clientPublicKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // ECDH: shared_secret = ECDH(server_private, client_public)
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPublicKey },
    serverKeyPair.privateKey,
    256 // 32 bytes
  );
  const sharedSecret = new Uint8Array(sharedSecretBits);

  // --- Step 3: Derive IKM (Input Keying Material) ---
  // RFC 8291 Section 3.4:
  //   IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info\0" || ua_public || as_public, 32)
  const ikm = await hkdf(
    authSecretBytes,
    sharedSecret,
    buildInfo(clientPublicKeyBytes, serverPublicKeyBytes),
    32
  );

  // --- Step 4: Generate random 16-byte salt ---
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // --- Step 5: Derive CEK (16 bytes) and nonce (12 bytes) ---
  // RFC 8291 Section 3.3 / RFC 8188:
  //   CEK = HKDF(salt, IKM, "Content-Encoding: aes128gcm\0", 16)
  //   nonce = HKDF(salt, IKM, "Content-Encoding: nonce\0", 12)
  const cek = await hkdf(salt, ikm, buildCEKInfo('aes128gcm'), 16);
  const nonce = await hkdf(salt, ikm, buildCEKInfo('nonce'), 12);

  // --- Step 6: Pad plaintext ---
  // RFC 8291: final record has a 0x02 delimiter byte, then optional zero padding.
  // Minimum padding: just the delimiter byte.
  const paddedPayload = concat(payloadBytes, new Uint8Array([2]));

  // --- Step 7: Encrypt with AES-128-GCM ---
  const contentKey = await crypto.subtle.importKey(
    'raw',
    cek,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      contentKey,
      paddedPayload
    )
  );

  // --- Step 8: Assemble aes128gcm header ---
  // RFC 8188 Section 2.1:
  //   header = salt (16) || rs (4, big-endian uint32) || idlen (1) || keyid (idlen bytes)
  //
  // For Web Push:
  //   keyid = server's ECDH public key (65 bytes)
  //   rs = record size (must be >= plaintext + padding + 16 for tag)
  //        Using 4096 as a standard record size.
  const rs = 4096;
  const idlen = serverPublicKeyBytes.length; // 65

  const header = concat(
    salt,                             // 16 bytes
    uint32be(rs),                     // 4 bytes
    new Uint8Array([idlen]),          // 1 byte
    serverPublicKeyBytes              // 65 bytes
  );
  // Total header: 86 bytes

  const body = concat(header, ciphertext);

  return { body, serverPublicKeyBytes };
}

// ---------------------------------------------------------------------------
// Send Push Notification
// ---------------------------------------------------------------------------

/**
 * Send a Web Push notification to a subscriber.
 *
 * @param {Object} subscription - Standard PushSubscription:
 *   { endpoint: string, keys: { p256dh: string, auth: string } }
 * @param {string} payload    - The notification payload (JSON string)
 * @param {Object} vapidKeys  - { publicKey: string, privateKey: string } (base64url)
 * @param {string} [subject]  - VAPID contact (default: "mailto:noreply@example.com")
 * @returns {Promise<Response>} The fetch Response from the push service
 */
export async function sendPushNotification(subscription, payload, vapidKeys, subject = 'mailto:noreply@example.com') {
  const { endpoint, keys } = subscription;

  // Decode subscriber keys
  const clientPublicKey = base64urlDecode(keys.p256dh);
  const authSecret = base64urlDecode(keys.auth);

  // Encode the payload
  const payloadBytes = encoder.encode(payload);

  // --- Encrypt the payload (RFC 8291) ---
  const { body: encryptedBody } = await encryptPayload(
    clientPublicKey,
    authSecret,
    payloadBytes
  );

  // --- Build VAPID Authorization header (RFC 8292) ---
  // Extract the push service origin for the JWT audience claim
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;

  // Sign the VAPID JWT (24-hour expiry, clamped to spec max)
  const jwt = await createVapidJwt(
    audience,
    subject,
    12 * 60 * 60, // 12 hours
    vapidKeys.privateKey,
    vapidKeys.publicKey
  );

  // The uncompressed public key for the Crypto-Key / Authorization header
  const vapidPublicKeyB64 = vapidKeys.publicKey;

  // --- Send to push service ---
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Content-Length': String(encryptedBody.length),
      // RFC 8292: VAPID uses the "vapid" auth scheme
      'Authorization': `vapid t=${jwt}, k=${vapidPublicKeyB64}`,
      'TTL': '86400', // 24 hours; adjust as needed
      'Urgency': 'high',
    },
    body: encryptedBody,
  });

  return response;
}
