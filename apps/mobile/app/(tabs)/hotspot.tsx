import { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Network from "expo-network";
import { useAuth } from "@/lib/auth";
import { getDeviceBindings, getActiveSession, resetDevice, logoutAllSessions, type DeviceBinding, type ActiveSession } from "@/lib/api";
import { COLORS } from "@/lib/constants";

function fmtBytes(bytes: number) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function HotspotScreen() {
  const { token } = useAuth();
  const [bindings, setBindings] = useState<DeviceBinding[]>([]);
  const [session, setSession] = useState<ActiveSession | null | undefined>(undefined);
  const [networkState, setNetworkState] = useState<{ isConnected: boolean; ssid?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [b, s, net] = await Promise.all([
        getDeviceBindings(token),
        getActiveSession(token),
        Network.getNetworkStateAsync(),
      ]);
      setBindings(b);
      setSession(s);
      setNetworkState({ isConnected: net.isConnected ?? false });
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleResetDevice = (bindingId: string) => {
    Alert.alert("ডিভাইস রিসেট", "এই ডিভাইসের বাইন্ডিং মুছে ফেলা হবে?", [
      { text: "বাতিল", style: "cancel" },
      {
        text: "রিসেট করুন",
        style: "destructive",
        onPress: async () => {
          if (!token) return;
          try {
            await resetDevice(token, bindingId);
            load();
          } catch (e: any) {
            Alert.alert("ত্রুটি", e?.message ?? "রিসেট ব্যর্থ");
          }
        },
      },
    ]);
  };

  const handleLogoutAll = () => {
    Alert.alert("সব সেশন বন্ধ", "সব ডিভাইস থেকে লগআউট করা হবে?", [
      { text: "বাতিল", style: "cancel" },
      {
        text: "লগআউট",
        style: "destructive",
        onPress: async () => {
          if (!token) return;
          try {
            await logoutAllSessions(token);
            setSession(null);
            load();
          } catch (e: any) {
            Alert.alert("ত্রুটি", e?.message ?? "লগআউট ব্যর্থ");
          }
        },
      },
    ]);
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
        <Text style={styles.pageTitle}>ডিভাইস ও হটস্পট</Text>

        {/* Network status */}
        <View style={styles.netCard}>
          <View style={[styles.netDot, networkState?.isConnected ? styles.netOnline : styles.netOffline]} />
          <Text style={styles.netText}>
            {networkState?.isConnected ? "ইন্টারনেট সংযুক্ত" : "ইন্টারনেট নেই"}
          </Text>
        </View>

        {/* Active session */}
        <Text style={styles.sectionTitle}>সক্রিয় সেশন</Text>
        {session ? (
          <View style={styles.sessionCard}>
            <View style={styles.sessionRow}>
              <Text style={styles.sessionLabel}>ব্যবহারকারী</Text>
              <Text style={styles.sessionValue}>{session.username}</Text>
            </View>
            <View style={styles.sessionRow}>
              <Text style={styles.sessionLabel}>আইপি</Text>
              <Text style={styles.sessionValue}>{session.address}</Text>
            </View>
            <View style={styles.sessionRow}>
              <Text style={styles.sessionLabel}>সময়</Text>
              <Text style={styles.sessionValue}>{session.uptime}</Text>
            </View>
            <View style={styles.sessionRow}>
              <Text style={styles.sessionLabel}>ডাউনলোড</Text>
              <Text style={styles.sessionValue}>{fmtBytes(session.rxBytes)}</Text>
            </View>
            <View style={styles.sessionRow}>
              <Text style={styles.sessionLabel}>আপলোড</Text>
              <Text style={styles.sessionValue}>{fmtBytes(session.txBytes)}</Text>
            </View>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogoutAll}>
              <Text style={styles.logoutText}>সব সেশন বন্ধ করুন</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>কোনো সক্রিয় সেশন নেই</Text>
          </View>
        )}

        {/* Device bindings */}
        <Text style={styles.sectionTitle}>বাইন্ডেড ডিভাইস ({bindings.length})</Text>
        {bindings.length === 0 && <Text style={styles.emptyText}>কোনো ডিভাইস বাইন্ড নেই</Text>}
        {bindings.map(b => (
          <View key={b.id} style={styles.deviceCard}>
            <View style={styles.deviceInfo}>
              <Text style={styles.deviceMac}>{b.macAddress ?? "MAC অজানা"}</Text>
              <Text style={styles.deviceIp}>{b.ipAddress ?? "—"}</Text>
              <Text style={styles.deviceDate}>
                {new Date(b.createdAt).toLocaleDateString("bn-BD")}
              </Text>
            </View>
            <TouchableOpacity style={styles.resetBtn} onPress={() => handleResetDevice(b.id)}>
              <Text style={styles.resetText}>রিসেট</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { padding: 16, gap: 12 },
  pageTitle: { color: COLORS.text, fontSize: 22, fontWeight: "700" },
  sectionTitle: { color: COLORS.textMuted, fontSize: 12, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 8 },
  netCard: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  netDot: { width: 10, height: 10, borderRadius: 5 },
  netOnline: { backgroundColor: COLORS.success },
  netOffline: { backgroundColor: COLORS.danger },
  netText: { color: COLORS.text, fontWeight: "500" },
  sessionCard: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border, gap: 8 },
  sessionRow: { flexDirection: "row", justifyContent: "space-between" },
  sessionLabel: { color: COLORS.textMuted, fontSize: 13 },
  sessionValue: { color: COLORS.text, fontWeight: "500", fontSize: 13 },
  logoutBtn: { marginTop: 8, borderWidth: 1, borderColor: COLORS.danger, borderRadius: 8, padding: 10, alignItems: "center" },
  logoutText: { color: COLORS.danger, fontWeight: "600" },
  emptyCard: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 16 },
  emptyText: { color: COLORS.textMuted, textAlign: "center" },
  deviceCard: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  deviceInfo: { flex: 1 },
  deviceMac: { color: COLORS.text, fontWeight: "600", fontSize: 14, fontVariant: ["tabular-nums"] },
  deviceIp: { color: COLORS.textMuted, fontSize: 12 },
  deviceDate: { color: COLORS.textMuted, fontSize: 11 },
  resetBtn: { borderWidth: 1, borderColor: COLORS.warning, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  resetText: { color: COLORS.warning, fontSize: 13, fontWeight: "600" },
});
