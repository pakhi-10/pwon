import { useState, useEffect } from "react";
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
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location"; // expo location library
import * as ImagePicker from "expo-image-picker"; // expo image picker library
import { COLOURS } from "../constants/colours";

const { BG, BG_DARK, WHITE, INPUT_BG, REQUIRED_RED, ACCENT } = COLOURS;

const BACKEND_URL = "http://192.168.0.200:3000"; // TODO: replace with your laptop IP

// ─── Phenomena options ────────────────────────────────────────────────────────

// These 4 appear as picture tiles in a 2×2 grid. User can pick up to 2 total.
const GRID_PHENOMENA = [
  { id: "Rainfall",               emoji: "🌧️", label: "Rainfall" },
  { id: "Thunderstorm/Lightning", emoji: "⛈️", label: "Thunderstorm/\nLightning" },
  { id: "Snowfall",               emoji: "❄️", label: "Snowfall" },
  { id: "Fog",                    emoji: "🌫️", label: "Fog" },
];

// These appear in the collapsible "Others" dropdown below the grid
const OTHER_PHENOMENA = [
  "Heatwave",
  "Coldwave",
  "Hailstorm",
  "Strong Winds",
  "Specify below", // not called "Others" — user types it in description
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
  // Returns YYYY-MM-DD in local time (not UTC)
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

// Reverse geocode lat/lng → { state, district } using OpenStreetMap Nominatim
// Free, no API key needed. Returns null if it fails.
async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    const json = await res.json();
    const addr = json.address || {}; // Returns JSON address object or empty object to avoid crash

    // Nominatim field names vary by country — cover common Indian variants
    const district =
      addr.county ||
      addr.district ||
      addr.city_district ||
      addr.suburb ||
      addr.city ||
      "";
    const state = addr.state || "";

    return { state, district };
  } catch {
    return null;
  }
}

