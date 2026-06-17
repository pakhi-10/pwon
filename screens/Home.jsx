import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Platform,
} from "react-native";
import { COLOURS } from "../constants/colours";

const { BG, BG_DARK, WHITE, ACCENT } = COLOURS;

export default function Home({ navigation }) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BG_DARK} />

      <View style={styles.header}>
        <Text style={styles.appName}>PWON</Text>
        <Text style={styles.tagline}>Public Weather Observation Network</Text>
      </View>

      <View style={styles.buttonArea}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate("SubmitObservation")}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonIcon}>🌦️</Text>
          <Text style={styles.primaryButtonText}>Submit Observation</Text>
        </TouchableOpacity>

        {/* ── Additional navigation ── */}
<TouchableOpacity
  style={styles.secondaryButton}
  onPress={() => navigation.navigate("MySubmissions")}
  activeOpacity={0.8}
>
  <Text style={styles.secondaryButtonIcon}>📋</Text>
  <Text style={styles.secondaryButtonText}>My Submissions</Text>
</TouchableOpacity>

<TouchableOpacity
  style={styles.secondaryButton}
  onPress={() => navigation.navigate("Feedback")}
  activeOpacity={0.8}
>
  <Text style={styles.secondaryButtonIcon}>💬</Text>
  <Text style={styles.secondaryButtonText}>Feedback</Text>
</TouchableOpacity>

<TouchableOpacity
  style={styles.secondaryButton}
  onPress={() => navigation.navigate("ContactUs")}
  activeOpacity={0.8}
>
  <Text style={styles.secondaryButtonIcon}>📞</Text>
  <Text style={styles.secondaryButtonText}>Contact Us</Text>
</TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 44,
    paddingHorizontal: 24,
  },
  header: {
    marginTop: 32,
    marginBottom: 48,
  },
  appName: {
    fontSize: 36,
    fontWeight: "900",
    color: WHITE,
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    marginTop: 4,
  },
  buttonArea: {
    flex: 1,
    justifyContent: "center",
    gap: 16,
    marginBottom: 80,
  },
  primaryButton: {
    backgroundColor: WHITE,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  primaryButtonIcon: {
    fontSize: 28,
  },
  primaryButtonText: {
    color: BG,
    fontSize: 18,
    fontWeight: "700",
  },
  secondaryButton: {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "rgba(255,255,255,0.08)",
  borderRadius: 12,
  paddingVertical: 14,
  paddingHorizontal: 18,
  marginTop: 10,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
},
secondaryButtonIcon: {
  fontSize: 18,
  marginRight: 12,
},
secondaryButtonText: {
  color: WHITE,
  fontSize: 15,
  fontWeight: "500",
},
});