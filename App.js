import 'react-native-gesture-handler';
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import SplashScreen from "./screens/SplashScreen";
import Login from "./screens/Login";
import Register from "./screens/Register";
import Home from "./screens/Home";
import SubmitObservation from "./screens/SubmitObservation";
import MySubmissions from "./screens/MySubmissions";
import SubmissionDetail from "./screens/SubmissionDetail";
import ContactUs from "./screens/ContactUs";
import Feedback from "./screens/Feedback";

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Login" component={Login} />
        <Stack.Screen name="Register" component={Register} />
        <Stack.Screen name="Home" component={Home} />
        <Stack.Screen name="SubmitObservation" component={SubmitObservation} />
        <Stack.Screen name="MySubmissions" component={MySubmissions} />
        <Stack.Screen name="SubmissionDetail" component={SubmissionDetail} />
        <Stack.Screen name="Feedback" component={Feedback} />
        <Stack.Screen name="ContactUs" component={ContactUs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}