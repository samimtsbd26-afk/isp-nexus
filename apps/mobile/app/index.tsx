import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth";

export default function Index() {
  const { status } = useAuth();
  if (status === "loading") return null;
  if (status === "authenticated") return <Redirect href="/(tabs)/" />;
  return <Redirect href="/(auth)/login" />;
}
