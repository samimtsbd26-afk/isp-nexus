import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { savePushToken } from "./storage";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "ISP Nexus",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#3b82f6",
    });
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await savePushToken(token);
    return token;
  } catch {
    return null;
  }
}

export function useNotificationListener(onReceive: (n: Notifications.Notification) => void) {
  return Notifications.addNotificationReceivedListener(onReceive);
}

export function useNotificationResponseListener(onResponse: (r: Notifications.NotificationResponse) => void) {
  return Notifications.addNotificationResponseReceivedListener(onResponse);
}
