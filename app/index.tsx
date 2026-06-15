// Entry point: redirect based on enrollment state. No UI of its own.
import { useRouter } from "expo-router";
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useAuthStore } from "@/store/authStore";

export default function Index() {
  const router = useRouter();
  const isEnrolled = useAuthStore((s) => s.isEnrolled);

  return (
    <View className="flex-1 bg-slate-950 justify-center items-center px-6">
      
      {/* Header Branding Section */}
      <View className="items-center mb-16">
        <Text className="text-amber-400 text-4xl font-extrabold tracking-widest mb-2">
          AREUALIVE
        </Text>
        <Text className="text-slate-400 text-sm font-medium tracking-wide text-center">
          Biometric Anti-Spoofing & Liveness Pipeline
        </Text>
      </View>

      {/* =============================================================================
          🔘 NAVIGATION BUTTONS CONTAINER
          ============================================================================= */}
      <View className="w-full space-y-4 gap-4">
        
        {/* 📝 Button 1: Face Profile Enrollment */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push("/(auth)/enrollment")}
          className="w-full bg-amber-500 py-4 rounded-2xl shadow-xl active:bg-amber-600 border border-amber-400/20"
        >
          <Text className="text-slate-950 font-black text-center text-base tracking-wider uppercase">
            Create New Enrollment
          </Text>
        </TouchableOpacity>

        {/* 🔓 Button 2: Live Face Verification */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push("/verify")}
          className="w-full bg-slate-900 py-4 rounded-2xl shadow-xl active:bg-slate-800 border border-slate-800"
        >
          <Text className="text-white font-bold text-center text-base tracking-wider uppercase">
            Verify Live Identity
          </Text>
        </TouchableOpacity>

      </View>

      {/* Footer Version Tag */}
      <Text className="text-slate-600 text-xs absolute bottom-8 font-mono">
        v1.0.0 • MobileFaceNet TFLite Engine
      </Text>
    </View>
  );

}
