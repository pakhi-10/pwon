import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  StatusBar,
  Image,
  Alert,
  Linking,
} from "react-native";
import { COLOURS } from "../constants/colours";

const { BG, BG_DARK, WHITE, INPUT_BG, REQUIRED_RED, ACCENT } = COLOURS;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(timeStr) {
  if (!timeStr) return "—";
  return timeStr.slice(0, 5);
}

// Read-only version of the input boxes used in SubmitObservation.jsx
function ReadOnlyField({ value }) {
  return (
    <View style={styles.input}>
      <Text style={styles.inputValueText}>{value || "—"}</Text>
    </View>
  );
}

export default function SubmissionDetail({ route, navigation }) {
  const { observation } = route.params || {};

  if (!observation) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Observation</Text>
        </View>
        <View style={styles.centerFill}>
          <Text style={styles.errorText}>This observation could not be loaded.</Text>
        </View>
      </View>
    );
  }

  const {
    phenom,
    observation: description,
    state,
    district,
    damage,
    upload_date,
    upload_time,
    user,
    photoDirPath,
    videoDirPath,
  } = observation;

  const phenomenaList = phenom
    ? phenom.split(",").map((p) => p.trim()).filter(Boolean)
    : [];

  const photos = Array.isArray(photoDirPath) ? photoDirPath : [];

  async function handleOpenVideo() {
    if (!videoDirPath) return;
    try {
      const supported = await Linking.canOpenURL(videoDirPath);
      if (supported) {
        await Linking.openURL(videoDirPath);
      } else {
        Alert.alert(
          "No video player found",
          "Install a video player app to view this file, or download it from a browser."
        );
      }
    } catch (err) {
      Alert.alert("Error", "Could not open the video.");
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Observation Details</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* ── LOCATION ──────────────────────────────────────────────────── */}
        <Text style={styles.label}>State</Text>
        <ReadOnlyField value={state} />

        <Text style={styles.label}>District</Text>
        <ReadOnlyField value={district} />

        <Text style={styles.label}>Date of Weather Event</Text>
        <ReadOnlyField value={formatDate(upload_date)} />

        <Text style={styles.label}>Time of Weather Event</Text>
        <ReadOnlyField value={formatTime(upload_time)} />

        {/* ── WEATHER PHENOMENA ──────────────────────────────────────────── */}
        <Text style={styles.label}>Weather Phenomena</Text>
        <View style={styles.selectedTagsRow}>
          {phenomenaList.length > 0 ? (
            phenomenaList.map((p, i) => (
              <View key={i} style={styles.selectedTag}>
                <Text style={styles.selectedTagText}>{p}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.mutedText}>None recorded</Text>
          )}
        </View>

        {/* DAMAGE CAUSED */}
        <Text style={styles.label}>Damage Caused</Text>
        <ReadOnlyField value={damage} />

        {/* DESCRIPTION */}
        <Text style={styles.label}>Observation Notes</Text>
        <View style={styles.textAreaWrapper}>
          <Text style={styles.textAreaValue}>{description || "No additional notes."}</Text>
        </View>

        {/* ── PHOTOS ────────────────────────────────────────────────────── */}
        <Text style={styles.label}>
          Photos <Text style={styles.labelNote}>({photos.length})</Text>
        </Text>
        {photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
            {photos.map((url, i) => (
              <Image key={i} source={{ uri: url }} style={styles.thumbImg} />
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.mutedText}>No photos attached.</Text>
        )}

        {/* ── VIDEO ─────────────────────────────────────────────────────── */}
        <Text style={styles.label}>Video</Text>
        {videoDirPath ? (
          <TouchableOpacity style={styles.videoRow} onPress={handleOpenVideo} activeOpacity={0.8}>
            <Text style={styles.videoName} numberOfLines={1}>🎥 Tap to play video</Text>
            <Text style={styles.videoOpenText}>Open ↗</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.mutedText}>No video attached.</Text>
        )}

        {/* SUBMITTED BY */}
        {user ? (
          <Text style={styles.submittedByText}>Submitted by {user}</Text>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>
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
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: BG,
  },
  backBtn: { marginRight: 12, padding: 4 },
  backArrow: { color: WHITE, fontSize: 22 },
  headerTitle: { color: WHITE, fontSize: 20, fontWeight: "500" },
  scroll: { flex: 1, backgroundColor: BG },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },

  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  errorText: { color: "#ffcdd2", fontSize: 14, textAlign: "center" },

  label: { color: WHITE, fontSize: 14, marginBottom: 6, marginTop: 14 },
  labelNote: { color: "#aaa", fontSize: 12, fontWeight: "400" },
  mutedText: { color: "rgba(255,255,255,0.4)", fontSize: 13, fontStyle: "italic", marginTop: 2 },

  input: {
    backgroundColor: INPUT_BG, borderRadius: 6,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  inputValueText: { fontSize: 16, color: "#222" },

  selectedTagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  selectedTag: {
    backgroundColor: ACCENT, alignSelf: "flex-start",
    borderRadius: 4, paddingHorizontal: 12, paddingVertical: 6,
  },
  selectedTagText: { color: WHITE, fontSize: 13 },

  textAreaWrapper: { backgroundColor: INPUT_BG, borderRadius: 6, minHeight: 100 },
  textAreaValue: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#222", lineHeight: 21 },

  photoRow: { flexDirection: "row", marginTop: 4, marginBottom: 4 },
  thumbImg: { width: 110, height: 110, borderRadius: 8, marginRight: 10 },

  videoRow: {
    backgroundColor: BG_DARK, borderRadius: 8, padding: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  videoName: { color: WHITE, fontSize: 14, flex: 1, marginRight: 8 },
  videoOpenText: { color: "#90caf9", fontSize: 13, fontWeight: "600" },

  submittedByText: {
    color: "rgba(255,255,255,0.35)", fontSize: 12, textAlign: "center", marginTop: 28,
  },
});