# SOP: Router Down

**Trigger:** NOC Wallboard shows router offline, Telegram CRITICAL alert, or customer complaints.

## Severity Assessment

| Signal | Severity |
|---|---|
| Single router, <5 min offline | LOW — wait & monitor |
| Single router, >5 min + customers affected | HIGH — act now |
| Multiple routers offline | CRITICAL — escalate immediately |

## Step 1 — Verify (2 min)

```bash
# Check router status in dashboard
curl -s http://localhost:8787/api/trpc/router.list \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys,json; rs=json.load(sys.stdin)['result']['data']['json']
for r in rs: print(r['name'], r['isActive'], r['lastSeenAt'])"

# Ping router
ping -c 4 <ROUTER_IP>

# Check MikroTik via Winbox or SSH
ssh admin@<ROUTER_IP>
```

## Step 2 — Network Path Check (3 min)

```bash
# Trace route to router
traceroute <ROUTER_IP>

# Check if ISP uplink is up
ping -c 3 8.8.8.8

# Check RADIUS — is it responding?
radtest testuser testpass localhost 1812 secret
```

## Step 3 — Remote Reboot (if accessible)

```bash
# Via MikroTik API (if router responds on API port)
/system reboot

# Via SSH
ssh admin@<ROUTER_IP> "/system reboot"
```

## Step 4 — Physical Intervention

- ডিলারকে call করুন: অথবা নিজে সাইটে যান
- পাওয়ার সাইকেল করুন (router unplug → 30s → plug)
- WAN cable যাচাই করুন
- Router LED status চেক করুন

## Step 5 — Recovery Verification

```bash
# After router comes back — force sync
curl -s -X POST http://localhost:8787/api/trpc/router.syncNow \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"json":{"routerId":"<ID>"}}'

# Verify active users restored
docker exec isp-nexus-postgres-1 psql -U isp_nexus_user -d isp_nexus \
  -c "SELECT count(*) FROM subscriptions WHERE status='active';"
```

## Step 6 — Customer Notification

```
প্রিয় গ্রাহক, আমাদের নেটওয়ার্কে সাময়িক সমস্যার কারণে সংযোগ বিচ্ছিন্ন হয়েছিল।
সমস্যাটি সমাধান হয়েছে। অসুবিধার জন্য দুঃখিত।
```

## Escalation

- 15 min no fix → WhatsApp/call NOC lead
- 30 min no fix → Notify affected customers via SMS
- 60 min no fix → Activate backup router (if available)
