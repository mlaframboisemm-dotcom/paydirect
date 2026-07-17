## Kiln Integration Change Log

All changes related to the Kiln integration and FAPI withdrawal initiation are recorded here with timestamps and diffs.

---

2026-07-07T00:00:00Z - Added `server/kiln-bridge.ts` (initial shim)

2026-07-07T00:15:00Z - Added production bridge verification entrypoint and hard-fail signing enforcement for withdrawal initiation.
--- before ---
No bridge-check script existed and withdrawal initiation would not explicitly fail closed when signing failed.
--- after ---
Added `scripts/bridge-check.ts` and enforced production-time rejection of withdrawals that do not produce a signature from the configured Kiln bridge. The withdrawal endpoint now records the idempotency key and appends a changelog entry when a signing failure occurs.

2026-07-07T00:16:00Z - Switched production environment to HTTP bridge mode and documented the deployment configuration.
--- before ---
The workspace environment was configured for PKCS#11 and did not include the validator URL.
--- after ---
The `.env` configuration now uses `SOVEREIGN_KILN_MODE=http` with `SOVEREIGN_KILN_HTTP_URL=https://validator.sovereigns.ca`, while preserving `PRODUCTION_ENFORCE_HARDWARE_SIGNING=true` for fail-closed production behavior.

2026-07-07T00:17:00Z - Verified the project build and startup path.
--- before ---
The repository had not been validated after the bridge and enforcement changes.
--- after ---
`npx tsc -p tsconfig.json --noEmit` completed successfully and the server startup path was exercised in production mode.

2026-07-07T00:18:00Z - Wired the transfer modal to the direct bank authorization endpoint.
--- before ---
The UI used the older Interac gateway stub flow instead of the production-ready `/api/withdrawal/initiate` route.
--- after ---
The deposit/withdrawal modal now calls `/api/withdrawal/initiate` with the selected bank and opens the returned authorization URL directly for the user.

Patch applied by assistant.

---

2026-07-07T00:10:00Z - Implemented production-capable Kiln bridge factory `getKilnBridge()`
--- before ---
`server/kiln-bridge.ts` contained only the development shim class.
--- after ---
`server/kiln-bridge.ts` now implements `getKilnBridge()` supporting modes: `http`, `cli`, `pkcs11`, and `shim` fallback. The server will select mode via `SOVEREIGN_KILN_MODE` env var.

Patch applied by assistant.

2026-07-07T00:00:05Z - Added `config/BankRegistry.json`
--- before ---
file did not exist
--- after ---
Added registry with bank entries for `rbc` and `td`.

Patch applied by assistant.

---

2026-07-07T00:00:10Z - Added `/api/withdrawal/initiate` endpoint to `server.ts`
--- before ---
no endpoint
--- after ---
Endpoint creates JWT payload, used `jsonwebtoken` and Kiln shim to produce client_assertion, returned `authorization_redirect_url`.

Patch applied by assistant.

---

2026-07-07T00:02:30Z - Hardening update: `server/kiln-bridge.ts` updated to ephemeral RSA keys and base64url signatures
--- before ---
KilnHardwareShim.signPayload used crypto.createSign and returned hex string with placeholder key.
--- after ---
KilnHardwareShim now generates ephemeral RSA keypair, exposes `getKid()`, signs with RSA-SHA256 + PSS padding, and returns base64url signature.

Patch applied by assistant.

---

2026-07-07T00:02:40Z - Hardening update: `server.ts` JWT header `kid` handling and fail-closed behavior
--- before ---
Header/payload were assembled using `jsonwebtoken` with alg 'none' then appended signature; kiln failures had no explicit 503 handling.
--- after ---
Now header includes `kid` from Kiln shim, header and payload are base64url encoded manually, signing input is passed to kiln.signPayload, and if kiln fails the endpoint returns 503 `HARDWARE_BRIDGE_OFFLINE`.

Patch applied by assistant.

---

2026-07-07T00:03:00Z - Client: `src/components/CashTransferModal.tsx` updated to prefer VS Code webview `acquireVsCodeApi` postMessage for `openExternal` and fallback to Capacitor Browser/window.open
--- before ---
Client opened bank redirects via Capacitor Browser or window.open only.
--- after ---
Client now checks for `acquireVsCodeApi` and posts `{ type: 'openExternal', url }` to the extension host; otherwise uses existing fallbacks.

