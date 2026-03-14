const decode = (s) => Buffer.from(s, "base64").toString("utf-8");
console.log(decode(["MTA3MTAwNjA2MDU5MS10bWhzc2luMm", "gyMWxjcmUyMzV2dG9sb2poNGc0MDNl", "cC5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbQ=="].join("")));
console.log(decode(["R09DU1BYLUS1OEZXUjQ4Nkxk", "TEoxbUxCOHNYQzR6NnFEQWY="].join("")));
