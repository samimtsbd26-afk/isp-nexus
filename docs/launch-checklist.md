# ISP Nexus — Commercial Launch Checklist

## PRE-LAUNCH (T-7 days)

### Infrastructure
- [ ] VPS disk: ≥20GB free (`df -h /opt`)
- [ ] SSL certs valid: `bash scripts/monitor-ssl.sh`
- [ ] Backup drill passed: `bash scripts/backup-drill.sh`
- [ ] Daily backup cron active: `crontab -l | grep backup`
- [ ] Domain DNS TTL reduced to 300s (for fast failover)
- [ ] Uptime monitoring configured (UptimeRobot / Better Uptime)
- [ ] SSL auto-renewal verified (Caddy ACME): `docker logs isp-nexus-caddy-1 | grep renew`

### System Config
- [ ] PORTAL_ORG_ID set correctly in `.env`
- [ ] Telegram bot connected and test message received
- [ ] SMS provider configured and test SMS sent
- [ ] Payment methods (bKash/Nagad) configured with correct numbers
- [ ] Hotspot trial enabled/disabled as intended
- [ ] Package prices reviewed and published
- [ ] Support contact number in portal config

### Security
- [ ] Security audit score ≥85: `/performance` → Security Audit tab
- [ ] JWT_SECRET ≥64 chars
- [ ] Admin password changed from default
- [ ] Superadmin count = 1 (no extra accounts)
- [ ] Rate limiting active (check Redis `ratelimit:*` keys)

---

## FIRST 100 CUSTOMERS CHECKLIST

### পয়েন্ট 1–10 (Soft Launch)
- [ ] ৫ জন beta গ্রাহক দিয়ে শুরু করুন — ফিডব্যাক নিন
- [ ] Hotspot trial flow হাতে-হাতে পরীক্ষা করুন
- [ ] প্রতিটি payment manually যাচাই করুন
- [ ] MikroTik provisioning সঠিকভাবে কাজ করছে নিশ্চিত করুন
- [ ] Support ticket system পরীক্ষা করুন
- [ ] Invoice PDF generate হচ্ছে কিনা দেখুন

### পয়েন্ট 11–30 (Early Adopters)
- [ ] First reseller অনবোর্ড করুন
- [ ] Reseller কমিশন সঠিকভাবে calculate হচ্ছে কিনা যাচাই
- [ ] SMS notification চালু করুন (welcome + expiry)
- [ ] Weekly backup drill শুরু করুন
- [ ] Daily active user tracking শুরু করুন (NOC Wallboard)

### পয়েন্ট 31–60 (Growth Phase)
- [ ] ২য় ও ৩য় reseller অনবোর্ড
- [ ] Voucher sales শুরু করুন
- [ ] Customer scoring চালু — churn risk HIGH গ্রাহকদের ফলো-আপ
- [ ] Package recommendation দেখুন — upgrade suggestions পাঠান
- [ ] Financial Dashboard দেখুন — MRR track করুন
- [ ] Unpaid invoice follow-up process চালু করুন

### পয়েন্ট 61–100 (Scale)
- [ ] Analytics revenue trend — growth pattern বিশ্লেষণ করুন
- [ ] Churn rate 10%-এর নিচে রাখুন
- [ ] ARPU বাড়ানোর জন্য upgrade campaign শুরু করুন
- [ ] 2nd router/AP সংযোগ বিবেচনা করুন
- [ ] Customer referral program চালু করুন

---

## CUSTOMER SUPPORT STAFFING

### মিনিমাম টিম (১–৫০ গ্রাহক)
| ভূমিকা | সংখ্যা | দায়িত্ব |
|---|---|---|
| Admin/NOC | ১ | Dashboard, approvals, Telegram alerts |
| ফিল্ড টেকনিশিয়ান | ১ | Router, wiring, on-site support |
| কাস্টমার সাপোর্ট | ১ (part-time) | Phone/SMS support |

### স্ট্যান্ডার্ড টিম (৫০–২০০ গ্রাহক)
| ভূমিকা | সংখ্যা | দায়িত্ব |
|---|---|---|
| NOC Operator | ১ | 24/7 monitoring, alert response |
| Admin | ১ | Billing, approvals, reporting |
| ফিল্ড টেকনিশিয়ান | ২ | On-site support, installations |
| সাপোর্ট এজেন্ট | ১ | Tickets, phone support |

### SLA Targets
| টাইপ | Response Time | Resolution |
|---|---|---|
| Network Down | ৫ মিনিট | ৩০ মিনিট |
| Login Issue | ১৫ মিনিট | ২ ঘণ্টা |
| Billing Issue | ২ ঘণ্টা | ২৪ ঘণ্টা |
| General Query | ৪ ঘণ্টা | ৪৮ ঘণ্টা |

---

## MONTHLY OPERATIONS CHECKLIST

- [ ] Backup drill: `bash scripts/backup-drill.sh`
- [ ] SSL check: `bash scripts/monitor-ssl.sh`
- [ ] Security audit: `/performance` page → score check
- [ ] Financial review: `/finance` → MRR, ARPU, churn trends
- [ ] Reseller payouts: Process pending commissions
- [ ] Expired subscriptions follow-up: contact lapsed customers
- [ ] Package pricing review vs competitor pricing
- [ ] NOC wallboard review: incident patterns
- [ ] Redis memory check: `docker exec isp-nexus-redis-1 redis-cli INFO memory`
- [ ] Disk space: `df -h /opt`
