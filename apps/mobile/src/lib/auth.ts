import React, { createContext, useContext, useEffect, useReducer } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import {
  getToken, saveToken, deleteToken,
  getCustomer, saveCustomer, deleteCustomer,
  getOrgId, saveOrgId,
  getBiometricEnabled, setBiometricEnabled,
  clearAll, type StoredCustomer,
} from "./storage";
import { login as apiLogin, type LoginResult } from "./api";
import { DEFAULT_ORG_ID } from "./constants";

// ── State ────────────────────────────────────────────────────────────────────

export type AuthStatus = "loading" | "unauthenticated" | "authenticated";

interface AuthState {
  status: AuthStatus;
  token: string | null;
  customer: StoredCustomer | null;
  orgId: string | null;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
}

type AuthAction =
  | { type: "LOADED"; token: string | null; customer: StoredCustomer | null; orgId: string | null; biometricAvailable: boolean; biometricEnabled: boolean }
  | { type: "LOGIN"; token: string; customer: StoredCustomer; orgId: string }
  | { type: "LOGOUT" }
  | { type: "SET_BIOMETRIC"; enabled: boolean };

function reducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "LOADED":
      return {
        ...state,
        status: action.token ? "authenticated" : "unauthenticated",
        token: action.token,
        customer: action.customer,
        orgId: action.orgId,
        biometricAvailable: action.biometricAvailable,
        biometricEnabled: action.biometricEnabled,
      };
    case "LOGIN":
      return { ...state, status: "authenticated", token: action.token, customer: action.customer, orgId: action.orgId };
    case "LOGOUT":
      return { ...state, status: "unauthenticated", token: null, customer: null };
    case "SET_BIOMETRIC":
      return { ...state, biometricEnabled: action.enabled };
    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface AuthContextValue extends AuthState {
  login: (phone: string, password: string, orgId?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  loginWithBiometric: () => Promise<boolean>;
  enableBiometric: () => Promise<void>;
  disableBiometric: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    status: "loading",
    token: null,
    customer: null,
    orgId: null,
    biometricAvailable: false,
    biometricEnabled: false,
  });

  useEffect(() => {
    (async () => {
      const [token, customer, orgId, biometricEnabled, hardwareAvailable] = await Promise.all([
        getToken(),
        getCustomer(),
        getOrgId(),
        getBiometricEnabled(),
        LocalAuthentication.hasHardwareAsync(),
      ]);
      const biometricAvailable = hardwareAvailable && (await LocalAuthentication.isEnrolledAsync());
      dispatch({
        type: "LOADED",
        token,
        customer,
        orgId: orgId ?? DEFAULT_ORG_ID ?? null,
        biometricAvailable,
        biometricEnabled,
      });
    })();
  }, []);

  const login = async (phone: string, password: string, orgId?: string): Promise<LoginResult> => {
    const effectiveOrgId = orgId ?? state.orgId ?? DEFAULT_ORG_ID;
    const result = await apiLogin(effectiveOrgId, phone, password);
    const customer: StoredCustomer = result.customer;
    await Promise.all([
      saveToken(result.token),
      saveCustomer(customer),
      saveOrgId(effectiveOrgId),
    ]);
    dispatch({ type: "LOGIN", token: result.token, customer, orgId: effectiveOrgId });
    return result;
  };

  const logout = async () => {
    await clearAll();
    dispatch({ type: "LOGOUT" });
  };

  const loginWithBiometric = async (): Promise<boolean> => {
    if (!state.biometricAvailable || !state.biometricEnabled) return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "ISP Nexus-এ প্রবেশ করুন",
      fallbackLabel: "পাসওয়ার্ড ব্যবহার করুন",
      cancelLabel: "বাতিল",
    });
    if (!result.success) return false;
    // Token is already stored — biometric just unlocks the existing session
    const token = await getToken();
    const customer = await getCustomer();
    const orgId = await getOrgId();
    if (!token || !customer || !orgId) return false;
    dispatch({ type: "LOGIN", token, customer, orgId });
    return true;
  };

  const enableBiometric = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "বায়োমেট্রিক সক্রিয় করতে নিশ্চিত করুন",
    });
    if (result.success) {
      await setBiometricEnabled(true);
      dispatch({ type: "SET_BIOMETRIC", enabled: true });
    }
  };

  const disableBiometric = async () => {
    await setBiometricEnabled(false);
    dispatch({ type: "SET_BIOMETRIC", enabled: false });
  };

  return React.createElement(
    AuthContext.Provider,
    { value: { ...state, login, logout, loginWithBiometric, enableBiometric, disableBiometric } },
    children,
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
