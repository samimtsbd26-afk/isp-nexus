import * as SecureStore from "expo-secure-store";
import { STORAGE_KEYS } from "./constants";

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEYS.TOKEN, token);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(STORAGE_KEYS.TOKEN);
}

export async function deleteToken(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEYS.TOKEN);
}

export async function saveCustomer(customer: StoredCustomer): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEYS.CUSTOMER, JSON.stringify(customer));
}

export async function getCustomer(): Promise<StoredCustomer | null> {
  const raw = await SecureStore.getItemAsync(STORAGE_KEYS.CUSTOMER);
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredCustomer; } catch { return null; }
}

export async function deleteCustomer(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEYS.CUSTOMER);
}

export async function saveOrgId(orgId: string): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEYS.ORG_ID, orgId);
}

export async function getOrgId(): Promise<string | null> {
  return SecureStore.getItemAsync(STORAGE_KEYS.ORG_ID);
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEYS.BIOMETRIC_ENABLED, enabled ? "1" : "0");
}

export async function getBiometricEnabled(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(STORAGE_KEYS.BIOMETRIC_ENABLED);
  return val === "1";
}

export async function savePushToken(expoPushToken: string): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEYS.PUSH_TOKEN, expoPushToken);
}

export async function getPushToken(): Promise<string | null> {
  return SecureStore.getItemAsync(STORAGE_KEYS.PUSH_TOKEN);
}

export async function clearAll(): Promise<void> {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(STORAGE_KEYS.TOKEN),
    SecureStore.deleteItemAsync(STORAGE_KEYS.CUSTOMER),
    SecureStore.deleteItemAsync(STORAGE_KEYS.ORG_ID),
    SecureStore.deleteItemAsync(STORAGE_KEYS.BIOMETRIC_ENABLED),
    SecureStore.deleteItemAsync(STORAGE_KEYS.PUSH_TOKEN),
  ]);
}

export interface StoredCustomer {
  id: string;
  fullName: string;
  phone: string;
  customerCode: string;
}
