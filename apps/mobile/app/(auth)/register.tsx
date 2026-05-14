import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { COLORS } from "@/lib/constants";

export default function RegisterScreen() {
  const router = useRouter();
  const { login } = useAuth();

  const [form, setForm] = useState({ fullName: "", phone: "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (val: string) => setForm(f => ({ ...f, [key]: val }));

  const handleRegister = async () => {
    if (!form.fullName.trim() || !form.phone.trim() || !form.password) {
      setError("সব তথ্য পূরণ করুন");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("পাসওয়ার্ড মিলছে না");
      return;
    }
    if (form.password.length < 6) {
      setError("পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(form.phone.trim(), form.password);
      router.replace("/(tabs)/");
    } catch (e: any) {
      setError(e?.message ?? "নিবন্ধন ব্যর্থ হয়েছে");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.title}>নতুন অ্যাকাউন্ট</Text>
          <Text style={styles.subtitle}>ISP Nexus কাস্টমার পোর্টাল</Text>

          {error && <Text style={styles.error}>{error}</Text>}

          {(["fullName", "phone", "password", "confirmPassword"] as const).map((key) => (
            <TextInput
              key={key}
              style={styles.input}
              placeholder={
                key === "fullName" ? "পূর্ণ নাম" :
                key === "phone" ? "ফোন নম্বর" :
                key === "password" ? "পাসওয়ার্ড" : "পাসওয়ার্ড নিশ্চিত করুন"
              }
              placeholderTextColor={COLORS.textMuted}
              value={form[key]}
              onChangeText={set(key)}
              secureTextEntry={key === "password" || key === "confirmPassword"}
              keyboardType={key === "phone" ? "phone-pad" : "default"}
            />
          ))}

          <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>নিবন্ধন করুন</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.link}>লগইনে ফিরুন</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  card: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "700", color: COLORS.text, textAlign: "center" },
  subtitle: { fontSize: 13, color: COLORS.textMuted, textAlign: "center", marginBottom: 8 },
  error: { color: COLORS.danger, fontSize: 13, textAlign: "center", backgroundColor: "#7f1d1d33", padding: 8, borderRadius: 8 },
  input: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 14, fontSize: 16, color: COLORS.text },
  btn: { backgroundColor: COLORS.primary, borderRadius: 10, padding: 14, alignItems: "center", marginTop: 4 },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  link: { color: COLORS.primary, textAlign: "center", fontSize: 14 },
});
