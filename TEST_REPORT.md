# SKYNITY ISP Nexus Production Test Report

Date: 2026-05-04

## Summary

| Area | Result | Evidence |
| --- | --- | --- |
| API typecheck | PASS | `corepack pnpm --filter @isp-nexus/api typecheck` |
| Web typecheck | PASS | `corepack pnpm --filter @isp-nexus/web typecheck` |
| API build | PASS | `corepack pnpm --filter @isp-nexus/api build` |
| Web build | PASS | `corepack pnpm --filter @isp-nexus/web build` |
| Admin route | PASS | `https://admin.skynity.org/` returned 200 |
| Template CMS route | PASS | `https://admin.skynity.org/hotspot/templates` returned 200 |
| API health | PASS | `https://api.skynity.org/api/health` returned 200 |
| Hotspot static route | PASS | `https://hotspot.skynity.org/login.html` returned 200 |
| Portal packages API | PASS | `GET /api/portal/packages` returned 200 |
| Trial status API | PASS | `GET /api/portal/trial/status` returned 200 |
| Login API validation | PASS | Invalid login returned 401 |
| Register API validation | PASS | Invalid register returned 400 |
| Payment API validation | PASS | Invalid payment returned 400 |
| MikroTik html-directory | PASS | Active profile uses `flash/hotspot` |
| MikroTik file sync | PASS | Router file sizes match staged production files |
| MikroTik binary assets | PASS | PNG/WEBP sizes match exact local bytes |
| MikroTik walled garden | PASS | `api.skynity.org`, `admin.skynity.org`, `hotspot.skynity.org` allowed |
| Active users | PASS | Active count unchanged during deploy |
| Screenshot capture | SKIPPED | No Chromium/Playwright binary installed in production workspace |
| Android captive browser physical test | SKIPPED | No attached Android device/browser automation available in production workspace |
| External support intents | PASS | WhatsApp/Telegram use Android intent URLs with copy-button modal fallback |
| Router image files | PASS | `dish.png`, `gift.png`, `starlink-bg.webp` exact router byte sizes verified |
| Hotspot HTTP assets | PASS | All pages, CSS, JS, PNG, WEBP, SVG returned 200 through `hotspot.skynity.org` |
| Trial status correctness | PASS | No trial package now returns `available:false` |
| Test user payment | PASS | `test_hotspot_01` order created through live portal payment API |
| Test user approval | PASS | Order approved through app router; invoice created |
| Test user MikroTik provisioning | PASS | `test_hotspot_01` exists on real MikroTik, disabled=false |
| RADIUS auth | PASS | `test_hotspot_01` returned Access-Accept |
| Relogin / roaming simulation | PASS | Repeated RADIUS auth on NAS-Port 0 and NAS-Port 1 returned Access-Accept |
| Asset endpoint security | PASS | Valid asset returned 200; traversal attempt returned 400 |
| Public portal rate limits | PASS | Write endpoints now rate-limit by client/path |
| Session cookie audit | PASS | Cookies use HttpOnly, SameSite=Strict, Secure in production |

## Screenshots

Screenshot capture was skipped because no browser binary is installed in the production workspace. Route and asset rendering prerequisites were verified with HTTP 200 checks and exact byte-size checks.

Requested Android captive screenshots were not captured because no Android device or browser automation endpoint is available in this production workspace.

## Route Tests

```text
admin / 200
admin /hotspot/templates 200
api /api/health 200
hotspot login 200
packages 200 4045
trial 200 {"data":{"available":false,"packageId":null}}
login.html 200 text/html 20625
payment.html 200 text/html 12409
register.html 200 text/html 6618
logout.html 200 text/html 2209
status.html 200 text/html 4208
style.css 200 text/css 15549
img/dish.png 200 image/png 5381
img/gift.png 200 image/png 6159
img/starlink-bg.webp 200 image/webp 7530
md5.js 200 text/javascript 4578
```

## API Tests

```text
login invalid 401
register validation 400
payment validation 400
portal login test_hotspot_01 200
payment test_hotspot_01 200
approval test_hotspot_01 PASS
RADIUS Access-Accept NAS-Port 0 PASS
RADIUS Access-Accept NAS-Port 1 PASS
```

## Deployment Tests

```text
htmlDirectory flash/hotspot
activeBefore 0
activeAfter 0
login.html 19998/19998 PASS
logout.html 2209/2209 PASS
md5.js 4578/4578 PASS
payment.html 12409/12409 PASS
register.html 6132/6132 PASS
status.html 4208/4208 PASS
style.css 15408/15408 PASS
dish.png 5381/5381 PASS
gift.png 6159/6159 PASS
starlink-bg.webp 7530/7530 PASS
test_hotspot_01 MikroTik user PASS
active users unchanged PASS
```

## Fixes Validated

```text
WhatsApp intent: intent://send?phone=8801811871332#Intent;package=com.whatsapp;scheme=smsto;end
Telegram intent: intent://resolve?domain=shamimkhan313#Intent;package=org.telegram.messenger;scheme=https;end
Fallback modal: copy buttons present
Broken RADIUS Expiration check: removed from hotspot/Telegram provisioning
Trial false-positive: fixed /api/portal/trial/status
Hotspot asset traversal: blocked
Portal write endpoint rate limits: enabled
```
