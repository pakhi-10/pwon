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

export default function SplashScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BG_DARK} />

      {/* Logo / Title area */}
      <View style={styles.heroSection}>
        <Text style={styles.logo}>🌦️</Text>
        <Text style={styles.title}>PWON</Text>
        <Text style={styles.subtitle}>Public Weather Observation Network</Text>
        <Text style={styles.tagline}>
          Help India's meteorologists with real-time ground reports
        </Text>
      </View>

      {/* Action buttons */}
      <View style={styles.buttonSection}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate("Login")}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>Log In</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate("Register")}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryButtonText}>Create Account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate("SubmitObservation")}
          activeOpacity={0.7}
        >
          <Text style={styles.skipText}>
            Skip — Submit an observation anonymously
          </Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <Text style={styles.footer}>
        Powered by India Meteorological Department
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 44,
    paddingHorizontal: 28,
    paddingBottom: 32,
    justifyContent: "space-between",
  },
  heroSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    fontSize: 72,
    marginBottom: 8,
  },
  title: {
    fontSize: 42,
    fontWeight: "800",
    color: WHITE,
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 15,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 4,
    paddingHorizontal: 16,
  },
  buttonSection: {
    gap: 14,
    paddingBottom: 8,
  },
  primaryButton: {
    backgroundColor: WHITE,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonText: {
    color: BG,
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    borderWidth: 2,
    borderColor: WHITE,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "700",
  },
  skipText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 6,
  },
  footer: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 11,
    textAlign: "center",
    marginTop: 16,
  },
});