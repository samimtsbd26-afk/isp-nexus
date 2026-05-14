import { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { getDashboard, type DashboardData } from "@/lib/api";
import { COLORS } from "@/lib/constants";

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function fmtBdt(n: number) { return `৳${n.toLocaleString("en-BD")}`; }

export default function DashboardScreen() {
  const router = useRouter();
  const { token, customer } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const d = await getDashboard(token);
      setData(d);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "ডেটা লোড ব্যর্থ");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const activeSub = data?.subscriptions.find(s => s.status === "active");
  const daysLeft = daysUntil(activeSub?.expiresAt);

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>আস-সালামু আলাইকুম!</Text>
            <Text style={styles.name}>{customer?.fullName ?? "—"}</Text>
            <Text style={styles.code}>ID: {customer?.customerCode ?? "—"}</Text>
          </View>
          <View style={[styles.badge, activeSub ? styles.badgeActive : styles.badgeExpired]}>
            <Text style={styles.badgeText}>{activeSub ? "সক্রিয়" : "মেয়াদ শেষ"}</Text>
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {/* Subscription card */}
        {activeSub ? (
          <View style={styles.subCard}>
            <Text style={styles.subCardTitle}>সক্রিয় সংযোগ</Text>
            <Text style={styles.subUser}>{activeSub.username}</Text>
            {daysLeft !== null && (
              <View style={[styles.daysRow, daysLeft <= 3 ? styles.daysRowWarn : null]}>
                <Text style={[styles.daysNum, daysLeft <= 3 ? { color: COLORS.warning } : {}]}>
                  {daysLeft}
                </Text>
                <Text style={styles.daysSub}>দিন বাকি</Text>
              </View>
            )}
            {activeSub.expiresAt && (
              <Text style={styles.expiry}>
                মেয়াদ: {new Date(activeSub.expiresAt).toLocaleDateString("bn-BD")}
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.subCard}>
            <Text style={styles.subCardTitle}>কোনো সক্রিয় সংযোগ নেই</Text>
            <TouchableOpacity style={styles.renewBtn} onPress={() => router.push("/(tabs)/payments")}>
              <Text style={styles.renewBtnText}>এখনই রিনিউ করুন</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>দ্রুত কাজ</Text>
        <View style={styles.actions}>
          {[
            { label: "রিনিউ", emoji: "🔄", route: "/(tabs)/payments" },
            { label: "ডিভাইস", emoji: "📡", route: "/(tabs)/hotspot" },
            { label: "সাপোর্ট", emoji: "🎧", route: "/(tabs)/support" },
            { label: "প্রোফাইল", emoji: "👤", route: "/(tabs)/profile" },
          ].map((a) => (
            <TouchableOpacity
              key={a.route}
              style={styles.actionBtn}
              onPress={() => router.push(a.route as any)}
            >
              <Text style={styles.actionEmoji}>{a.emoji}</Text>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent orders */}
        {(data?.recentOrders?.length ?? 0) > 0 && (
          <>
            <Text style={styles.sectionTitle}>সাম্প্রতিক অর্ডার</Text>
            {data!.recentOrders.slice(0, 3).map((order) => (
              <View key={order.id} style={styles.orderRow}>
                <View>
                  <Text style={styles.orderMethod}>{order.paymentMethod ?? "—"}</Text>
                  <Text style={styles.orderDate}>
                    {new Date(order.createdAt).toLocaleDateString("bn-BD")}
                  </Text>
                </View>
                <View style={styles.orderRight}>
                  <Text style={styles.orderAmount}>{fmtBdt(order.amountBdt)}</Text>
                  <Text style={[
                    styles.orderStatus,
                    order.status === "approved" ? styles.statusOk :
                    order.status === "pending" ? styles.statusPending : styles.statusBad,
                  ]}>
                    {order.status === "approved" ? "অনুমোদিত" : order.status === "pending" ? "অপেক্ষামান" : "বাতিল"}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { padding: 16, gap: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  greeting: { color: COLORS.textMuted, fontSize: 13 },
  name: { color: COLORS.text, fontSize: 20, fontWeight: "700" },
  code: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeActive: { backgroundColor: "#14532d55" },
  badgeExpired: { backgroundColor: "#7f1d1d55" },
  badgeText: { fontSize: 12, fontWeight: "600", color: COLORS.text },
  error: { color: COLORS.danger, textAlign: "center", fontSize: 13 },
  subCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.border },
  subCardTitle: { color: COLORS.textMuted, fontSize: 13, marginBottom: 6 },
  subUser: { color: COLORS.text, fontSize: 18, fontWeight: "700", marginBottom: 8 },
  daysRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  daysRowWarn: {},
  daysNum: { fontSize: 48, fontWeight: "800", color: COLORS.primary },
  daysSub: { fontSize: 16, color: COLORS.textMuted },
  expiry: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  renewBtn: { backgroundColor: COLORS.primary, borderRadius: 10, padding: 12, alignItems: "center", marginTop: 8 },
  renewBtnText: { color: "#fff", fontWeight: "600" },
  sectionTitle: { color: COLORS.textMuted, fontSize: 12, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 8 },
  actions: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, alignItems: "center", gap: 6, borderWidth: 1, borderColor: COLORS.border },
  actionEmoji: { fontSize: 22 },
  actionLabel: { color: COLORS.text, fontSize: 12, fontWeight: "500" },
  orderRow: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderMethod: { color: COLORS.text, fontWeight: "600", fontSize: 14 },
  orderDate: { color: COLORS.textMuted, fontSize: 12 },
  orderRight: { alignItems: "flex-end" },
  orderAmount: { color: COLORS.text, fontWeight: "700" },
  orderStatus: { fontSize: 12, marginTop: 2 },
  statusOk: { color: COLORS.success },
  statusPending: { color: COLORS.warning },
  statusBad: { color: COLORS.danger },
});
