import { Tabs } from "expo-router";
import { Text } from "react-native";
import { COLORS } from "@/lib/constants";

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 22 : 18, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 60,
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "ড্যাশবোর্ড",
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: "পেমেন্ট",
          tabBarIcon: ({ focused }) => <TabIcon emoji="💳" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="hotspot"
        options={{
          title: "ডিভাইস",
          tabBarIcon: ({ focused }) => <TabIcon emoji="📡" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          title: "সাপোর্ট",
          tabBarIcon: ({ focused }) => <TabIcon emoji="🎧" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "প্রোফাইল",
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
