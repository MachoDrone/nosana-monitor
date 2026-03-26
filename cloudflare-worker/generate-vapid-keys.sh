#!/bin/bash
# Generate VAPID keys for Web Push notifications
# Uses Node.js crypto module to create ECDSA P-256 key pair

set -euo pipefail

echo "Generating VAPID ECDSA P-256 key pair..."
echo

node -e '
const crypto = require("crypto");
const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });

const rawPub = publicKey.export({ type: "spki", format: "der" });
// SPKI header for P-256 is 26 bytes; raw uncompressed key is last 65 bytes
const pubBytes = rawPub.slice(-65);
const pubB64 = Buffer.from(pubBytes).toString("base64url");

const rawPriv = privateKey.export({ type: "pkcs8", format: "der" });
// PKCS8 wrapper for P-256: the 32-byte scalar starts at offset 36
const privBytes = rawPriv.slice(36, 68);
const privB64 = Buffer.from(privBytes).toString("base64url");

console.log("VAPID Public Key (base64url):");
console.log(pubB64);
console.log();
console.log("VAPID Private Key (base64url):");
console.log(privB64);
console.log();
console.log("--- Set as Cloudflare Worker secrets ---");
console.log();
console.log(`echo "${pubB64}" | wrangler secret put VAPID_PUBLIC_KEY`);
console.log(`echo "${privB64}" | wrangler secret put VAPID_PRIVATE_KEY`);
console.log();
console.log("--- applicationServerKey for browser (base64url, no padding) ---");
console.log();
console.log(pubB64);
'
