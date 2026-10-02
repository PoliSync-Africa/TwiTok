import { createHmac } from "node:crypto";

function base32Decode(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = value.replace(/=+$/,"").replace(/\s+/g,"").toUpperCase();
  let bits = "";
  for (const ch of clean) {
    const i = alphabet.indexOf(ch);
    if (i < 0) throw new Error("Invalid MFA secret");
    bits += i.toString(2).padStart(5,"0");
  }
  const bytes = [];
  for (let i=0;i+8<=bits.length;i+=8) bytes.push(parseInt(bits.slice(i,i+8),2));
  return Buffer.from(bytes);
}
export function verifyTotp(code: string, secret: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return false;
  const key = base32Decode(secret);
  const counter = Math.floor(now / 1000 / 30);
  for (let offset=-1; offset<=1; offset++) {
    const buf=Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(counter+offset));
    const digest=createHmac("sha1",key).update(buf).digest();
    const idx=digest[digest.length-1]&15;
    const binary=((digest[idx]&127)<<24)|((digest[idx+1]&255)<<16)|((digest[idx+2]&255)<<8)|(digest[idx+3]&255);
    const expected=String(binary%1_000_000).padStart(6,"0");
    if (expected===code) return true;
  }
  return false;
}