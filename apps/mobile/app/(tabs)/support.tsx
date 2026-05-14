import { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Modal, Linking, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { getMyTickets, getSupportInfo, openSupportTicket, type SupportTicket, type SupportInfo } from "@/lib/api";
import { COLORS } from "@/lib/constants";

export default function SupportScreen() {
  const { token, orgId } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [supportInfo, setSupportInfo] = useState<SupportInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // New ticket modal
  const [showModal, setShowModal] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !orgId) return;
    try {
      const [t, info] = await Promise.all([
        getMyTickets(token),
        getSupportInfo(orgId),
      ]);
      setTickets(t);
      setSupportInfo(info);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [token, orgId]);

  useEffect(() => { load(); }, [load]);

  const handleSubmitTicket = async () => {
    if (!subject.trim() || !message.trim()) {
      setSubmitError("বিষয় ও বার্তা দিন");
      return;
    }
    if (!token) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await openSupportTicket(token, subject.trim(), message.trim());
      setShowModal(false);
      setSubject("");
      setMessage("");
      load();
    } catch (e: any) {
      setSubmitError(e?.message ?? "টিকেট খোলা ব্যর্থ");
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor = (s: string) => {
    if (s === "open") return COLORS.primary;
    if (s === "in_progress") return COLORS.warning;
    if (s === "resolved" || s === "closed") return COLORS.success;
    return COLORS.textMuted;
  };

  const statusLabel = (s: string) => {
    if (s === "open") return "খোলা";
    if (s === "in_progress") return "প্রক্রিয়াধীন";
    if (s === "resolved") return "সমাধান হয়েছে";
    if (s === "closed") return "বন্ধ";
    return s;
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
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>সাপোর্ট</Text>
          <TouchableOpacity style={styles.newBtn} onPress={() => setShowModal(true)}>
            <Text style={styles.newBtnText}>+ নতুন টিকেট</Text>
          </TouchableOpacity>
        </View>

        {/* Contact options */}
        {supportInfo && (
          <>
            <Text style={styles.sectionTitle}>যোগাযোগ করুন</Text>
            <View style={styles.contactRow}>
              {supportInfo.callNumber && (
                <TouchableOpacity style={styles.contactBtn} onPress={() => Linking.openURL(`tel:${supportInfo.callNumber}`)}>
                  <Text style={styles.contactEmoji}>📞</Text>
                  <Text style={styles.contactLabel}>কল করুন</Text>
                </TouchableOpacity>
              )}
              {supportInfo.whatsappNumber && (
                <TouchableOpacity style={styles.contactBtn} onPress={() => Linking.openURL(`https://wa.me/${supportInfo.whatsappNumber?.replace(/\D/g, "")}`)}>
                  <Text style={styles.contactEmoji}>💬</Text>
                  <Text style={styles.contactLabel}>WhatsApp</Text>
                </TouchableOpacity>
              )}
              {supportInfo.supportEmail && (
                <TouchableOpacity style={styles.contactBtn} onPress={() => Linking.openURL(`mailto:${supportInfo.supportEmail}`)}>
                  <Text style={styles.contactEmoji}>✉️</Text>
                  <Text style={styles.contactLabel}>ইমেইল</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>আমার টিকেট ({tickets.length})</Text>
        {tickets.length === 0 && <Text style={styles.empty}>কোনো টিকেট নেই</Text>}
        {tickets.map(t => (
          <View key={t.id} style={styles.ticketCard}>
            <View style={styles.ticketHeader}>
              <Text style={styles.ticketSubject} numberOfLines={2}>{t.subject}</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColor(t.status) + "33" }]}>
                <Text style={[styles.statusText, { color: statusColor(t.status) }]}>{statusLabel(t.status)}</Text>
              </View>
            </View>
            <Text style={styles.ticketDate}>{new Date(t.createdAt).toLocaleDateString("bn-BD")}</Text>
          </View>
        ))}
      </ScrollView>

      {/* New ticket modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>নতুন সাপোর্ট টিকেট</Text>

            {submitError && <Text style={styles.errorText}>{submitError}</Text>}

            <TextInput
              style={styles.input}
              placeholder="বিষয়"
              placeholderTextColor={COLORS.textMuted}
              value={subject}
              onChangeText={setSubject}
            />
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder="বিস্তারিত সমস্যা বর্ণনা করুন..."
              placeholderTextColor={COLORS.textMuted}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelText}>বাতিল</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmitTicket} disabled={submitting}>
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.submitText}>পাঠান</Text>}
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
  pageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pageTitle: { color: COLORS.text, fontSize: 22, fontWeight: "700" },
  newBtn: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  newBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  sectionTitle: { color: COLORS.textMuted, fontSize: 12, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 8 },
  contactRow: { flexDirection: "row", gap: 10 },
  contactBtn: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, alignItems: "center", gap: 6, borderWidth: 1, borderColor: COLORS.border },
  contactEmoji: { fontSize: 22 },
  contactLabel: { color: COLORS.text, fontSize: 12, fontWeight: "500" },
  empty: { color: COLORS.textMuted, textAlign: "center" },
  ticketCard: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  ticketHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  ticketSubject: { flex: 1, color: COLORS.text, fontWeight: "600" },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: "600" },
  ticketDate: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  overlay: { flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 12 },
  modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: "700" },
  errorText: { color: COLORS.danger, fontSize: 13 },
  input: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, color: COLORS.text },
  textarea: { height: 120 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 14, alignItems: "center" },
  cancelText: { color: COLORS.textMuted },
  submitBtn: { flex: 2, backgroundColor: COLORS.primary, borderRadius: 10, padding: 14, alignItems: "center" },
  submitText: { color: "#fff", fontWeight: "600" },
});
