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
  ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { COLOURS } from "../constants/colours";

const { BG, BG_DARK, WHITE, INPUT_BG, ACCENT, REQUIRED_RED } = COLOURS;

const BACKEND_URL = "http://192.168.0.200:3000"; // TODO: replace with your laptop IP

export default function Register({ navigation }) {
  const [step, setStep] = useState("details"); // "details" | "otp" | "location"

  // Step 1: details
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [username, setUsername] = useState("");
  const [mobNo, setMobNo] = useState("");
  const [emailError, setEmailError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [usernameChecking, setUsernameChecking] = useState(false);

  // Step 2: OTP
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [countdown, setCountdown] = useState(0);

  // Step 3: Location
  const [pincode, setPincode] = useState("");
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [pincodeLoading, setPincodeLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const otpRefs = useRef([]);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const maskEmail = (e) => {
    const [local, domain] = e.split("@");
    return local[0] + "***@" + domain;
  };

  // ── Username: check uniqueness on blur ──────────────────────────────────────
  const handleUsernameBlur = async () => {
    setUsernameError("");
    const u = username.trim();

    if (!u) return; // required check happens on submit
    if (u.length < 5) {
      setUsernameError("Username must be at least 5 characters.");
      return;
    }
    if (u.length > 50) {
      setUsernameError("Username must be under 50 characters.");
      return;
    }
    // Only letters, numbers, underscores — no spaces or special chars
    if (!/^[a-zA-Z0-9_]+$/.test(u)) {
      setUsernameError("Only letters, numbers, and underscores allowed.");
      return;
    }

    setUsernameChecking(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/auth/check-username?username=${encodeURIComponent(u)}`
      );
      const data = await res.json();
      if (!res.ok || data.taken) {
        setUsernameError("This username is already taken.");
      }
    } catch {
      // Silent — don't block user if network is flaky; server will catch at submit
    } finally {
      setUsernameChecking(false);
    }
  };

  // ── Step 1: Send OTP ────────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    setEmailError("");
    setUsernameError("");

    // Validate email
    if (!email.trim()) {
      setEmailError("Email is required.");
      return;
    }
    if (email.trim() !== confirmEmail.trim()) {
      setEmailError("Emails do not match.");
      return;
    }

    // Validate username
    if (!username.trim()) {
      setUsernameError("Username is required.");
      return;
    }
    if (username.trim().length < 5) {
      setUsernameError("Username must be at least 5 characters.");
      return;
    }
    if (username.trim().length > 50) {
      setUsernameError("Username must be under 50 characters.");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      setUsernameError("Only letters, numbers, and underscores allowed.");
      return;
    }

    // Validate mobile (optional field)
    if (mobNo && mobNo.length !== 10) {
      Alert.alert("Invalid mobile number", "Mobile number must be exactly 10 digits.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          username: username.trim(),
          mode: "register",
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          // Already registered
          Alert.alert(
            "Already registered",
            "This email already has an account. Please log in.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Log In", onPress: () => navigation.navigate("Login") },
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
      Alert.alert("Network error", "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify OTP ──────────────────────────────────────────────────────
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

      // Save token — user is now authenticated
      await AsyncStorage.setItem("token", data.token);
      await AsyncStorage.setItem("userEmail", email.trim());

      // Move to location step
      setStep("location");
    } catch (err) {
      Alert.alert("Network error", "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setOtpDigits(["", "", "", "", "", ""]);
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // TODO Week 3: add a dedicated /auth/resend-otp endpoint
        body: JSON.stringify({ email: email.trim(), mode: "resend" }),
      });
      setCountdown(30);
    } catch (err) {
      Alert.alert("Network error", "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Location ────────────────────────────────────────────────────────

  // Try GPS + Nominatim reverse geocoding
  const detectLocationFromGps = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log("GPS permission status:", status);
      if (status !== "granted") {
        setLocationLoading(false);
        return;
      }

      let coords = null;

      try {
        const last = await Location.getLastKnownPositionAsync({
          maxAge: 5 * 60 * 1000,
        });
        console.log("Last known position:", last);
        if (last) coords = last.coords;
      } catch (_) {}

      if (!coords) {
        try {
          const pos = await Promise.race([
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), 15000)
            ),
          ]);
          coords = pos.coords;
        } catch (_) {}
      }

      console.log("Final coords:", coords);

      if (!coords) {
        setLocationLoading(false);
        return;
      }

      const nominatimRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}`,
        { headers: { "User-Agent": "PWON-IMD-App/1.0" } }
      );
      const nominatimData = await nominatimRes.json();
      console.log("Nominatim response:", nominatimData);

      const addr = nominatimData.address || {};
      const detectedState = addr.state || addr.city || "";
      const detectedDistrict =
        addr.county || addr.district || addr.city_district || addr.suburb || addr.city || "";
      const detectedPincode = addr.postcode || "";

      console.log("Detected:", detectedState, detectedDistrict, detectedPincode);

      if (detectedState) setState(detectedState);
      if (detectedDistrict) setDistrict(detectedDistrict);
      if (detectedPincode) setPincode(detectedPincode);
    } catch (err) {
      console.log("GPS error:", err.message);
    } finally {
      setLocationLoading(false);
    }
  };

  // Pincode → district + state via India Post API (proxied through our backend)
  const handlePincodeChange = async (text) => {
    setPincode(text);
    if (text.length !== 6) return;

    setPincodeLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/location/pincode/${text}`);
      const data = await res.json();
      if (res.ok) {
        console.log("Pincode data:", data);
        setState(data.state || "");
        setDistrict(data.district || "");
      }
    } catch (_) {
      // Silent fail — user can still proceed
    } finally {
      setPincodeLoading(false);
    }
  };

  const handleCompleteRegistration = async () => {
    if (!state || !district) {
      Alert.alert(
        "Location required",
        "Please enter your pincode so we can detect your state and district."
      );
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/auth/complete-registration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          username: username.trim(),
          mobNo: mobNo || null,
          state,
          district,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        Alert.alert("Error", data.message || "Failed to save details.");
        return;
      }

      // Save location to AsyncStorage for SubmitObservation auto-fill
      await AsyncStorage.setItem("savedState", state);
      await AsyncStorage.setItem("savedDistrict", district);
      await AsyncStorage.setItem("username", username.trim());

      navigation.navigate("Home");
    } catch (err) {
      Alert.alert("Network error", "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  // ── Render: Details step ────────────────────────────────────────────────────
  if (step === "details") {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>
            Join the network of weather observers
          </Text>

          <Text style={styles.label}>
            Email <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Email address"
            placeholderTextColor="rgba(0,0,0,0.4)"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>
            Confirm Email <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, emailError ? styles.inputError : null]}
            placeholder="Re-enter email address"
            placeholderTextColor="rgba(0,0,0,0.4)"
            keyboardType="email-address"
            autoCapitalize="none"
            value={confirmEmail}
            onChangeText={setConfirmEmail}
          />
          {emailError ? (
            <Text style={styles.errorText}>{emailError}</Text>
          ) : null}

          <Text style={styles.label}>
            Username <Text style={styles.required}>*</Text>
          </Text>
          {/* usernameRow keeps the spinner inline with the input */}
          <View style={styles.usernameRow}>
            <TextInput
              style={[
                styles.input,
                { flex: 1 },
                usernameError ? styles.inputError : null,
              ]}
              placeholder="min 5 chars, letters / numbers / _"
              placeholderTextColor="rgba(0,0,0,0.4)"
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={(t) => {
                setUsername(t);
                setUsernameError("");
              }}
              onBlur={handleUsernameBlur}
              maxLength={50}
            />
            {/* Spinner appears while uniqueness check is in flight */}
            {usernameChecking && (
              <ActivityIndicator
                size="small"
                color={WHITE}
                style={{ marginLeft: 10 }}
              />
            )}
          </View>
          {usernameError ? (
            <Text style={styles.errorText}>{usernameError}</Text>
          ) : null}

          <Text style={styles.label}>
            Mobile Number{" "}
            <Text style={styles.optional}>(optional)</Text>
          </Text>
          <View style={styles.phoneRow}>
            <View style={styles.countryCode}>
              <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
            </View>
            <TextInput
              style={[styles.input, styles.phoneInput]}
              placeholder="10-digit number"
              placeholderTextColor="rgba(0,0,0,0.4)"
              keyboardType="phone-pad"
              maxLength={10}
              value={mobNo}
              onChangeText={setMobNo}
            />
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleSendOtp}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={BG} />
            ) : (
              <Text style={styles.primaryButtonText}>Send OTP</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate("Login")}>
            <Text style={styles.linkText}>
              Already have an account?{" "}
              <Text style={styles.linkTextBold}>Log In</Text>
            </Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Render: OTP step ────────────────────────────────────────────────────────
  if (step === "otp") {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={BG_DARK} />

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            setStep("details");
            setOtpDigits(["", "", "", "", "", ""]);
          }}
        >
          <Text style={styles.backButtonText}>← Change email</Text>
        </TouchableOpacity>

        <View style={styles.centeredContent}>
          <Text style={styles.title}>Verify your email</Text>
          <Text style={styles.subtitle}>
            We sent a code to{"\n"}
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
            style={styles.primaryButton}
            onPress={handleVerifyOtp}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={BG} />
            ) : (
              <Text style={styles.primaryButtonText}>Verify & Continue</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleResendOtp} disabled={countdown > 0}>
            <Text
              style={[styles.linkText, countdown > 0 && styles.linkTextDisabled]}
            >
              {countdown > 0 ? `Resend OTP in ${countdown}s` : "Resend OTP"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Render: Location step ───────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <StatusBar barStyle="light-content" backgroundColor={BG_DARK} />

        <Text style={styles.title}>Your location</Text>
        <Text style={styles.subtitle}>
          This will be auto-filled when you submit observations. You can always
          change it.
        </Text>

        {locationLoading && (
          <View style={styles.detectingRow}>
            <ActivityIndicator color={WHITE} size="small" />
            <Text style={styles.detectingText}>Detecting your location…</Text>
          </View>
        )}

        <Text style={styles.label}>
          Pincode <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.pincodeRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="6-digit pincode"
            placeholderTextColor="rgba(0,0,0,0.4)"
            keyboardType="number-pad"
            maxLength={6}
            value={pincode}
            onChangeText={handlePincodeChange}
          />
          {pincodeLoading && (
            <ActivityIndicator
              color={WHITE}
              size="small"
              style={{ marginLeft: 12 }}
            />
          )}
        </View>

        <Text style={styles.label}>State</Text>
        <View style={styles.autoFilledInput}>
          <Text style={state ? styles.autoFilledText : styles.autoFilledPlaceholder}>
            {state || "Auto-filled from pincode"}
          </Text>
        </View>

        <Text style={styles.label}>District</Text>
        <View style={styles.autoFilledInput}>
          <Text style={district ? styles.autoFilledText : styles.autoFilledPlaceholder}>
            {district || "Auto-filled from pincode"}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.retryGpsButton}
          onPress={detectLocationFromGps}
          disabled={locationLoading}
        >
          <Text style={styles.retryGpsText}>📍 Detect via GPS instead</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.primaryButton,
            (!state || !district) && styles.primaryButtonDisabled,
          ]}
          onPress={handleCompleteRegistration}
          disabled={loading || !state || !district}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={BG} />
          ) : (
            <Text style={styles.primaryButtonText}>Complete Registration</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 44,
    paddingHorizontal: 24,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  backButton: {
    paddingVertical: 12,
  },
  backButtonText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
  },
  centeredContent: {
    flex: 1,
    justifyContent: "center",
    gap: 16,
    marginTop: -60,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: WHITE,
    marginBottom: 4,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 15,
    color: "rgba(255,255,255,0.65)",
    lineHeight: 22,
    marginBottom: 8,
  },
  emailHighlight: {
    color: WHITE,
    fontWeight: "600",
  },
  label: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 14,
  },
  required: {
    color: REQUIRED_RED,
  },
  optional: {
    color: "rgba(255,255,255,0.4)",
    fontWeight: "400",
  },
  input: {
    backgroundColor: INPUT_BG,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#000",
  },
  inputError: {
    borderWidth: 1.5,
    borderColor: REQUIRED_RED,
  },
  errorText: {
    color: REQUIRED_RED,
    fontSize: 12,
    marginTop: 4,
  },
  usernameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  phoneRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  countryCode: {
    backgroundColor: INPUT_BG,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  countryCodeText: {
    fontSize: 15,
    color: "#000",
  },
  phoneInput: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: WHITE,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 20,
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  primaryButtonText: {
    color: BG,
    fontSize: 16,
    fontWeight: "700",
  },
  linkText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 8,
    marginTop: 4,
  },
  linkTextBold: {
    color: WHITE,
    fontWeight: "700",
  },
  linkTextDisabled: {
    color: "rgba(255,255,255,0.3)",
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginVertical: 8,
  },
  otpBox: {
    flex: 1,
    backgroundColor: INPUT_BG,
    borderRadius: 10,
    paddingVertical: 16,
    fontSize: 22,
    fontWeight: "700",
    color: "#000",
  },
  detectingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 8,
  },
  detectingText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
  },
  pincodeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  autoFilledInput: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  autoFilledText: {
    fontSize: 15,
    color: WHITE,
  },
  autoFilledPlaceholder: {
    fontSize: 15,
    color: "rgba(255,255,255,0.3)",
    fontStyle: "italic",
  },
  retryGpsButton: {
    paddingVertical: 10,
    marginTop: 8,
  },
  retryGpsText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    textAlign: "center",
  },
});