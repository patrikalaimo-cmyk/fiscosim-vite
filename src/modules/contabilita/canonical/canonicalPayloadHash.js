const TRANSIENT_KEYS = new Set([
  'createdAt',
  'updatedAt',
  'processedAt',
  'receivedAt',
  'generatedAt',
  'computedAt',
  'normalizedAt',
  'timestamp',
  'ts',
  'requestId',
  'correlationId',
  'traceId',
  'spanId',
  'sessionId',
  'nonce',
  'uiState',
  'debug',
  'tempId',
  'temporaryId',
  'payloadHash',
  'canonicalHash',
])

const ORDERED_ARRAY_KEYS = new Set([
  'primaNotaRighe',
  'righe',
  'registriIva',
  'registri_iva',
  'partitario',
  'partitarioMovements',
  'cashVatMovements',
  'withholdingMovements',
])

const UNORDERED_ITEM_KEYS = ['id', 'rigaId', 'contoId', 'partitaId', 'documentId', 'movementId']

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function shouldOmitKey(key) {
  return key.startsWith('__') || TRANSIENT_KEYS.has(key)
}

function isNumericFieldKey(key) {
  const normalizedKey = String(key || '').toLowerCase()
  return /(?:amount|debit|credit|dare|avere|importo|saldo|totale|imponibile|imposta|aliquota|percentuale|rate|taxable|tax|vat|iva|gross|net|netpayable|payable|withholding|socialsecurity|stampduty|rounding|excluded|difference|residuo|balance|quantity|quantita|qty)$/.test(normalizedKey)
}

function parseSafeNumber(value) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, '')
  if (!normalized) return null

  if (/^[+-]?\d+$/.test(normalized)) {
    return Number(normalized)
  }

  if (/^[+-]?\d+[.,]\d{1,2}$/.test(normalized)) {
    return Number(normalized.replace(',', '.'))
  }

  if (/^[+-]?\d{1,3}(?:[.,]\d{3})+[.,]\d{1,2}$/.test(normalized)) {
    const decimalSeparator = normalized.lastIndexOf(',') > normalized.lastIndexOf('.') ? ',' : '.'
    const integerPart = normalized.slice(0, normalized.lastIndexOf(decimalSeparator)).replace(/[.,]/g, '')
    const decimalPart = normalized.slice(normalized.lastIndexOf(decimalSeparator) + 1)
    if (!/^\d{1,2}$/.test(decimalPart)) return null
    return Number(`${integerPart}.${decimalPart}`)
  }

  return null
}

function normalizeScalar(value, path) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : ''
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return ''

    const key = path[path.length - 1] || ''
    if (isNumericFieldKey(key)) {
      const parsed = parseSafeNumber(trimmed)
      if (parsed !== null) return parsed
    }

    return trimmed
  }

  if (isFiniteNumber(value)) {
    return value
  }

  if (typeof value === 'bigint') {
    return Number(value)
  }

  if (typeof value === 'boolean' || value === null) {
    return value
  }

  return value
}

function getArrayKey(path) {
  return path[path.length - 1] || ''
}

function isOrderedArray(path, value) {
  const key = getArrayKey(path)
  return ORDERED_ARRAY_KEYS.has(key) || key === 'rows' || value?.__canonicalOrder === 'ordered'
}

function isExplicitlyUnorderedArray(value) {
  return Array.isArray(value) && (value.__unordered === true || value.__canonicalOrder === 'unordered')
}

function buildUnorderedArraySortKey(item) {
  if (isPlainObject(item)) {
    for (const key of UNORDERED_ITEM_KEYS) {
      const candidate = item[key]
      if (candidate !== undefined && candidate !== null && String(candidate).trim() !== '') {
        return `${key}:${String(candidate)}`
      }
    }
  }

  return JSON.stringify(item)
}

function normalizeValue(value, path = []) {
  if (value === undefined) {
    return undefined
  }

  if (Array.isArray(value)) {
    const normalizedItems = value
      .map((item, index) => normalizeValue(item, path.concat(String(index))))
      .filter((item) => item !== undefined)

    if (isExplicitlyUnorderedArray(value) && !isOrderedArray(path, value)) {
      return normalizedItems
        .map((item, index) => ({ item, index, sortKey: buildUnorderedArraySortKey(item) }))
        .sort((left, right) => {
          if (left.sortKey < right.sortKey) return -1
          if (left.sortKey > right.sortKey) return 1
          return left.index - right.index
        })
        .map((entry) => entry.item)
    }

    return normalizedItems
  }

  if (isPlainObject(value)) {
    const normalizedObject = {}
    for (const key of Object.keys(value).sort()) {
      if (shouldOmitKey(key)) {
        continue
      }

      const normalized = normalizeValue(value[key], path.concat(key))
      if (normalized !== undefined) {
        normalizedObject[key] = normalized
      }
    }
    return normalizedObject
  }

  return normalizeScalar(value, path)
}