Patch applied by assistant.
2026-07-09T19:39:44.113Z - WITHDRAWAL_FINALIZED transferId=wdr-f8a72d73b3735787 referenceId=HDLS-RAIL-0B0DB3 amountUsd=9.06
2026-07-09T19:43:02.144Z - WITHDRAWAL_FINALIZED transferId=wdr-e47776240f72bc11 referenceId=HDLS-RAIL-1A3B3C amountUsd=9.06
2026-07-09T19:51:34.150Z - WITHDRAWAL_FINALIZED transferId=wdr-990e3bb4eaa1dafa referenceId=HDLS-RAIL-C29154 amountUsd=9.06
2026-07-17T05:35:37.619Z - DEPOSIT_FINALIZED transferId=TXR-ED6984B0 referenceId=0xf6f2a7bc0840ae5dc2f8a3d2a2d6c4d6339f6cbfa3a91dd0c1b7601fe435c6d6 amountUsd=367.05
2026-07-17T05:35:40.240Z - WITHDRAWAL_FINALIZED transferId=wdr-19ef0ddeac5eef3d referenceId=0xfdb3eb7ce19fbaf503d141ffd31653d8785c20dbdcae9bb418b015a3101e8397 amountUsd=3.67
2026-07-17T05:35:42.530Z - WITHDRAWAL_FINALIZED transferId=wdr-359967c71e3de58d referenceId=0x8b66e522f840251e7134afd789033f3034910c55b0d789644caca4d19b35ea00 amountUsd=3.67
2026-07-17T05:35:44.770Z - WITHDRAWAL_FINALIZED transferId=wdr-540520720db84c83 referenceId=0xaa6e8e9b10da731b3f6e3ce43117fbb8f3fd6a1786886272a6cdf16c812088ef amountUsd=3.67
2026-07-17T05:35:47.473Z - WITHDRAWAL_FINALIZED transferId=wdr-5aeeb13575a88ac9 referenceId=0x5bd61d3cdb630b61d461f41a39c8e798f0d3cc5dca8c62ce8a90fcf838f7c380 amountUsd=3.67
2026-07-17T05:35:50.308Z - WITHDRAWAL_FINALIZED transferId=wdr-93385d603cc5273e referenceId=0xd60ace09e5911671af9079547f1b35693b6c82325d13e29609bae2fbda3f50f3 amountUsd=3.67
2026-07-17T05:35:53.749Z - WITHDRAWAL_FINALIZED transferId=wdr-c28172d151b0a19f referenceId=0x59ad579c9a00383a7f0cefb72e6cc5d5b34ef2cb578af83cfbc24591ae81a66b amountUsd=3.67
2026-07-17T05:35:56.590Z - WITHDRAWAL_FINALIZED transferId=wdr-38d19f68365d0285 referenceId=0x2d2d3a60671922f34f71c0c1028f3e8a23cb80eba1b0a73ca914522a4050e9ee amountUsd=3.67
2026-07-17T05:35:59.343Z - WITHDRAWAL_FINALIZED transferId=wdr-36ea817a69f8fb6f referenceId=0x84b1465eb02808c120781e22539d96d98db34cf9cbc30941987d5ea02682cd9f amountUsd=3.67
2026-07-17T05:36:02.497Z - WITHDRAWAL_FINALIZED transferId=wdr-3c769b5c2b8b5106 referenceId=0x637cc45dfb54bf9a86a429fa97788ce8917773da5c3a612ed8bf15cdddfea47f amountUsd=3.67
2026-07-17T06:11:10.921Z - DEPOSIT_FINALIZED transferId=TXR-E2B3A01D referenceId=0xcd759968af7f69a571668009bdb1e894948e58ab996fc914a52ffbf297d55bc2 amountUsd=367.05
2026-07-17T06:11:13.206Z - WITHDRAWAL_FINALIZED transferId=wdr-b7bfa42bcef51995 referenceId=0x6326f9d532e5e9e1093c2ef4071173c4ce2d9cd3083d1221271c690c59616899 amountUsd=3.67
2026-07-17T06:11:14.993Z - WITHDRAWAL_FINALIZED transferId=wdr-41b58a5858e6706b referenceId=0x7140abe5058c653e93b0f71a7ce70bdb3af2d8b7018df2e33d365fe612d9d1f0 amountUsd=3.67
2026-07-17T06:11:16.766Z - WITHDRAWAL_FINALIZED transferId=wdr-9d3220ef8f6b85c1 referenceId=0x96d81c642e62e8d633421052c2c9bcfd7335eb98981c0d071fe509e5356ff353 amountUsd=3.67
2026-07-17T06:11:18.615Z - WITHDRAWAL_FINALIZED transferId=wdr-b7d4137e68381b8e referenceId=0x8bb2024cdbcd7fa93a685d0657f0493155ea8ca2e0f1b6e12d4d1b1e7e07a330 amountUsd=3.67
2026-07-17T06:11:20.193Z - WITHDRAWAL_FINALIZED transferId=wdr-f8af70e4aa011c7f referenceId=0x0bac53118cc9a5e291f28136249b2b1860045e443cc795b6b2838da1419e8aba amountUsd=3.67
2026-07-17T06:11:21.779Z - WITHDRAWAL_FINALIZED transferId=wdr-315ddea0e2c8c182 referenceId=0xd3adeb88e67ac7dd93a4aef0ea75a38bcf4d0aea5e7ef9822d551e43b264027a amountUsd=3.67
2026-07-17T06:11:23.491Z - WITHDRAWAL_FINALIZED transferId=wdr-65f6e81b355278a2 referenceId=0x205958dfe0e1a63fff87d9e92efb744cb82fbd63a4e9019322da1af8a5a66ca8 amountUsd=3.67
2026-07-17T06:11:25.312Z - WITHDRAWAL_FINALIZED transferId=wdr-99cc0109080d9a8c referenceId=0xa79cd6d2a7f71aaf62cec45cb41a7772965300369bc01e98dd452174b1870fe2 amountUsd=3.67
2026-07-17T06:11:26.935Z - WITHDRAWAL_FINALIZED transferId=wdr-eca9dd4d22dee88c referenceId=0xf37c48df891618c7f523bf5c6fcadca2430121f27a46c21d31347f22523c86b1 amountUsd=3.67
