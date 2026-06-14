import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLOURS } from "../constants/colours";

const { BG, WHITE, INPUT_BG, ACCENT } = COLOURS;

const BACKEND_URL = "http://192.168.0.200:3000"; // TODO: replace with your laptop IP

export default function Login({ navigation }) {
  const [step, setStep] = useState("email"); // "email" | "otp"
  const [email, setEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const otpRefs = useRef([]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const maskEmail = (e) => {
    const [local, domain] = e.split("@");
    return local[0] + "***@" + domain;
  };

  const handleSendOtp = async () => {
    if (!email.trim()) {
      Alert.alert("Email required", "Please enter your email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), mode: "login" }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 404) {
          Alert.alert(
            "No account found",
            "This email isn't registered. Would you like to create an account?",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Register", onPress: () => navigation.navigate("Register") },
            ]
          );
        } else {
          Alert.alert("Error", data.message || "Something went wrong.");
        }
        return;
      }

      setStep("otp");
      setCountdown(30);
    } catch (err) {
      Alert.alert("Network error", "Could not reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (text, index) => {
    const newDigits = [...otpDigits];
    newDigits[index] = text;
    setOtpDigits(newDigits);
    if (text && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyPress = ({ nativeEvent }, index) => {
    if (nativeEvent.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async () => {
    const otp = otpDigits.join("");
    if (otp.length < 6) {
      Alert.alert("Incomplete OTP", "Please enter all 6 digits.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), otp }),
      });
      const data = await res.json();

      if (!res.ok) {
        Alert.alert("Failed", data.message || "OTP verification failed.");
        return;
      }

      await AsyncStorage.setItem("token", data.token);
      await AsyncStorage.setItem("userEmail", email.trim());
      navigation.navigate("Home");
    } catch (err) {
      Alert.alert("Network error", "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  // ── Email step ──────────────────────────────────────────────────────────────
  if (step === "email") {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={WHITE} />

        <View style={styles.content}>
          <Text style={styles.title}>Hi, Welcome!</Text>

          <TextInput
            style={styles.input}
            placeholder="Email Address"
            placeholderTextColor="rgba(0,0,0,0.4)"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />

          {/* Log In — solid blue */}
          <TouchableOpacity
            style={styles.loginButton}
            onPress={handleSendOtp}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={WHITE} />
            ) : (
              <Text style={styles.loginButtonText}>Log In</Text>
            )}
          </TouchableOpacity>

          {/* Sign Up — outlined blue */}
          <TouchableOpacity
            style={styles.signUpButton}
            onPress={() => navigation.navigate("Register")}
            activeOpacity={0.85}
          >
            <Text style={styles.signUpButtonText}>Sign Up</Text>
          </TouchableOpacity>

          {/* Skip — plain grey text */}
          <TouchableOpacity
            onPress={() => navigation.navigate("SubmitObservation")}
            activeOpacity={0.7}
          >
            <Text style={styles.skipText}>
              Skip Login and Submit Observation
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── OTP step ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={WHITE} />

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => {
          setStep("email");
          setOtpDigits(["", "", "", "", "", ""]);
        }}
      >
        <Text style={styles.backButtonText}>← Change email</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.otpSubtitle}>
          We sent a 6-digit code to{"\n"}
          <Text style={styles.emailHighlight}>{maskEmail(email)}</Text>
        </Text>

        <View style={styles.otpRow}>
          {otpDigits.map((digit, i) => (
            <TextInput
              key={i}
              ref={(r) => (otpRefs.current[i] = r)}
              style={styles.otpBox}
              value={digit}
              onChangeText={(t) => handleOtpChange(t.slice(-1), i)}
              onKeyPress={(e) => handleOtpKeyPress(e, i)}
              keyboardType="number-pad"
              maxLength={1}
              textAlign="center"
            />
          ))}
        </View>

        <TouchableOpacity
          style={styles.loginButton}
          onPress={handleVerifyOtp}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={WHITE} />
          ) : (
            <Text style={styles.loginButtonText}>Verify & Continue</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { if (countdown === 0) handleSendOtp(); }}
          disabled={countdown > 0}
        >
          <Text style={[styles.skipText, countdown > 0 && { color: "#bbb" }]}>
            {countdown > 0 ? `Resend OTP in ${countdown}s` : "Resend OTP"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WHITE,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 44,
    paddingHorizontal: 28,
  },
  backButton: {
    paddingVertical: 12,
  },
  backButtonText: {
    color: ACCENT,
    fontSize: 14,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    gap: 14,
    marginTop: -40,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#000",
    backgroundColor: "#fafafa",
  },
  loginButton: {
    backgroundColor: BG,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
  },
  loginButtonText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "700",
  },
  signUpButton: {
    borderWidth: 2,
    borderColor: BG,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  signUpButtonText: {
    color: BG,
    fontSize: 16,
    fontWeight: "700",
  },
  skipText: {
    color: "#999",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 4,
  },
  otpSubtitle: {
    fontSize: 15,
    color: "#555",
    lineHeight: 22,
    marginBottom: 8,
  },
  emailHighlight: {
    color: "#1a1a1a",
    fontWeight: "600",
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginVertical: 4,
  },
  otpBox: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: "700",
    color: "#000",
    backgroundColor: "#fafafa",
  },
});