function rotateRight(value, bits) {
  return (value >>> bits) | (value << (32 - bits))
}

function toUtf8Bytes(input) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(input)
  }

  const bytes = []
  for (let index = 0; index < input.length; index += 1) {
    let codePoint = input.charCodeAt(index)

    if (codePoint < 0x80) {
      bytes.push(codePoint)
      continue
    }

    if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6))
      bytes.push(0x80 | (codePoint & 0x3f))
      continue
    }

    if (codePoint >= 0xd800 && codePoint <= 0xdbff && index + 1 < input.length) {
      const nextCodePoint = input.charCodeAt(index + 1)
      if (nextCodePoint >= 0xdc00 && nextCodePoint <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (nextCodePoint - 0xdc00)
        index += 1
      }
    }

    if (codePoint < 0x10000) {
      bytes.push(0xe0 | (codePoint >> 12))
      bytes.push(0x80 | ((codePoint >> 6) & 0x3f))
      bytes.push(0x80 | (codePoint & 0x3f))
      continue
    }

    bytes.push(0xf0 | (codePoint >> 18))
    bytes.push(0x80 | ((codePoint >> 12) & 0x3f))
    bytes.push(0x80 | ((codePoint >> 6) & 0x3f))
    bytes.push(0x80 | (codePoint & 0x3f))
  }

  return Uint8Array.from(bytes)
}

function bytesToHex(bytes) {
  let hex = ''
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

function sha256Hex(input) {
  const bytes = toUtf8Bytes(String(input))
  const length = bytes.length
  const bitLength = length * 8
  const paddedLength = ((((length + 9) + 63) >> 6) << 6)
  const buffer = new Uint8Array(paddedLength)
  buffer.set(bytes)
  buffer[length] = 0x80

  const view = new DataView(buffer.buffer)
  view.setUint32(buffer.length - 4, bitLength >>> 0, false)

  const hash = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ])

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]

  const w = new Uint32Array(64)

  for (let offset = 0; offset < buffer.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      w[index] = view.getUint32(offset + index * 4, false)
    }

    for (let index = 16; index < 64; index += 1) {
      const sigma0 = rotateRight(w[index - 15], 7) ^ rotateRight(w[index - 15], 18) ^ (w[index - 15] >>> 3)
      const sigma1 = rotateRight(w[index - 2], 17) ^ rotateRight(w[index - 2], 19) ^ (w[index - 2] >>> 10)
      w[index] = (w[index - 16] + sigma0 + w[index - 7] + sigma1) >>> 0
    }

    let a = hash[0]
    let b = hash[1]
    let c = hash[2]
    let d = hash[3]
    let e = hash[4]
    let f = hash[5]
    let g = hash[6]
    let h = hash[7]

    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + sum1 + ch + k[index] + w[index]) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (sum0 + maj) >>> 0

      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    hash[0] = (hash[0] + a) >>> 0
    hash[1] = (hash[1] + b) >>> 0
    hash[2] = (hash[2] + c) >>> 0
    hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0
    hash[5] = (hash[5] + f) >>> 0
    hash[6] = (hash[6] + g) >>> 0
    hash[7] = (hash[7] + h) >>> 0
  }

  const result = new Uint8Array(32)
  for (let index = 0; index < hash.length; index += 1) {
    result[index * 4] = (hash[index] >>> 24) & 0xff
    result[index * 4 + 1] = (hash[index] >>> 16) & 0xff
    result[index * 4 + 2] = (hash[index] >>> 8) & 0xff
    result[index * 4 + 3] = hash[index] & 0xff
  }

  return bytesToHex(result)
}

export function normalizeCanonicalPayloadForHash(payload) {
  return normalizeValue(payload, [])
}

export function buildCanonicalPayloadHash(payload) {
  const normalizedPayload = normalizeCanonicalPayloadForHash(payload)

  try {
    return sha256Hex(JSON.stringify(normalizedPayload))
  } catch (error) {
    throw new Error(`Unable to compute canonical payload hash: ${error?.message || String(error)}`)
  }
}
