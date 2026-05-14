import { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { changePassword } from "@/lib/api";
import { COLORS } from "@/lib/constants";

export default function ProfileScreen() {
  const { customer, logout, biometricAvailable, biometricEnabled, enableBiometric, disableBiometric, token } = useAuth();

  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) { setPwError("সব ঘর পূরণ করুন"); return; }
    if (newPw !== confirmPw) { setPwError("নতুন পাসওয়ার্ড মিলছে না"); return; }
    if (newPw.length < 6) { setPwError("কমপক্ষে ৬ অক্ষর হতে হবে"); return; }
    if (!token) return;
    setPwLoading(true);
    setPwError(null);
    try {
      await changePassword(token, currentPw, newPw);
      setPwSuccess(true);
      setShowPwForm(false);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (e: any) {
      setPwError(e?.message ?? "পাসওয়ার্ড পরিবর্তন ব্যর্থ");
    } finally {
      setPwLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("লগআউট", "আপনি কি লগআউট করতে চান?", [
      { text: "না", style: "cancel" },
      { text: "হ্যাঁ", style: "destructive", onPress: logout },
    ]);
  };

  const handleBiometricToggle = async (val: boolean) => {
    if (val) await enableBiometric();
    else await disableBiometric();
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.pageTitle}>প্রোফাইল</Text>

        {/* Customer info */}
        <View style={styles.infoCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{customer?.fullName?.[0]?.toUpperCase() ?? "?"}</Text>
          </View>
          <View style={styles.infoBody}>
            <Text style={styles.infoName}>{customer?.fullName ?? "—"}</Text>
            <Text style={styles.infoPhone}>{customer?.phone ?? "—"}</Text>
            <Text style={styles.infoCode}>Customer ID: {customer?.customerCode ?? "—"}</Text>
          </View>
        </View>

        {/* Biometric toggle */}
        {biometricAvailable && (
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>বায়োমেট্রিক লগইন</Text>
              <Text style={styles.settingDesc}>ফিঙ্গারপ্রিন্ট / ফেস আনলক</Text>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={handleBiometricToggle}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor={biometricEnabled ? "#fff" : COLORS.textMuted}
            />
          </View>
        )}

        {/* Password change */}
        <TouchableOpacity style={styles.menuItem} onPress={() => setShowPwForm(!showPwForm)}>
          <Text style={styles.menuLabel}>পাসওয়ার্ড পরিবর্তন</Text>
          <Text style={styles.menuArrow}>{showPwForm ? "▲" : "▶"}</Text>
        </TouchableOpacity>

        {showPwForm && (
          <View style={styles.pwForm}>
            {pwError && <Text style={styles.errorText}>{pwError}</Text>}
            {pwSuccess && <Text style={styles.successText}>পাসওয়ার্ড পরিবর্তন হয়েছে</Text>}
            <TextInput
              style={styles.input}
              placeholder="বর্তমান পাসওয়ার্ড"
              placeholderTextColor={COLORS.textMuted}
              secureTextEntry
              value={currentPw}
              onChangeText={setCurrentPw}
            />
            <TextInput
              style={styles.input}
              placeholder="নতুন পাসওয়ার্ড"
              placeholderTextColor={COLORS.textMuted}
              secureTextEntry
              value={newPw}
              onChangeText={setNewPw}
            />
            <TextInput
              style={styles.input}
              placeholder="নতুন পাসওয়ার্ড নিশ্চিত করুন"
              placeholderTextColor={COLORS.textMuted}
              secureTextEntry
              value={confirmPw}
              onChangeText={setConfirmPw}
            />
            <TouchableOpacity style={styles.pwBtn} onPress={handleChangePassword} disabled={pwLoading}>
              {pwLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.pwBtnText}>পরিবর্তন করুন</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* App info */}
        <View style={styles.appInfo}>
          <Text style={styles.appInfoText}>ISP Nexus Mobile v1.0.0</Text>
          <Text style={styles.appInfoSub}>© 2026 Skynity Internet</Text>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>লগআউট</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16, gap: 12 },
  pageTitle: { color: COLORS.text, fontSize: 22, fontWeight: "700" },
  infoCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 20, flexDirection: "row", alignItems: "center", gap: 16, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#fff", fontSize: 24, fontWeight: "700" },
  infoBody: { flex: 1 },
  infoName: { color: COLORS.text, fontSize: 18, fontWeight: "700" },
  infoPhone: { color: COLORS.textMuted, fontSize: 14 },
  infoCode: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  settingRow: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  settingLabel: { color: COLORS.text, fontWeight: "600" },
  settingDesc: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  menuItem: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  menuLabel: { color: COLORS.text, fontWeight: "500" },
  menuArrow: { color: COLORS.textMuted },
  pwForm: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, gap: 10 },
  errorText: { color: COLORS.danger, fontSize: 13 },
  successText: { color: COLORS.success, fontSize: 13 },
  input: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, color: COLORS.text },
  pwBtn: { backgroundColor: COLORS.primary, borderRadius: 10, padding: 12, alignItems: "center" },
  pwBtnText: { color: "#fff", fontWeight: "600" },
  appInfo: { alignItems: "center", paddingVertical: 8 },
  appInfoText: { color: COLORS.textMuted, fontSize: 13 },
  appInfoSub: { color: COLORS.textMuted, fontSize: 11 },
  logoutBtn: { borderWidth: 1, borderColor: COLORS.danger, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
  logoutText: { color: COLORS.danger, fontWeight: "600", fontSize: 16 },
});
