// AES-256-GCM in plain JavaScript, for the web demo only.
//
// The program seals its yearly archive with Node's AES-256-GCM. The browser has
// AES-GCM too, but only as a promise, and the program encrypts synchronously —
// so the demo needs the cipher itself. It is the real algorithm, not a stand-in:
// `tests/demo-cipher.test.ts` encrypts with this and decrypts with Node, and
// the other way round, so a sealed archive made in the demo is a sealed archive.
import { Buffer } from 'buffer';

/* ---- AES block cipher ---- */

const SBOX = new Uint8Array(256);
const INV = new Uint8Array(256);
(() => {
    let p = 1;
    let q = 1;
    do {
        p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
        q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff;
        if (q & 0x80) q ^= 0x09;
        const value = q ^ ((q << 1) | (q >>> 7)) ^ ((q << 2) | (q >>> 6)) ^ ((q << 3) | (q >>> 5)) ^ ((q << 4) | (q >>> 4));
        SBOX[p] = (value ^ 0x63) & 0xff;
    } while (p !== 1);
    SBOX[0] = 0x63;
    for (let i = 0; i < 256; i++) INV[SBOX[i]] = i;
})();

const xtime = (a) => ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
const mul = (a, b) => {
    let out = 0;
    for (let i = 0; i < 8; i++) {
        if (b & 1) out ^= a;
        b >>>= 1;
        a = xtime(a);
    }
    return out & 0xff;
};

/** Round keys for a 256-bit key (14 rounds, 60 words). */
function expandKey(key) {
    const words = 60;
    const w = new Uint8Array(words * 4);
    w.set(key.subarray(0, 32));
    let rcon = 1;
    for (let i = 8; i < words; i++) {
        const prev = (i - 1) * 4;
        let t = [w[prev], w[prev + 1], w[prev + 2], w[prev + 3]];
        if (i % 8 === 0) {
            t = [SBOX[t[1]] ^ rcon, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]];
            rcon = xtime(rcon);
        } else if (i % 8 === 4) {
            t = t.map((b) => SBOX[b]);
        }
        const back = (i - 8) * 4;
        for (let j = 0; j < 4; j++) w[i * 4 + j] = w[back + j] ^ t[j];
    }
    return w;
}

/** One AES block, encrypted in place-free fashion (16 bytes in, 16 out). */
function encryptBlock(roundKeys, input) {
    const s = new Uint8Array(input);
    for (let i = 0; i < 16; i++) s[i] ^= roundKeys[i];
    for (let round = 1; round <= 14; round++) {
        for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];
        /* ShiftRows, on the column-major state AES uses. */
        const t = Uint8Array.from(s);
        for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) s[c * 4 + r] = t[((c + r) % 4) * 4 + r];
        if (round < 14) {
            for (let c = 0; c < 4; c++) {
                const o = c * 4;
                const [a0, a1, a2, a3] = [s[o], s[o + 1], s[o + 2], s[o + 3]];
                s[o] = mul(a0, 2) ^ mul(a1, 3) ^ a2 ^ a3;
                s[o + 1] = a0 ^ mul(a1, 2) ^ mul(a2, 3) ^ a3;
                s[o + 2] = a0 ^ a1 ^ mul(a2, 2) ^ mul(a3, 3);
                s[o + 3] = mul(a0, 3) ^ a1 ^ a2 ^ mul(a3, 2);
            }
        }
        for (let i = 0; i < 16; i++) s[i] ^= roundKeys[round * 16 + i];
    }
    return s;
}

/* ---- GCM ---- */

/** Multiplication in GF(2^128), the field GHASH is built on. */
function gmul(x, y) {
    const z = new Uint8Array(16);
    const v = Uint8Array.from(y);
    for (let i = 0; i < 128; i++) {
        if ((x[i >>> 3] >>> (7 - (i & 7))) & 1) for (let j = 0; j < 16; j++) z[j] ^= v[j];
        const lsb = v[15] & 1;
        for (let j = 15; j > 0; j--) v[j] = ((v[j] >>> 1) | ((v[j - 1] & 1) << 7)) & 0xff;
        v[0] >>>= 1;
        if (lsb) v[0] ^= 0xe1;
    }
    return z;
}

