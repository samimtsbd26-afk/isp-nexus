# SOP: Hotspot Login Issue

**Trigger:** Customer cannot log in to WiFi hotspot after approved subscription.

## Quick Diagnosis Checklist

```
[ ] Customer-এর subscription status = 'active'?
[ ] Username/password সঠিক?
[ ] MikroTik-এ hotspot user exist করে?
[ ] RADIUS radcheck table-এ entry আছে?
[ ] Router online?
[ ] MAC binding block নেই?
```

## Step 1 — Check Subscription

```bash
docker exec isp-nexus-postgres-1 psql -U isp_nexus_user -d isp_nexus -c "
SELECT s.status, s.username, s.expires_at, c.phone
FROM subscriptions s JOIN customers c ON s.customer_id=c.id
WHERE c.phone='<PHONE>' ORDER BY s.created_at DESC LIMIT 3;"
```

## Step 2 — Check RADIUS

```bash
# Check radcheck entry
docker exec isp-nexus-freeradius-1 mysql -u radius -pradiuspass radius \
  -e "SELECT username, attribute, value FROM radcheck WHERE username='<USERNAME>';"

# Test authentication manually
radtest <USERNAME> <PASSWORD> 127.0.0.1 1812 <RADIUS_SECRET>
```

## Step 3 — Check MikroTik Hotspot Users

```
/ip hotspot user print where name=<USERNAME>
/ip hotspot user print where mac-address=<MAC>
/ip hotspot active print
```

## Step 4 — Fix Options

### A) User missing from MikroTik — Force Sync
```bash
curl -s -X POST "http://localhost:8787/api/trpc/hotspot.syncUsers" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"json":{}}'
```

### B) RADIUS entry missing — Re-provision
```bash
# Admin panel → Customer → Subscription → Re-provision
curl -s -X POST "http://localhost:8787/api/trpc/customer.resetDevice" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"json":{"customerId":"<CUSTOMER_ID>"}}'
```

### C) Password reset
```bash
curl -s -X POST "http://localhost:8787/api/trpc/auth.resetUserPassword" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"json":{"id":"<USER_ID>","newPassword":"<NEW_PASS>"}}'
```

### D) Session stuck — Kick active session
```
/ip hotspot active remove [find where user=<USERNAME>]
```

## Step 5 — Customer Instructions

```
আপনার WiFi এর নাম: <SSID>
Username: <USERNAME>
Password: <PASSWORD>
Login page: http://hotspot.skynity.org
যদি login page না খোলে, browser-এ http://1.1.1.1 লিখুন।
```
