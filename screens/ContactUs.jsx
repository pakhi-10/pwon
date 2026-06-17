// screens/MySubmissions.jsx  (and same pattern for Feedback.jsx, ContactUs.jsx)
import { View, Text, StyleSheet } from "react-native";
import { COLOURS } from "../constants/colours";

export default function MySubmissions() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Contact Us — coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOURS.BG, alignItems: "center", justifyContent: "center" },
  text: { color: COLOURS.WHITE, fontSize: 16 },
});