const b64 = "R09DU1BYLUS1OEZXUjQ4NkxkTEoxbUxCOHNYQzR6NnFEQWY=";
const buf = Buffer.from(b64, "base64");
console.log("Hex:", buf.toString('hex'));
console.log("Ascii:", buf.toString('ascii'));
