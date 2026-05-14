import { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { COLORS } from "@/lib/constants";

export default function LoginScreen() {
  const router = useRouter();
  const { login, loginWithBiometric, biometricAvailable, biometricEnabled, status } = useAuth();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-trigger biometric on mount if enabled
  useEffect(() => {
    if (biometricAvailable && biometricEnabled) {
      handleBiometric();
    }
  }, [biometricAvailable, biometricEnabled]);

  const handleLogin = async () => {
    if (!phone.trim() || !password.trim()) {
      setError("ফোন নম্বর ও পাসওয়ার্ড দিন");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(phone.trim(), password);
      router.replace("/(tabs)/");
    } catch (e: any) {
      setError(e?.message ?? "লগইন ব্যর্থ হয়েছে");
    } finally {
      setLoading(false);
    }
  };

  const handleBiometric = async () => {
    const ok = await loginWithBiometric();
    if (ok) router.replace("/(tabs)/");
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>ISP Nexus</Text>
        <Text style={styles.subtitle}>কাস্টমার পোর্টাল</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <TextInput
          style={styles.input}
          placeholder="ফোন নম্বর"
          placeholderTextColor={COLORS.textMuted}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          returnKeyType="next"
        />
        <TextInput
          style={styles.input}
          placeholder="পাসওয়ার্ড"
          placeholderTextColor={COLORS.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="go"
          onSubmitEditing={handleLogin}
        />

        <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>লগইন করুন</Text>}
        </TouchableOpacity>

        {biometricAvailable && biometricEnabled && (
          <TouchableOpacity style={styles.bioBtn} onPress={handleBiometric}>
            <Text style={styles.bioBtnText}>বায়োমেট্রিক দিয়ে প্রবেশ</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => router.push("/(auth)/register")}>
          <Text style={styles.link}>নতুন অ্যাকাউন্ট তৈরি করুন</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    marginBottom: 8,
  },
  error: {
    color: COLORS.danger,
    fontSize: 13,
    textAlign: "center",
    backgroundColor: "#7f1d1d33",
    padding: 8,
    borderRadius: 8,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
  },
  btn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginTop: 4,
  },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  bioBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  bioBtnText: { color: COLORS.primary, fontWeight: "500" },
  link: { color: COLORS.primary, textAlign: "center", fontSize: 14, marginTop: 4 },
});
