import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  StatusBar,
  ActivityIndicator,
  Image,
  Alert,
  Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { COLOURS } from "../constants/colours";

const { BG, BG_DARK, WHITE, INPUT_BG, REQUIRED_RED, ACCENT } = COLOURS;

const BACKEND_URL = "http://103.215.208.67:3000";

// ─── Motivational messages (randomly pick one on each submission) ─────────────
const SUCCESS_MESSAGES = [
  "You just made India's weather network a little stronger.",
  "Every report counts. Thank you for contributing to India."
];

// ─── Phenomena options ────────────────────────────────────────────────────────
const GRID_PHENOMENA = [
  { id: "Rainfall",               emoji: "🌧️", label: "Rainfall" },
  { id: "Thunderstorm/Lightning", emoji: "⛈️", label: "Thunderstorm/\nLightning" },
  { id: "Snowfall",               emoji: "❄️", label: "Snowfall" },
  { id: "Fog",                    emoji: "🌫️", label: "Fog" },
];

const OTHER_PHENOMENA = [
  "Heatwave",
  "Coldwave",
  "Hailstorm",
  "Strong Winds",
  "Specify below",
];

const DAMAGE_OPTIONS = [
  "No Damage",
  "Property Damage",
  "Crop Damage",
  "Flooding",
  "Road Blocked",
  "Power Outage",
  "Other",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTodayDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getCurrentTime() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${min}`;
}

async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    const json = await res.json();
    const addr = json.address || {};
    const district =
      addr.county || addr.district || addr.city_district || addr.suburb || addr.city || "";
    const state = addr.state || "";
    return { state, district };
  } catch {
    return null;
  }
}

function generateCaptcha() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { a, b, answer: a + b };
}

function getRandomMessage() {
  return SUCCESS_MESSAGES[Math.floor(Math.random() * SUCCESS_MESSAGES.length)];
}

// ─── Success Overlay Component ────────────────────────────────────────────────
function SuccessOverlay({ message, onDone }) {
  // Three separate animations: fade-in the overlay, draw the circle, draw the tick
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const circleScale  = useRef(new Animated.Value(0)).current;
  const tickOpacity  = useRef(new Animated.Value(0)).current;
  const tickScale    = useRef(new Animated.Value(0.4)).current;
  const messageOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      // 1. Fade in the dark overlay
      Animated.timing(overlayOpacity, {
        toValue: 1, duration: 250, useNativeDriver: true,
      }),
      // 2. Pop the green circle in
      Animated.spring(circleScale, {
        toValue: 1, friction: 5, tension: 100, useNativeDriver: true,
      }),
      // 3. Fade + scale the tick mark in
      Animated.parallel([
        Animated.timing(tickOpacity, {
          toValue: 1, duration: 200, useNativeDriver: true,
        }),
        Animated.spring(tickScale, {
          toValue: 1, friction: 5, tension: 120, useNativeDriver: true,
        }),
      ]),
      // 4. Fade in the message text
      Animated.timing(messageOpacity, {
        toValue: 1, duration: 300, useNativeDriver: true,
      }),
    ]).start();

    // Auto-navigate to Home after 2.6 s
    const timer = setTimeout(onDone, 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.successOverlay, { opacity: overlayOpacity }]}>
      {/* Animated green circle */}
      <Animated.View style={[styles.successCircle, { transform: [{ scale: circleScale }] }]}>
        {/* Tick mark — using Text for simplicity, perfectly centred */}
        <Animated.Text
          style={[
            styles.successTick,
            { opacity: tickOpacity, transform: [{ scale: tickScale }] },
          ]}
        >
          ✓
        </Animated.Text>
      </Animated.View>

      {/* Motivational message */}
      <Animated.Text style={[styles.successMessage, { opacity: messageOpacity }]}>
        {message}
      </Animated.Text>
    </Animated.View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SubmitObservation({ navigation }) {
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [pincode, setPincode] = useState("");
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [date, setDate] = useState(getTodayDate);
  const [time, setTime] = useState(getCurrentTime);

  const [phenomena, setPhenomena] = useState([]);
  const [showOthersDropdown, setShowOthersDropdown] = useState(false);

  const [damage, setDamage] = useState(null);
  const [showDamageDropdown, setShowDamageDropdown] = useState(false);
  const [description, setDescription] = useState("");

  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");

  const [photos, setPhotos] = useState([]);
  const [video, setVideo] = useState(null);

  const [captcha, setCaptcha] = useState(generateCaptcha);
  const [captchaInput, setCaptchaInput] = useState("");
  const [captchaError, setCaptchaError] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // Success overlay state
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    loadSavedLocation();
  }, []);

  async function loadSavedLocation() {
    const savedState = await AsyncStorage.getItem("savedState");
    const savedDistrict = await AsyncStorage.getItem("savedDistrict");
    if (savedState && savedDistrict) {
      setState(savedState);
      setDistrict(savedDistrict);
      return;
    }
    detectLocation();
  }

  async function detectLocation() {
    setLocationLoading(true);
    setLocationError("");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError("Location permission denied. Please enter manually.");
        setLocationLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10000,
      });
      const { latitude, longitude } = loc.coords;
      const geo = await reverseGeocode(latitude, longitude);
      if (geo) {
        if (geo.state) setState(geo.state);
        if (geo.district) setDistrict(geo.district);
      } else {
        setLocationError("Could not resolve location name. Please enter manually.");
      }
    } catch {
      setLocationError("Could not get location. Please enter manually.");
    } finally {
      setLocationLoading(false);
    }
  }

  const handlePincodeChange = async (text) => {
    setPincode(text);
    if (text.length !== 6) return;
    setPincodeLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/location/pincode/${text}`);
      const data = await res.json();
      if (res.ok) {
        setState(data.state || "");
        setDistrict(data.district || "");
      }
    } catch (_) {}
    finally { setPincodeLoading(false); }
  };

  const togglePhenomena = (id) => {
    setPhenomena((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= 2) {
        Alert.alert("Maximum 2", "You can select up to 2 weather phenomena.");
        return prev;
      }
      return [...prev, id];
    });
  };

  async function handleAddPhotoFromGallery() {
    if (photos.length >= 5) { Alert.alert("Limit reached", "You can upload a maximum of 5 photos."); return; }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission denied", "Allow access to your photo library in Settings."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "Images", quality: 0.8,
      allowsMultipleSelection: true, selectionLimit: 5 - photos.length,
    });
    if (!result.canceled) {
      const selected = result.assets.map((a) => ({ uri: a.uri, fileName: a.fileName || a.uri.split("/").pop() }));
      setPhotos((prev) => [...prev, ...selected].slice(0, 5));
    }
  }

  async function handleTakePhoto() {
    if (photos.length >= 5) { Alert.alert("Limit reached", "You can upload a maximum of 5 photos."); return; }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission denied", "Allow camera access in Settings."); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: "Images", quality: 0.8 });
    if (!result.canceled) {
      const a = result.assets[0];
      setPhotos((prev) => [...prev, { uri: a.uri, fileName: a.fileName || a.uri.split("/").pop() }].slice(0, 5));
    }
  }

  function handleRemovePhoto(index) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleAddVideo() {
    if (video) { Alert.alert("Video already added", "Remove the existing video before adding a new one."); return; }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission denied", "Allow access to your photo library in Settings."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "Videos", videoMaxDuration: 30,
      quality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });
    if (!result.canceled) {
      const a = result.assets[0];
      if (a.duration && a.duration > 30000) { Alert.alert("Video too long", "Please select a video under 30 seconds."); return; }
      setVideo({ uri: a.uri, fileName: a.fileName || a.uri.split("/").pop(), duration: a.duration ? Math.round(a.duration / 1000) : null });
    }
  }

  function handleRemoveVideo() { setVideo(null); }

  const handleSubmit = async () => {
    if (!state.trim()) { alert("Please enter or detect your State."); return; }
    if (!district.trim()) { alert("Please enter or detect your District."); return; }
    if (!date.trim()) { alert("Please enter the Date of the weather event."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) { alert("Date must be in YYYY-MM-DD format. Example: 2025-06-04"); return; }
    if (!time.trim()) { alert("Please enter the Time of the weather event."); return; }
    if (!/^\d{2}:\d{2}$/.test(time.trim())) { alert("Time must be in HH:MM format. Example: 14:30"); return; }
    if (phenomena.length === 0) { alert("Please select at least one Weather Phenomena."); return; }
    if (!damage) { alert("Please select Damage Caused."); return; }
    if (photos.length === 0 && !video) { alert("Please add at least 1 photo or a video of the weather event."); return; }
    if (parseInt(captchaInput, 10) !== captcha.answer) {
      setCaptchaError(true);
      setCaptcha(generateCaptcha());
      setCaptchaInput("");
      alert("Incorrect answer to the verification question. Please try again.");
      return;
    }

    setSubmitting(true);
    try {
      const userEmail = await AsyncStorage.getItem("userEmail");
      const username  = await AsyncStorage.getItem("username");

      // ── Upload photos + video first ──────────────────────────────────────
      let photoUrls = [];
      let videoUrl  = null;

      if (photos.length > 0 || video) {
        const formData = new FormData();

        photos.forEach((p) => {
          formData.append("photos", {
            uri: p.uri,
            name: p.fileName,
            type: "image/jpeg",   // Expo photos are always JPEG
          });
        });

        if (video) {
          formData.append("video", {
            uri: video.uri,
            name: video.fileName,
            type: "video/mp4",
          });
        }

        const uploadRes = await fetch(`${BACKEND_URL}/upload`, {
          method: "POST",
          body: formData,
          // Do NOT set Content-Type header — fetch sets it automatically
          // with the correct multipart boundary when body is FormData
        });

        if (!uploadRes.ok) {
          Alert.alert("Upload failed", "Could not upload photos/video. Please try again.");
          setSubmitting(false);
          return;
        }

        const uploadData = await uploadRes.json();
        photoUrls = uploadData.photoUrls;
        videoUrl  = uploadData.videoUrl;
      }

      // ── Submit observation with file URLs ────────────────────────────────
      const body = {
        state: state.trim(), district: district.trim(),
        date: date.trim(), time: time.trim(),
        phenomena, damage,
        description: description.trim() || null,
        userEmail, username,
        photoDirPath: photoUrls,   // array of URLs
        videoDirPath: videoUrl,    // single URL or null
      };

      const res  = await fetch(`${BACKEND_URL}/observations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        Alert.alert("Submission failed", data.message || "Something went wrong.");
        return;
      }

      // Reset form
      setPhenomena([]); setDamage(null); setDescription("");
      setPhotos([]); setVideo(null);
      setCaptcha(generateCaptcha()); setCaptchaInput(""); setPincode("");

      // Show success overlay
      setSuccessMessage(getRandomMessage());
      setShowSuccess(true);

    } catch (err) {
      Alert.alert("Network error", "Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Called when the success overlay's timer fires
      function handleSuccessDone() {
        setShowSuccess(false);
        navigation.navigate("Home");
      }

      

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Crowd Source</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── LOCATION ──────────────────────────────────────────────────── */}
        <Text style={styles.label}>Pincode</Text>
        <View style={styles.pincodeRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Enter 6-digit pincode to update location"
            placeholderTextColor="#aaa"
            keyboardType="number-pad"
            maxLength={6}
            value={pincode}
            onChangeText={handlePincodeChange}
          />
          {pincodeLoading && <ActivityIndicator size="small" color={WHITE} style={{ marginLeft: 10 }} />}
        </View>

        <View style={styles.labelRow}>
          <Text style={styles.label}>State</Text>
          {locationLoading ? (
            <ActivityIndicator size="small" color={WHITE} style={{ marginLeft: 8 }} />
          ) : (
            <TouchableOpacity onPress={detectLocation}>
              <Text style={styles.detectBtn}>📍 GPS Detect</Text>
            </TouchableOpacity>
          )}
        </View>
        <TextInput style={styles.input} value={state} onChangeText={setState} placeholder="e.g. Delhi" placeholderTextColor="#aaa" />

        <Text style={styles.label}>District</Text>
        <TextInput style={styles.input} value={district} onChangeText={setDistrict} placeholder="e.g. South Delhi" placeholderTextColor="#aaa" />

        {locationError ? <Text style={styles.locationError}>{locationError}</Text> : null}

        <Text style={styles.label}>Date of Weather Event <Text style={styles.required}>*</Text></Text>
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, { flex: 1 }]} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor="#aaa" />
          <Text style={styles.calIcon}>📅</Text>
        </View>

        <Text style={styles.label}>Time of Weather Event <Text style={styles.required}>*</Text></Text>
        <TextInput style={styles.input} value={time} onChangeText={setTime} placeholder="HH:MM" placeholderTextColor="#aaa" />

        {/* ── WEATHER PHENOMENA ──────────────────────────────────────────── */}
        <Text style={styles.label}>
          Weather Phenomena <Text style={styles.required}>*</Text>
          <Text style={styles.labelNote}> (select up to 2)</Text>
        </Text>

        <View style={styles.phenomenaGrid}>
          {GRID_PHENOMENA.map((item) => {
            const selected = phenomena.includes(item.id);
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.phenomenaTile, selected && styles.phenomenaTileSelected]}
                onPress={() => togglePhenomena(item.id)}
                activeOpacity={0.75}
              >
                <Text style={styles.phenomenaEmoji}>{item.emoji}</Text>
                <Text style={[styles.phenomenaTileLabel, selected && styles.phenomenaTileLabelSelected]}>{item.label}</Text>
                {selected && <Text style={styles.phenomenaCheck}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.othersToggle, showOthersDropdown && styles.othersToggleOpen]}
          onPress={() => setShowOthersDropdown(!showOthersDropdown)}
        >
          <Text style={styles.othersToggleText}>
            {OTHER_PHENOMENA.some((o) => phenomena.includes(o))
              ? `Others: ${OTHER_PHENOMENA.filter((o) => phenomena.includes(o)).join(", ")}`
              : "Others"}
          </Text>
          <Text style={styles.dropdownArrow}>{showOthersDropdown ? "▲" : "▼"}</Text>
        </TouchableOpacity>
        {showOthersDropdown && (
          <View style={styles.dropdown}>
            {OTHER_PHENOMENA.map((item) => {
              const selected = phenomena.includes(item);
              return (
                <TouchableOpacity
                  key={item}
                  style={[styles.dropdownItem, selected && styles.dropdownItemSelected]}
                  onPress={() => { togglePhenomena(item); setShowOthersDropdown(false); }}
                >
                  <Text style={[styles.dropdownItemText, selected && styles.dropdownItemTextSelected]}>{item}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {phenomena.length > 0 && (
          <View style={styles.selectedTagsRow}>
            {phenomena.map((p) => (
              <TouchableOpacity key={p} style={styles.selectedTag} onPress={() => togglePhenomena(p)}>
                <Text style={styles.selectedTagText}>{p}  ✕</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* DAMAGE CAUSED */}
        <Text style={styles.label}>Damage Caused <Text style={styles.required}>*</Text></Text>
        <TouchableOpacity style={styles.selectBox} onPress={() => setShowDamageDropdown(!showDamageDropdown)}>
          <Text style={damage ? styles.selectBoxText : styles.selectBoxPlaceholder}>{damage || "Select"}</Text>
          <Text style={styles.dropdownArrow}>▼</Text>
        </TouchableOpacity>
        {showDamageDropdown && (
          <View style={styles.dropdown}>
            {DAMAGE_OPTIONS.map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.dropdownItem, damage === item && styles.dropdownItemSelected]}
                onPress={() => { setDamage(item); setShowDamageDropdown(false); }}
              >
                <Text style={[styles.dropdownItemText, damage === item && styles.dropdownItemTextSelected]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* DESCRIPTION */}
        <Text style={styles.label}>More about your observation <Text style={styles.required}>*</Text></Text>
        <View style={styles.textAreaWrapper}>
          <TextInput
            style={styles.textArea}
            value={description}
            onChangeText={(t) => t.length <= 250 && setDescription(t)}
            placeholder="Enter text..........."
            placeholderTextColor="#aaa"
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{description.length}/250</Text>
        </View>

        {/* ── PHOTOS ────────────────────────────────────────────────────── */}
        <Text style={styles.label}>
          Photos / Video <Text style={styles.required}>*</Text>
          <Text style={styles.labelNote}> (at least 1 photo or a video)</Text>
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
          {photos.map((p, i) => (
            <View key={i} style={styles.photoThumb}>
              <Image source={{ uri: p.uri }} style={styles.thumbImg} />
              <TouchableOpacity style={styles.removePhotoBtn} onPress={() => handleRemovePhoto(i)}>
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 5 && (
            <>
              <TouchableOpacity style={styles.addMediaBox} onPress={handleTakePhoto}>
                <Text style={styles.addMediaIcon}>📷</Text>
                <Text style={styles.addMediaLabel}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addMediaBox} onPress={handleAddPhotoFromGallery}>
                <Text style={styles.addMediaIcon}>🖼️</Text>
                <Text style={styles.addMediaLabel}>Gallery</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
        <Text style={styles.mediaCount}>{photos.length}/5 photos added</Text>

        {/* ── VIDEO ─────────────────────────────────────────────────────── */}
        <Text style={styles.label}>Video <Text style={styles.labelNote}>(optional, max 30 seconds)</Text></Text>
        {video ? (
          <View style={styles.videoRow}>
            <Text style={styles.videoName} numberOfLines={1}>🎥 {video.fileName}{video.duration ? `  (${video.duration}s)` : ""}</Text>
            <TouchableOpacity onPress={handleRemoveVideo} style={styles.removeVideoBtn}>
              <Text style={styles.removeBtnText}>✕ Remove</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.addVideoBtn} onPress={handleAddVideo}>
            <Text style={styles.addVideoBtnText}>+ Add Video</Text>
          </TouchableOpacity>
        )}

        {/* ── CAPTCHA ───────────────────────────────────────────────────── */}
        <Text style={styles.label}>Verification <Text style={styles.required}>*</Text></Text>
        <View style={styles.captchaBox}>
          <Text style={styles.captchaQuestion}>What is {captcha.a} + {captcha.b}?</Text>
          <View style={styles.captchaInputRow}>
            <TextInput
              style={[styles.input, styles.captchaInput, captchaError && styles.inputError]}
              value={captchaInput}
              onChangeText={(t) => { setCaptchaInput(t); setCaptchaError(false); }}
              placeholder="Answer"
              placeholderTextColor="#aaa"
              keyboardType="number-pad"
              maxLength={2}
            />
            <TouchableOpacity
              style={styles.captchaRefreshBtn}
              onPress={() => { setCaptcha(generateCaptcha()); setCaptchaInput(""); setCaptchaError(false); }}
            >
              <Text style={styles.captchaRefreshText}>🔄 New</Text>
            </TouchableOpacity>
          </View>
          {captchaError && <Text style={styles.captchaErrorText}>Incorrect. Try again.</Text>}
        </View>

        {/* SUBMIT */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color={WHITE} /> : <Text style={styles.submitBtnText}>Submit Observation</Text>}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── SUCCESS OVERLAY — rendered on top of everything ─────────────── */}
      {showSuccess && <SuccessOverlay message={successMessage} onDone={handleSuccessDone} />}
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

  pincodeRow: { flexDirection: "row", alignItems: "center" },
  labelRow: { flexDirection: "row", alignItems: "center", marginTop: 14, marginBottom: 6 },
  label: { color: WHITE, fontSize: 14, marginBottom: 6, marginTop: 14 },
  labelNote: { color: "#aaa", fontSize: 12, fontWeight: "400" },
  detectBtn: { color: "#90caf9", fontSize: 13, marginLeft: 10, marginBottom: 6 },
  locationError: { color: "#ffcdd2", fontSize: 12, marginTop: 4, marginBottom: 2 },
  required: { color: REQUIRED_RED },
  input: {
    backgroundColor: INPUT_BG, borderRadius: 6,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: "#222",
  },
  inputError: { borderWidth: 1.5, borderColor: REQUIRED_RED },
  inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: INPUT_BG, borderRadius: 6 },
  calIcon: { paddingHorizontal: 12, fontSize: 20 },

  phenomenaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  phenomenaTile: {
    width: "47%", backgroundColor: BG_DARK, borderRadius: 10,
    paddingVertical: 18, alignItems: "center",
    borderWidth: 1.5, borderColor: "transparent", position: "relative",
  },
  phenomenaTileSelected: { borderColor: ACCENT, backgroundColor: "rgba(66,133,244,0.15)" },
  phenomenaEmoji: { fontSize: 32, marginBottom: 6 },
  phenomenaTileLabel: { color: "rgba(255,255,255,0.7)", fontSize: 13, textAlign: "center", lineHeight: 17 },
  phenomenaTileLabelSelected: { color: WHITE, fontWeight: "600" },
  phenomenaCheck: { position: "absolute", top: 8, right: 10, color: ACCENT, fontSize: 14, fontWeight: "700" },

  othersToggle: {
    backgroundColor: BG_DARK, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 13, marginTop: 10,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  othersToggleOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  othersToggleText: { color: "rgba(255,255,255,0.75)", fontSize: 14 },
  dropdownArrow: { color: WHITE, fontSize: 13 },

  selectedTagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  selectedTag: { backgroundColor: ACCENT, alignSelf: "flex-start", borderRadius: 4, paddingHorizontal: 12, paddingVertical: 6 },
  selectedTagText: { color: WHITE, fontSize: 13 },

  selectBox: {
    backgroundColor: INPUT_BG, borderRadius: 6,
    paddingHorizontal: 14, paddingVertical: 13,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  selectBoxText: { fontSize: 15, color: "#222" },
  selectBoxPlaceholder: { fontSize: 15, color: "#aaa" },
  dropdown: { backgroundColor: INPUT_BG, borderRadius: 6, marginTop: 2, borderWidth: 1, borderColor: "#ddd", zIndex: 100 },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: "#eee" },
  dropdownItemSelected: { backgroundColor: "#e3f0fc" },
  dropdownItemText: { fontSize: 15, color: "#222" },
  dropdownItemTextSelected: { color: ACCENT, fontWeight: "500" },

  textAreaWrapper: { backgroundColor: INPUT_BG, borderRadius: 6 },
  textArea: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 28, fontSize: 15, color: "#222", minHeight: 130 },
  charCount: { textAlign: "right", paddingRight: 12, paddingBottom: 8, fontSize: 12, color: "#888" },

  photoRow: { flexDirection: "row", marginTop: 4, marginBottom: 4 },
  photoThumb: { width: 80, height: 80, borderRadius: 8, marginRight: 8, position: "relative" },
  thumbImg: { width: 80, height: 80, borderRadius: 8 },
  removePhotoBtn: {
    position: "absolute", top: -6, right: -6,
    backgroundColor: REQUIRED_RED, width: 20, height: 20, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  removeBtnText: { color: WHITE, fontSize: 10, fontWeight: "700" },
  addMediaBox: {
    width: 80, height: 80, borderRadius: 8,
    borderWidth: 1.5, borderColor: "#aaa", borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", marginRight: 8,
  },
  addMediaIcon: { fontSize: 22 },
  addMediaLabel: { color: "#ccc", fontSize: 11, marginTop: 4 },
  mediaCount: { color: "#aaa", fontSize: 11, marginBottom: 4 },

  addVideoBtn: { borderWidth: 1.5, borderColor: "#aaa", borderStyle: "dashed", borderRadius: 6, paddingVertical: 14, alignItems: "center" },
  addVideoBtnText: { color: "#ccc", fontSize: 14 },
  videoRow: { backgroundColor: BG_DARK, borderRadius: 8, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  videoName: { color: WHITE, fontSize: 13, flex: 1, marginRight: 8 },
  removeVideoBtn: { backgroundColor: REQUIRED_RED, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },

  captchaBox: { backgroundColor: BG_DARK, borderRadius: 8, padding: 14, marginTop: 4 },
  captchaQuestion: { color: WHITE, fontSize: 17, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  captchaInputRow: { flexDirection: "row", alignItems: "center" },
  captchaInput: { flex: 1, marginRight: 10 },
  captchaRefreshBtn: { backgroundColor: BG, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 12 },
  captchaRefreshText: { color: WHITE, fontSize: 13 },
  captchaErrorText: { color: "#ffcdd2", fontSize: 12, textAlign: "center", marginTop: 6 },

  submitBtn: { backgroundColor: ACCENT, borderRadius: 8, paddingVertical: 15, alignItems: "center", marginTop: 24 },
  submitBtnText: { color: WHITE, fontSize: 16, fontWeight: "600" },

  // ── Success overlay ─────────────────────────────────────────────────────────
  successOverlay: {
    // Covers the entire screen, sits on top of the form
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.82)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  successCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: ACCENT, // deep green
    alignItems: "center",
    justifyContent: "center",
    // Subtle glow effect via shadow
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 12,
  },
  successTick: {
    color: WHITE,
    fontSize: 62,
    fontWeight: "700",
    lineHeight: 70,      // centres the glyph vertically inside the circle
    marginTop: 4,        // fine-tune optical centering
  },
  successMessage: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 28,
    paddingHorizontal: 32,
    lineHeight: 24,
    letterSpacing: 0.2,
  },
});