const ghash = (h, data) => {
    let y = new Uint8Array(16);
    for (let o = 0; o < data.length; o += 16) {
        const block = new Uint8Array(16);
        block.set(data.subarray(o, Math.min(o + 16, data.length)));
        for (let j = 0; j < 16; j++) block[j] ^= y[j];
        y = gmul(block, h);
    }
    return y;
};

const counterOf = (iv) => {
    const c = new Uint8Array(16);
    c.set(iv.subarray(0, 12));
    c[15] = 1;
    return c;
};

const bump = (c) => {
    for (let i = 15; i >= 12; i--) if (++c[i] !== 256) break; else c[i] = 0;
};

function keystreamXor(roundKeys, counter, data) {
    const out = new Uint8Array(data.length);
    const c = Uint8Array.from(counter);
    for (let o = 0; o < data.length; o += 16) {
        bump(c);
        const block = encryptBlock(roundKeys, c);
        const end = Math.min(o + 16, data.length);
        for (let i = o; i < end; i++) out[i] = data[i] ^ block[i - o];
    }
    return out;
}

function tagOf(roundKeys, counter, cipherBytes) {
    const h = encryptBlock(roundKeys, new Uint8Array(16));
    const lengths = new Uint8Array(16);
    /* No additional data; the body's length in bits goes in the last 8 bytes. */
    new DataView(lengths.buffer).setUint32(12, (cipherBytes.length * 8) >>> 0);
    new DataView(lengths.buffer).setUint32(8, Math.floor((cipherBytes.length * 8) / 0x100000000));
    const padded = new Uint8Array(Math.ceil(cipherBytes.length / 16) * 16);
    padded.set(cipherBytes);
    const s = ghash(h, new Uint8Array([...padded, ...lengths]));
    const first = encryptBlock(roundKeys, counter);
    const tag = new Uint8Array(16);
    for (let i = 0; i < 16; i++) tag[i] = s[i] ^ first[i];
    return tag;
}

const bytes = (value) => (Buffer.isBuffer(value) ? value : value instanceof Uint8Array ? Buffer.from(value) : Buffer.from(String(value), 'utf8'));

/** Node's `createCipheriv('aes-256-gcm', key, iv)`, as much as the program uses. */
export function createCipher(key, iv) {
    const roundKeys = expandKey(bytes(key));
    const counter = counterOf(bytes(iv));
    const parts = [];
    let tag = null;
    return {
        update(data) {
            const chunk = keystreamXor(roundKeys, advance(counter, total(parts)), bytes(data));
            parts.push(Buffer.from(chunk));
            return Buffer.from(chunk);
        },
        final() {
            tag = tagOf(roundKeys, counter, Buffer.concat(parts));
            return Buffer.alloc(0);
        },
        getAuthTag() {
            if (!tag) throw new Error('getAuthTag called before final');
            return Buffer.from(tag);
        },
        setAAD() { throw new Error('additional data is not used by this program'); },
    };
}

/** Node's `createDecipheriv('aes-256-gcm', key, iv)`, as much as the program uses. */
export function createDecipher(key, iv) {
    const roundKeys = expandKey(bytes(key));
    const counter = counterOf(bytes(iv));
    const parts = [];
    let expected = null;
    return {
        setAuthTag(value) { expected = bytes(value); return this; },
        update(data) {
            const chunk = bytes(data);
            const plain = keystreamXor(roundKeys, advance(counter, total(parts)), chunk);
            parts.push(Buffer.from(chunk));
            return Buffer.from(plain);
        },
        final() {
            const tag = tagOf(roundKeys, counter, Buffer.concat(parts));
            if (!expected || expected.length !== 16) throw new Error('Unsupported state or unable to authenticate data');
            let diff = 0;
            for (let i = 0; i < 16; i++) diff |= tag[i] ^ expected[i];
            if (diff !== 0) throw new Error('Unsupported state or unable to authenticate data');
            return Buffer.alloc(0);
        },
        setAAD() { throw new Error('additional data is not used by this program'); },
    };
}

/* The counter has to carry on across calls to update(). */
const total = (parts) => parts.reduce((n, p) => n + p.length, 0);
function advance(counter, consumed) {
    const c = Uint8Array.from(counter);
    for (let i = 0; i < Math.floor(consumed / 16); i++) bump(c);
    return c;
}