// Generates a simple random math captcha e.g. "3 + 5 = ?"
// Returns { a, b, answer } so we can check the user's input later
function generateCaptcha() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { a, b, answer: a + b };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SubmitObservation() {
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [pincode, setPincode] = useState("");
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [date, setDate] = useState(getTodayDate);   // auto-filled, editable
  const [time, setTime] = useState(getCurrentTime); // auto-filled, editable

  // phenomena is now an array of up to 2 selected strings
  const [phenomena, setPhenomena] = useState([]);
  const [showOthersDropdown, setShowOthersDropdown] = useState(false);

  const [damage, setDamage] = useState(null);
  const [showDamageDropdown, setShowDamageDropdown] = useState(false);
  const [description, setDescription] = useState("");

  // GPS state
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");

  // Photos: array of { uri, fileName }. Min 1, max 5.
  const [photos, setPhotos] = useState([]);

  // Video: { uri, fileName, duration } or null. Max 30 seconds.
  const [video, setVideo] = useState(null);

  // Captcha: the current math question + correct answer
  const [captcha, setCaptcha] = useState(generateCaptcha);
  const [captchaInput, setCaptchaInput] = useState("");
  const [captchaError, setCaptchaError] = useState(false); // turns input red if wrong

  // ── Load saved location on mount, fall back to GPS ────────────────────────
  useEffect(() => {
    loadSavedLocation();
  }, []);

  async function loadSavedLocation() {
    // Try the location saved during registration first — no GPS needed
    const savedState = await AsyncStorage.getItem("savedState");
    const savedDistrict = await AsyncStorage.getItem("savedDistrict");
    if (savedState && savedDistrict) {
      setState(savedState);
      setDistrict(savedDistrict);
      return;
    }
    // Nothing saved yet (e.g. anonymous user) → fall back to GPS
    detectLocation();
  }

  async function detectLocation() {
    setLocationLoading(true);
    setLocationError("");

    try {
      // 1. Ask for permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError("Location permission denied. Please enter manually.");
        setLocationLoading(false);
        return;
      }

      // 2. Get coordinates (timeout after 10 s)
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced, // good enough, don't drain battery
        timeInterval: 10000,
      });

      const { latitude, longitude } = loc.coords;

      // 3. Reverse geocode → state + district
      const geo = await reverseGeocode(latitude, longitude);

      if (geo) {
        if (geo.state) setState(geo.state);
        if (geo.district) setDistrict(geo.district);
      } else {
        setLocationError("Could not resolve location name. Please enter manually.");
      }
    } catch (err) {
      setLocationError("Could not get location. Please enter manually.");
    } finally {
      setLocationLoading(false);
    }
  }

  // ── Pincode → state + district via backend → India Post API ───────────────
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
    } catch (_) {
      // Silent fail — user can still type state/district manually
    } finally {
      setPincodeLoading(false);
    }
  };

  // ── Phenomena: toggle selection (max 2) ───────────────────────────────────
  const togglePhenomena = (id) => {
    setPhenomena((prev) => {
      if (prev.includes(id)) {
        // Deselect
        return prev.filter((p) => p !== id);
      }
      if (prev.length >= 2) {
        Alert.alert("Maximum 2", "You can select up to 2 weather phenomena.");
        return prev;
      }
      return [...prev, id];
    });
  };

  // ── Photo: pick from gallery ──────────────────────────────────────────────
  async function handleAddPhotoFromGallery() {
    if (photos.length >= 5) {
      Alert.alert("Limit reached", "You can upload a maximum of 5 photos.");
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission denied", "Allow access to your photo library in Settings.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true, // works on iOS 14+; Android picks one at a time
      selectionLimit: 5 - photos.length,
    });
    if (!result.canceled) {
      const selected = result.assets.map((a) => ({
        uri: a.uri,
        fileName: a.fileName || a.uri.split("/").pop(),
      }));
      // Merge with existing photos, cap at 5
      setPhotos((prev) => [...prev, ...selected].slice(0, 5));
    }
  }

  // ── Photo: take with camera ───────────────────────────────────────────────
  async function handleTakePhoto() {
    if (photos.length >= 5) {
      Alert.alert("Limit reached", "You can upload a maximum of 5 photos.");
      return;
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission denied", "Allow camera access in Settings.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled) {
      const a = result.assets[0];
      setPhotos((prev) =>
        [...prev, { uri: a.uri, fileName: a.fileName || a.uri.split("/").pop() }].slice(0, 5)
      );
    }
  }

  // ── Photo: remove one thumbnail ───────────────────────────────────────────
  function handleRemovePhoto(index) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    // filter returns a new array with every item EXCEPT the one at this index
  }

  // ── Video: pick from gallery ──────────────────────────────────────────────
  async function handleAddVideo() {
    if (video) {
      Alert.alert("Video already added", "Remove the existing video before adding a new one.");
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission denied", "Allow access to your photo library in Settings.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 30, // seconds — note: some Android versions ignore this
      quality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });
    if (!result.canceled) {
      const a = result.assets[0];
      // Double-check duration on platforms that ignore videoMaxDuration
      if (a.duration && a.duration > 30000) {
        Alert.alert("Video too long", "Please select a video under 30 seconds.");
        return;
      }
      setVideo({
        uri: a.uri,
        fileName: a.fileName || a.uri.split("/").pop(),
        duration: a.duration ? Math.round(a.duration / 1000) : null, // convert ms → seconds
      });
    }
  }

  // ── Video: remove ─────────────────────────────────────────────────────────
  function handleRemoveVideo() {
    setVideo(null);
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!state.trim()) {
      alert("Please enter or detect your State.");
      return;
    }

    if (!district.trim()) {
      alert("Please enter or detect your District.");
      return;
    }

    if (!date.trim()) {
      alert("Please enter the Date of the weather event.");
      return;
    }

    // Basic date format check — must look like YYYY-MM-DD
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(date.trim())) {
      alert("Date must be in YYYY-MM-DD format. Example: 2025-06-04");
      return;
    }

    if (!time.trim()) {
      alert("Please enter the Time of the weather event.");
      return;
    }

    // Basic time format check — must look like HH:MM
    const timePattern = /^\d{2}:\d{2}$/;
    if (!timePattern.test(time.trim())) {
      alert("Time must be in HH:MM format. Example: 14:30");
      return;
    }

    if (phenomena.length === 0) {
      alert("Please select at least one Weather Phenomena.");
      return;
    }

    if (!damage) {
      alert("Please select Damage Caused.");
      return;
    }

    // At least 1 photo is required
    if (photos.length === 0) {
      alert("Please add at least 1 photo of the weather event.");
      return;
    }

    // Captcha check — parseInt converts the string input to a number for comparison
    if (parseInt(captchaInput, 10) !== captcha.answer) {
      setCaptchaError(true);
      setCaptcha(generateCaptcha()); // give a fresh question after a wrong attempt
      setCaptchaInput("");
      alert("Incorrect answer to the verification question. Please try again.");
      return;
    }

    const observation = {
      state,
      district,
      date,
      time,
      phenomena,
      damage,
      description,
      photoCount: photos.length,
      hasVideo: !!video,
    };
    console.log("Observation submitted:", observation);
    alert("Observation submitted! (mock)");
    // TODO: replace with real API call to POST /observations
  };

  // ─────────────────────────────────────────────────────────────────────────

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
        {/* Pincode auto-fills state + district. GPS is a fallback. */}

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
          {pincodeLoading && (
            <ActivityIndicator size="small" color={WHITE} style={{ marginLeft: 10 }} />
          )}
        </View>

        {/* STATE */}
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
        <TextInput
          style={styles.input}
          value={state}
          onChangeText={setState}
          placeholder="e.g. Delhi"
          placeholderTextColor="#aaa"
        />

        {/* DISTRICT */}
        <Text style={styles.label}>District</Text>
        <TextInput
          style={styles.input}
          value={district}
          onChangeText={setDistrict}
          placeholder="e.g. South Delhi"
          placeholderTextColor="#aaa"
        />

        {/* Location error message */}
        {locationError ? (
          <Text style={styles.locationError}>{locationError}</Text>
        ) : null}

        {/* DATE — auto-filled with today, user can edit */}
        <Text style={styles.label}>
          Date of Weather Event <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#aaa"
          />
          <Text style={styles.calIcon}>📅</Text>
        </View>

        {/* TIME — auto-filled with current time, user can edit */}
        <Text style={styles.label}>
          Time of Weather Event <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          value={time}
          onChangeText={setTime}
          placeholder="HH:MM"
          placeholderTextColor="#aaa"
        />

        {/* ── WEATHER PHENOMENA ──────────────────────────────────────────── */}
        <Text style={styles.label}>
          Weather Phenomena <Text style={styles.required}>*</Text>
          <Text style={styles.labelNote}> (select up to 2)</Text>
        </Text>

        {/* 2×2 picture grid for the 4 most common phenomena */}
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
                <Text style={[styles.phenomenaTileLabel, selected && styles.phenomenaTileLabelSelected]}>
                  {item.label}
                </Text>
                {/* Checkmark badge overlaid on top-right when selected */}
                {selected && <Text style={styles.phenomenaCheck}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Collapsible "Others" dropdown for less common phenomena */}
        <TouchableOpacity
          style={[styles.othersToggle, showOthersDropdown && styles.othersToggleOpen]}
          onPress={() => setShowOthersDropdown(!showOthersDropdown)}
        >
          <Text style={styles.othersToggleText}>
            {/* Show which "other" options are selected, if any */}
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
                  onPress={() => {
                    togglePhenomena(item);
                    setShowOthersDropdown(false);
                  }}
                >
                  <Text style={[styles.dropdownItemText, selected && styles.dropdownItemTextSelected]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Selected phenomena tags — tap to deselect */}
        {phenomena.length > 0 && (
          <View style={styles.selectedTagsRow}>
            {phenomena.map((p) => (
              <TouchableOpacity
                key={p}
                style={styles.selectedTag}
                onPress={() => togglePhenomena(p)}
              >
                <Text style={styles.selectedTagText}>{p}  ✕</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* DAMAGE CAUSED */}
        <Text style={styles.label}>
          Damage Caused <Text style={styles.required}>*</Text>
        </Text>
        <TouchableOpacity
          style={styles.selectBox}
          onPress={() => setShowDamageDropdown(!showDamageDropdown)}
        >
          <Text style={damage ? styles.selectBoxText : styles.selectBoxPlaceholder}>
            {damage || "Select"}
          </Text>
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
                <Text style={[styles.dropdownItemText, damage === item && styles.dropdownItemTextSelected]}>
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* DESCRIPTION */}
        <Text style={styles.label}>
          More about your observation <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.textAreaWrapper}>
          <TextInput
            style={styles.textArea}
            value={description}
            onChangeText={(t) => t.length <= 250 && setDescription(t)} // Cannot type more than 250 characters
            placeholder="Enter text..........."
            placeholderTextColor="#aaa"
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{description.length}/250</Text>
        </View>

        {/* ── PHOTOS ────────────────────────────────────────────────────── */}
        <Text style={styles.label}>
          Photos <Text style={styles.required}>*</Text>
          <Text style={styles.labelNote}> (min 1, max 5)</Text>
        </Text>

        {/* Thumbnail row — scrolls horizontally if many photos */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
          {photos.map((p, i) => (
            <View key={i} style={styles.photoThumb}>
              <Image source={{ uri: p.uri }} style={styles.thumbImg} />
              {/* ✕ button overlaid on top-right corner of each thumbnail */}
              <TouchableOpacity style={styles.removePhotoBtn} onPress={() => handleRemovePhoto(i)}>
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Only show add buttons if under the 5-photo limit */}
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
        <Text style={styles.label}>
          Video <Text style={styles.labelNote}>(optional, max 30 seconds)</Text>
        </Text>

        {video ? (
          // Show filename + duration once a video is picked
          <View style={styles.videoRow}>
            <Text style={styles.videoName} numberOfLines={1}>
              🎥 {video.fileName}{video.duration ? `  (${video.duration}s)` : ""}
            </Text>
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
        <Text style={styles.label}>
          Verification <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.captchaBox}>
          {/* The math question — regenerated each time user gets it wrong or taps refresh */}
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
            {/* Refresh button — gives a new question without submitting */}
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
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Text style={styles.submitBtnText}>Submit Observation</Text>
        </TouchableOpacity>

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
    // On Android, the status bar (clock, battery, signal) overlaps your app
    // by default. StatusBar.currentHeight gives its exact pixel height so we
    // push the content down by that much. On iOS, 44 is the standard top
    // safe area. Without this, the header title slides behind the status bar.
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
  scroll: { flex: 1, backgroundColor: BG },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },

  // Pincode row (input + spinner side by side)
  pincodeRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  // Label row with inline Detect button
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    marginBottom: 6,
  },
  label: { color: WHITE, fontSize: 14, marginBottom: 6, marginTop: 14 },
  labelNote: { color: "#aaa", fontSize: 12, fontWeight: "400" }, // smaller grey hint text next to label
  detectBtn: { color: "#90caf9", fontSize: 13, marginLeft: 10, marginBottom: 6 },
  locationError: { color: "#ffcdd2", fontSize: 12, marginTop: 4, marginBottom: 2 },

  required: { color: REQUIRED_RED }, // required asterisk
  input: {
    backgroundColor: INPUT_BG,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#222",
  },
  inputError: { borderWidth: 1.5, borderColor: REQUIRED_RED }, // red border when captcha is wrong
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: INPUT_BG,
    borderRadius: 6,
  },
  calIcon: { paddingHorizontal: 12, fontSize: 20 },

  // ── Phenomena grid ──────────────────────────────────────────────────────────
  phenomenaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  phenomenaTile: {
    // "47%" gives two tiles per row with the gap between them
    width: "47%",
    backgroundColor: BG_DARK,
    borderRadius: 10,
    paddingVertical: 18,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "transparent",
    position: "relative",
  },
  phenomenaTileSelected: {
    borderColor: ACCENT,
    backgroundColor: "rgba(66,133,244,0.15)",
  },
  phenomenaEmoji: {
    fontSize: 32,
    marginBottom: 6,
  },
  phenomenaTileLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 17,
  },
  phenomenaTileLabelSelected: {
    color: WHITE,
    fontWeight: "600",
  },
  phenomenaCheck: {
    // Blue tick badge overlaid on top-right of tile when selected
    position: "absolute",
    top: 8,
    right: 10,
    color: ACCENT,
    fontSize: 14,
    fontWeight: "700",
  },

  // ── Others dropdown ─────────────────────────────────────────────────────────
  othersToggle: {
    backgroundColor: BG_DARK,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  othersToggleOpen: {
    // When open, square off the bottom corners so it flows into the dropdown
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  othersToggleText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 14,
  },
  dropdownArrow: { color: WHITE, fontSize: 13 },

  // ── Selected tags row ───────────────────────────────────────────────────────
  selectedTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  selectedTag: {
    backgroundColor: ACCENT,
    alignSelf: "flex-start",
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  selectedTagText: { color: WHITE, fontSize: 13 },

  // ── Shared dropdown ─────────────────────────────────────────────────────────
  selectBox: {
    backgroundColor: INPUT_BG,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectBoxText: { fontSize: 15, color: "#222" },
  selectBoxPlaceholder: { fontSize: 15, color: "#aaa" },
  dropdown: {
    backgroundColor: INPUT_BG,
    borderRadius: 6,
    marginTop: 2,
    borderWidth: 1,
    borderColor: "#ddd",
    zIndex: 100,
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  dropdownItemSelected: { backgroundColor: "#e3f0fc" },
  dropdownItemText: { fontSize: 15, color: "#222" },
  dropdownItemTextSelected: { color: ACCENT, fontWeight: "500" },

  // ── Description ─────────────────────────────────────────────────────────────
  textAreaWrapper: { backgroundColor: INPUT_BG, borderRadius: 6 },
  textArea: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 28,
    fontSize: 15,
    color: "#222",
    minHeight: 130,
  },
  charCount: { textAlign: "right", paddingRight: 12, paddingBottom: 8, fontSize: 12, color: "#888" },

  // ── Photos ──────────────────────────────────────────────────────────────────
  photoRow: { flexDirection: "row", marginTop: 4, marginBottom: 4 },
  photoThumb: {
    width: 80, height: 80, borderRadius: 8,
    marginRight: 8, position: "relative",
  },
  thumbImg: { width: 80, height: 80, borderRadius: 8 },
  removePhotoBtn: {
    // Overlaid ✕ button on top-right of thumbnail
    position: "absolute", top: -6, right: -6,
    backgroundColor: REQUIRED_RED,
    width: 20, height: 20, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  removeBtnText: { color: WHITE, fontSize: 10, fontWeight: "700" },
  addMediaBox: {
    // Dashed box for Camera / Gallery add buttons
    width: 80, height: 80, borderRadius: 8,
    borderWidth: 1.5, borderColor: "#aaa", borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", marginRight: 8,
  },
  addMediaIcon: { fontSize: 22 },
  addMediaLabel: { color: "#ccc", fontSize: 11, marginTop: 4 },
  mediaCount: { color: "#aaa", fontSize: 11, marginBottom: 4 },

  // ── Video ───────────────────────────────────────────────────────────────────
  addVideoBtn: {
    borderWidth: 1.5, borderColor: "#aaa", borderStyle: "dashed",
    borderRadius: 6, paddingVertical: 14, alignItems: "center",
  },
  addVideoBtnText: { color: "#ccc", fontSize: 14 },
  videoRow: {
    backgroundColor: BG_DARK, borderRadius: 8, padding: 12,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  videoName: { color: WHITE, fontSize: 13, flex: 1, marginRight: 8 },
  removeVideoBtn: {
    backgroundColor: REQUIRED_RED, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 6,
  },

  // ── Captcha ─────────────────────────────────────────────────────────────────
  captchaBox: {
    backgroundColor: BG_DARK, borderRadius: 8, padding: 14, marginTop: 4,
  },
  captchaQuestion: {
    color: WHITE, fontSize: 17, fontWeight: "700",
    textAlign: "center", marginBottom: 12,
  },
  captchaInputRow: { flexDirection: "row", alignItems: "center" },
  captchaInput: { flex: 1, marginRight: 10 },
  captchaRefreshBtn: {
    backgroundColor: BG, borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  captchaRefreshText: { color: WHITE, fontSize: 13 },
  captchaErrorText: { color: "#ffcdd2", fontSize: 12, textAlign: "center", marginTop: 6 },

  // ── Submit ──────────────────────────────────────────────────────────────────
  submitBtn: {
    backgroundColor: ACCENT,
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 24,
  },
  submitBtnText: { color: WHITE, fontSize: 16, fontWeight: "600" },
});