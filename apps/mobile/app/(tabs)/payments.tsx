import { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Modal, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { getDashboard, getPackages, getPaymentConfigs, submitOrder, type Package, type Order } from "@/lib/api";
import { COLORS } from "@/lib/constants";

type PaymentMethod = "bkash" | "nagad" | "rocket" | "cash" | "bank" | "free";

function fmtBdt(n: number) { return `৳${n.toLocaleString("en-BD")}`; }

export default function PaymentsScreen() {
  const { token, orgId } = useAuth();

  const [packages, setPackages] = useState<Package[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payConfigs, setPayConfigs] = useState<{ method: string; accountNumber: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Order modal state
  const [orderPkg, setOrderPkg] = useState<Package | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("bkash");
  const [trxId, setTrxId] = useState("");
  const [payFrom, setPayFrom] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !orgId) return;
    try {
      const [dash, pkgs, pConf] = await Promise.all([
        getDashboard(token),
        getPackages(orgId),
        getPaymentConfigs(orgId),
      ]);
      setOrders(dash.recentOrders);
      setPackages(pkgs.filter(p => p.isActive && !p.isTrial));
      setPayConfigs(pConf);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [token, orgId]);

  useEffect(() => { load(); }, [load]);

  const handleSubmitOrder = async () => {
    if (!orderPkg || !token) return;
    if (["bkash", "nagad", "rocket"].includes(payMethod) && !trxId.trim()) {
      setOrderError("Transaction ID দিন");
      return;
    }
    setSubmitting(true);
    setOrderError(null);
    try {
      const result = await submitOrder(token, {
        packageId: orderPkg.id,
        amountBdt: orderPkg.priceBdt,
        paymentMethod: payMethod,
        trxId: trxId.trim() || undefined,
        paymentFrom: payFrom.trim() || undefined,
      });
      setOrderSuccess(`অর্ডার জমা হয়েছে। ID: ${result.orderId.slice(0, 8)}`);
      setOrderPkg(null);
      setTrxId("");
      setPayFrom("");
      load();
    } catch (e: any) {
      setOrderError(e?.message ?? "অর্ডার জমা ব্যর্থ");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
      >
        <Text style={styles.pageTitle}>পেমেন্ট ও রিনিউ</Text>

        {orderSuccess && (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>{orderSuccess}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>প্যাকেজ বেছে নিন</Text>
        {packages.map(pkg => (
          <TouchableOpacity key={pkg.id} style={styles.pkgCard} onPress={() => { setOrderPkg(pkg); setOrderSuccess(null); }}>
            <View style={styles.pkgHeader}>
              <Text style={styles.pkgName}>{pkg.name}</Text>
              <Text style={styles.pkgPrice}>{fmtBdt(pkg.priceBdt)}</Text>
            </View>
            <Text style={styles.pkgSpeed}>{pkg.downloadMbps}↓ / {pkg.uploadMbps}↑ Mbps</Text>
            <Text style={styles.pkgValidity}>{pkg.validityDays} দিন</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionTitle}>অর্ডার ইতিহাস</Text>
        {orders.length === 0 && <Text style={styles.empty}>কোনো অর্ডার নেই</Text>}
        {orders.map(order => (
          <View key={order.id} style={styles.orderRow}>
            <View>
              <Text style={styles.orderMethod}>{order.paymentMethod ?? "—"}</Text>
              <Text style={styles.orderDate}>{new Date(order.createdAt).toLocaleDateString("bn-BD")}</Text>
            </View>
            <View style={styles.orderRight}>
              <Text style={styles.orderAmt}>{fmtBdt(order.amountBdt)}</Text>
              <Text style={[styles.orderStatus, order.status === "approved" ? styles.ok : order.status === "pending" ? styles.pending : styles.bad]}>
                {order.status === "approved" ? "অনুমোদিত" : order.status === "pending" ? "অপেক্ষামান" : "বাতিল"}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Order modal */}
      <Modal visible={!!orderPkg} transparent animationType="slide" onRequestClose={() => setOrderPkg(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>অর্ডার করুন</Text>
            {orderPkg && (
              <View style={styles.pkgSummary}>
                <Text style={styles.pkgSumName}>{orderPkg.name}</Text>
                <Text style={styles.pkgSumPrice}>{fmtBdt(orderPkg.priceBdt)}</Text>
              </View>
            )}

            {orderError && <Text style={styles.modalError}>{orderError}</Text>}

            <Text style={styles.modalLabel}>পেমেন্ট পদ্ধতি</Text>
            <View style={styles.methodRow}>
              {(["bkash", "nagad", "cash"] as PaymentMethod[]).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.methodBtn, payMethod === m && styles.methodBtnActive]}
                  onPress={() => setPayMethod(m)}
                >
                  <Text style={[styles.methodText, payMethod === m && { color: "#fff" }]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {["bkash", "nagad", "rocket"].includes(payMethod) && payConfigs.length > 0 && (
              <View style={styles.payInfo}>
                {payConfigs.filter(c => c.method === payMethod).map(c => (
                  <Text key={c.method} style={styles.payInfoText}>পাঠান: {c.accountNumber}</Text>
                ))}
              </View>
            )}

            {["bkash", "nagad", "rocket"].includes(payMethod) && (
              <>
                <TextInput style={styles.modalInput} placeholder="Transaction ID" placeholderTextColor={COLORS.textMuted} value={trxId} onChangeText={setTrxId} />
                <TextInput style={styles.modalInput} placeholder="পেমেন্টকারী নম্বর" placeholderTextColor={COLORS.textMuted} value={payFrom} onChangeText={setPayFrom} keyboardType="phone-pad" />
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setOrderPkg(null)}>
                <Text style={styles.cancelText}>বাতিল</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleSubmitOrder} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>নিশ্চিত করুন</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { padding: 16, gap: 12 },
  pageTitle: { color: COLORS.text, fontSize: 22, fontWeight: "700" },
  sectionTitle: { color: COLORS.textMuted, fontSize: 12, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 8 },
  successBanner: { backgroundColor: "#14532d55", borderRadius: 10, padding: 12 },
  successText: { color: COLORS.success, textAlign: "center" },
  pkgCard: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  pkgHeader: { flexDirection: "row", justifyContent: "space-between" },
  pkgName: { color: COLORS.text, fontWeight: "700", fontSize: 16 },
  pkgPrice: { color: COLORS.primary, fontWeight: "700", fontSize: 16 },
  pkgSpeed: { color: COLORS.textMuted, fontSize: 13, marginTop: 4 },
  pkgValidity: { color: COLORS.textMuted, fontSize: 12 },
  orderRow: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderMethod: { color: COLORS.text, fontWeight: "600" },
  orderDate: { color: COLORS.textMuted, fontSize: 12 },
  orderRight: { alignItems: "flex-end" },
  orderAmt: { color: COLORS.text, fontWeight: "700" },
  orderStatus: { fontSize: 12, marginTop: 2 },
  ok: { color: COLORS.success },
  pending: { color: COLORS.warning },
  bad: { color: COLORS.danger },
  empty: { color: COLORS.textMuted, textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 12 },
  modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: "700" },
  pkgSummary: { flexDirection: "row", justifyContent: "space-between", backgroundColor: COLORS.background, borderRadius: 10, padding: 12 },
  pkgSumName: { color: COLORS.text, fontWeight: "600" },
  pkgSumPrice: { color: COLORS.primary, fontWeight: "700" },
  modalError: { color: COLORS.danger, fontSize: 13 },
  modalLabel: { color: COLORS.textMuted, fontSize: 13 },
  methodRow: { flexDirection: "row", gap: 8 },
  methodBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 10, alignItems: "center" },
  methodBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  methodText: { color: COLORS.text, fontWeight: "500" },
  payInfo: { backgroundColor: COLORS.background, borderRadius: 8, padding: 10 },
  payInfoText: { color: COLORS.success, fontWeight: "600" },
  modalInput: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, color: COLORS.text },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 14, alignItems: "center" },
  cancelText: { color: COLORS.textMuted },
  confirmBtn: { flex: 2, backgroundColor: COLORS.primary, borderRadius: 10, padding: 14, alignItems: "center" },
  confirmText: { color: "#fff", fontWeight: "600" },
});
