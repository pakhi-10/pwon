import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  ActivityIndicator,
  Image,
  FlatList,
  RefreshControl,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLOURS } from "../constants/colours";

const { BG, BG_DARK, WHITE, ACCENT, REQUIRED_RED } = COLOURS;

const BACKEND_URL = "http://103.215.208.67:3000";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(timeStr) {
  if (!timeStr) return "";
  // Postgres TIME columns usually come back as "14:30:00"
  return timeStr.slice(0, 5);
}

export default function MySubmissions({ navigation }) {
  const [observations, setObservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = useCallback(async () => {
    setError("");
    try {
      const userEmail = await AsyncStorage.getItem("userEmail");
      if (!userEmail) {
        setError("Please log in to view your submissions.");
        setObservations([]);
        return;
      }

      const res = await fetch(
        `${BACKEND_URL}/observations/user/${encodeURIComponent(userEmail)}`
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Failed to load submissions.");
        return;
      }

      setObservations(data.observations || []);
    } catch (err) {
      setError("Could not reach the server. Pull down to try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSubmissions();
  };

  const renderItem = ({ item }) => {
    const hasPhoto = item.photoDirPath && item.photoDirPath.length > 0;
    const hasVideo = !!item.videoDirPath;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate("SubmissionDetail", { observation: item })}
      >
        <View style={styles.cardThumbWrap}>
          {hasPhoto ? (
            <Image source={{ uri: item.photoDirPath[0] }} style={styles.cardThumb} />
          ) : (
            <View style={[styles.cardThumb, styles.cardThumbPlaceholder]}>
              <Text style={styles.cardThumbIcon}>{hasVideo ? "🎥" : "🌦️"}</Text>
            </View>
          )}
          {hasPhoto && hasVideo && (
            <View style={styles.videoBadge}>
              <Text style={styles.videoBadgeText}>🎥</Text>
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardPhenom} numberOfLines={1}>
            {item.phenom || "Weather observation"}
          </Text>
          <Text style={styles.cardLocation} numberOfLines={1}>
            {item.district}, {item.state}
          </Text>
          <View style={styles.cardMetaRow}>
            <Text style={styles.cardMeta}>{formatDate(item.upload_date)}</Text>
            <Text style={styles.cardMetaDot}>•</Text>
            <Text style={styles.cardMeta}>{formatTime(item.upload_time)}</Text>
          </View>
          {item.damage && item.damage !== "No Damage" && (
            <View style={styles.damagePill}>
              <Text style={styles.damagePillText}>{item.damage}</Text>
            </View>
          )}
        </View>

        <Text style={styles.cardChevron}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Submissions</Text>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={ACCENT} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centerFill}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchSubmissions}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : observations.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>No submissions yet</Text>
          <Text style={styles.emptySubtitle}>
            Observations you submit will show up here.
          </Text>
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={() => navigation.navigate("SubmitObservation")}
          >
            <Text style={styles.submitBtnText}>Submit an Observation</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={observations}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={WHITE} />
          }
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 44,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: BG,
  },
  backBtn: { marginRight: 12, padding: 4 },
  backArrow: { color: WHITE, fontSize: 22 },
  headerTitle: { color: WHITE, fontSize: 20, fontWeight: "500" },

  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  errorText: {
    color: "#ffcdd2",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: ACCENT,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryBtnText: { color: WHITE, fontSize: 14, fontWeight: "600" },

  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: WHITE, fontSize: 18, fontWeight: "700", marginBottom: 6 },
  emptySubtitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 19,
  },
  submitBtn: {
    backgroundColor: ACCENT,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 13,
  },
  submitBtnText: { color: WHITE, fontSize: 14, fontWeight: "600" },

  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BG_DARK,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardThumbWrap: { position: "relative", marginRight: 12 },
  cardThumb: { width: 64, height: 64, borderRadius: 8 },
  cardThumbPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardThumbIcon: { fontSize: 26 },
  videoBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    backgroundColor: BG,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  videoBadgeText: { fontSize: 10 },

  cardBody: { flex: 1 },
  cardPhenom: { color: WHITE, fontSize: 15, fontWeight: "600", marginBottom: 3 },
  cardLocation: { color: "rgba(255,255,255,0.65)", fontSize: 13, marginBottom: 4 },
  cardMetaRow: { flexDirection: "row", alignItems: "center" },
  cardMeta: { color: "rgba(255,255,255,0.45)", fontSize: 12 },
  cardMetaDot: { color: "rgba(255,255,255,0.3)", fontSize: 12, marginHorizontal: 6 },
  damagePill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,82,82,0.15)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  damagePillText: { color: REQUIRED_RED, fontSize: 11, fontWeight: "600" },

  cardChevron: { color: "rgba(255,255,255,0.3)", fontSize: 26, marginLeft: 6 },
});