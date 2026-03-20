#!/usr/bin/env python3
import json
import sys

ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def base58_encode(data):
    num = int.from_bytes(data, "big")
    result = []
    while num > 0:
        num, rem = divmod(num, 58)
        result.append(ALPHABET[rem])
    for byte in data:
        if byte == 0:
            result.append(ALPHABET[0])
        else:
            break
    return "".join(reversed(result))


def main():
    keypair_path = sys.argv[1] if len(sys.argv) > 1 else "/root/.nosana/nosana_key.json"
    try:
        with open(keypair_path) as f:
            keypair = json.load(f)
    except FileNotFoundError:
        print(f"ERROR: Keypair file not found: {keypair_path}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"ERROR: Invalid JSON in keypair file: {keypair_path}", file=sys.stderr)
        sys.exit(1)

    if len(keypair) != 64:
        print(f"ERROR: Expected 64-byte keypair, got {len(keypair)} bytes", file=sys.stderr)
        sys.exit(1)

    pubkey_bytes = bytes(keypair[32:])
    print(base58_encode(pubkey_bytes))


if __name__ == "__main__":
    main()
