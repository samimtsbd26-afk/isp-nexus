# SOP: Payment Failure

**Trigger:** Customer reports payment made but subscription not activated.

## Common Causes

| Cause | Fix |
|---|---|
| bKash/Nagad TrxID not entered | Customer re-submits with correct TrxID |
| Admin not approved yet | Approve via Orders page |
| Wrong amount sent | Verify amount, partial refund or top-up |
| Duplicate order | Find & approve correct order |
| MikroTik provisioning failed | Manual provision via router panel |

## Step 1 — Find the Order

```bash
# Search by customer phone
curl -s "http://localhost:8787/api/trpc/order.list?input=%7B%22json%22%3A%7B%7D%7D" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys,json; rs=json.load(sys.stdin)['result']['data']['json']['rows']
for r in rs:
  if '<PHONE>' in str(r.get('customerPhone','')):
    print(r['id'], r['status'], r['amountBdt'], r['paymentMethod'])"
```

## Step 2 — Verify Payment

- bKash: এর জন্য customer-এর Statement screenshot নিন
- Nagad: TrxID যাচাই করুন → Nagad merchant dashboard চেক করুন
- Cash: Receipt বা collector confirmation নিন

## Step 3 — Approve / Reject

```bash
# Approve (activates subscription + MikroTik provisioning)
curl -s -X POST "http://localhost:8787/api/trpc/order.approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"json":{"id":"<ORDER_ID>"}}'

# Reject with reason
curl -s -X POST "http://localhost:8787/api/trpc/order.reject" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"json":{"id":"<ORDER_ID>","reason":"Payment not verified"}}'
```

## Step 4 — Manual Subscription (if order corrupted)

1. Admin panel → Customers → Customer Detail
2. "Create Subscription" button
3. Package, username, password, router নির্বাচন করুন
4. Save → auto-provisions to MikroTik + RADIUS

## Step 5 — Customer Confirmation SMS

```
প্রিয় {name}, আপনার {amount} টাকার পেমেন্ট নিশ্চিত হয়েছে।
ইন্টারনেট সংযোগ: Username: {username} Password: {password}।
যেকোনো সমস্যায়: {support_phone}
```

## Refund Process

- বিকাশে রিফান্ড: Customer-এর বিকাশ নম্বরে Send Money করুন
- Nagad: Nagad merchant dashboard থেকে refund করুন
- Activity Log-এ note রাখুন
