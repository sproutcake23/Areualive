// // THE BRIDGE between App Dev and the AI Model team.
// //
// // This is the ONLY file shared across the two ownership zones. App-dev code
// // calls the exported functions; it never calls model code directly. The AI
// // Team implements verifyFaceFrame / enrollFaceFrame as Vision Camera Frame
// // Processor Plugins (native-thread worklets).
// //
// // Do not change the function signatures without coordinating both teams and
// // updating types/index.ts together. See AGENTS.md → The Camera–Model Bridge.
// import type { Frame } from "react-native-vision-camera";

// import { config } from "@/constants/config";

// export type FaceVerificationInput = {
//   frame: Frame; // Vision Camera frame (native thread)
//   enrolledFaceDescriptor: number[]; // stored during enrollment, from MMKV
// };

// export type FaceVerificationResult = {
//   isMatch: boolean;
//   livenessConfirmed: boolean;
//   confidence: number; // 0.0 – 1.0
//   livenessStep?: "blink" | "smile" | "turn"; // current liveness challenge state
//   error?: string;
// };

// // TODO: AI Team — implement as a Vision Camera Frame Processor Plugin.
// // This runs on the native thread as a worklet. Do not use async/await here.
// export function verifyFaceFrame(
//   input: FaceVerificationInput
// ): FaceVerificationResult {
//   "worklet";
//   // Placeholder — replace with TFLite frame processor plugin.
//   throw new Error("verifyFaceFrame() not yet implemented by AI Team");
// }

// export type EnrollmentInput = {
//   frame: Frame; // single captured frame for enrollment
// };

// export type EnrollmentResult = {
//   faceDescriptor: number[]; // embedding — store in MMKV via authStore
//   error?: string;
// };

// // TODO: AI Team — implement enrollment frame processing.
// export function enrollFaceFrame(input: EnrollmentInput): EnrollmentResult {
//   "worklet";
//   throw new Error("enrollFaceFrame() not yet implemented by AI Team");
// }

// // ─── MOCKS (App Dev only — delete once the AI Team plugin lands) ──────────────
// //
// // These let us build and test UI before the model exists. They are plain async
// // functions, NOT worklets — never call them from a frame processor. They take no
// // Frame because there is nothing to process yet. See AGENTS.md → Coordination.

// export async function mockVerifyFace(): Promise<FaceVerificationResult> {
//   await new Promise((resolve) =>
//     setTimeout(resolve, config.MOCK_INFERENCE_DELAY_MS)
//   );
//   return {
//     isMatch: true,
//     livenessConfirmed: true,
//     confidence: 0.97,
//     livenessStep: "blink",
//   };
// }

// export async function mockEnrollFace(): Promise<EnrollmentResult> {
//   await new Promise((resolve) =>
//     setTimeout(resolve, config.MOCK_INFERENCE_DELAY_MS)
//   );
//   // A fake 128-dimension descriptor so storage/enrollment flows can be exercised.
//   return {
//     faceDescriptor: Array.from({ length: 128 }, () => 0),
//   };
// }

// import type { TensorflowModel } from "react-native-fast-tflite";
// import type { Frame } from "react-native-vision-camera";

// // =============================================================================
// // 🧠 GLOBAL NATIVE AI INTERPRETERS
// // =============================================================================

// let miniFasNetInterpreter: TensorflowModel | null = null;
// let mobileFaceNetInterpreter: TensorflowModel | null = null;

// export function initializeBridgeModels(fasModel: TensorflowModel, faceNetModel: TensorflowModel) {
//   miniFasNetInterpreter = fasModel;
//   mobileFaceNetInterpreter = faceNetModel;
// }

// // =============================================================================
// // 🗺️ EXPORTED TYPE DEFINITIONS
// // =============================================================================

// export type FaceVerificationInput = {
//   frame: Frame;
//   enrolledFaceDescriptor: number[];
//   currentChallenge: "blink" | "smile" | "turn";
//   // 🎯 PASS NATIVE RESIZE AND DETECTOR PLUGINS CONTEXT FROM THE UI COMPONENT
//   resizePlugin: any;
//   faceDetectorPlugin: any;
// };

// export type FaceVerificationResult = {
//   isMatch: boolean;
//   livenessConfirmed: boolean;
//   confidence: number;
//   livenessStep?: "blink" | "smile" | "turn";
//   error?: string;
// };

// export type EnrollmentInput = {
//   frame: Frame;
//   resizePlugin: any;
//   faceDetectorPlugin: any;
// };

// export type EnrollmentResult = {
//   faceDescriptor: number[];
//   error?: string;
// };

// // =============================================================================
// // ⚡ INTERNAL NATIVE MATH HEURISTICS (Worklet Validated)
// // =============================================================================

// function calculateEAR(p1: any, p2: any, p3: any, p4: any, p5: any, p6: any): number {
//   "worklet";
//   const v1 = Math.sqrt(Math.pow(p2.x - p6.x, 2) + Math.pow(p2.y - p6.y, 2));
//   const v2 = Math.sqrt(Math.pow(p3.x - p5.x, 2) + Math.pow(p3.y - p5.y, 2));
//   const h = Math.sqrt(Math.pow(p1.x - p4.x, 2) + Math.pow(p1.y - p4.y, 2));
//   return (v1 + v2) / (2.0 * h);
// }

// function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
//   "worklet";
//   let dotProduct = 0.0;
//   let normA = 0.0;
//   let normB = 0.0;
//   for (let i = 0; i < vecA.length; i++) {
//     dotProduct += vecA[i] * vecB[i];
//     normA += vecA[i] * vecA[i];
//     normB += vecB[i] * vecB[i];
//   }
//   if (normA === 0 || normB === 0) return 0;
//   return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
// }

// // =============================================================================
// // 🚀 ACTIVE FRAME PROCESSING PIPELINE
// // =============================================================================

// export function verifyFaceFrame(input: FaceVerificationInput): FaceVerificationResult {
//   "worklet";
  
//   if (!miniFasNetInterpreter || !mobileFaceNetInterpreter) {
//     return { isMatch: false, livenessConfirmed: false, confidence: 0, error: "AI Interpreters not initialized" };
//   }

//   try {
//     const { frame, enrolledFaceDescriptor, currentChallenge, resizePlugin, faceDetectorPlugin } = input;

//     // 🎯 STEP 1: INVOKE THE FACE DETECTOR WORKLET DIRECTLY PASSED FROM COMPONENT
//     const faces = faceDetectorPlugin(frame); 
//     if (!faces || faces.length === 0) {
//       return { isMatch: false, livenessConfirmed: false, confidence: 0, error: "No face detected" };
//     }
    
//     const primaryFace = faces[0];
//     const landmarks = primaryFace.landmarks; 

//     // 🎯 STEP 2: RUN HEURISTIC MATH CONTROLLER FOR LIVENESS CHALLENGES
//     let challengePassed = false;

//     if (currentChallenge === "blink") {
//       const leftEAR = calculateEAR(landmarks.leftEyeOuter, landmarks.leftEyeTop, landmarks.leftEyeBottom, landmarks.leftEyeInner, landmarks.leftEyeBottom, landmarks.leftEyeTop);
//       const rightEAR = calculateEAR(landmarks.rightEyeInner, landmarks.rightEyeTop, landmarks.rightEyeBottom, landmarks.rightEyeOuter, landmarks.rightEyeBottom, landmarks.rightEyeTop);
//       const averageEAR = (leftEAR + rightEAR) / 2.0;
      
//       if (averageEAR < 0.22) challengePassed = true;
//     } 
    
//     else if (currentChallenge === "smile") {
//       const leftCorner = landmarks.mouthLeft;
//       const rightCorner = landmarks.mouthRight;
//       const topLip = landmarks.noseBase; // Fallback relative calculation point
//       const bottomLip = landmarks.mouthBottom;
      
//       const lipWidth = Math.sqrt(Math.pow(rightCorner.x - leftCorner.x, 2) + Math.pow(rightCorner.y - leftCorner.y, 2));
//       const lipHeight = Math.sqrt(Math.pow(bottomLip.y - topLip.y, 2) + Math.pow(bottomLip.x - topLip.x, 2));
      
//       if ((lipWidth / lipHeight) > 3.2) challengePassed = true;
//     } 
    
//     else if (currentChallenge === "turn") {
//       // Evaluate face angle orientation directly using the plugin's built-in orientation calculations
//       if (Math.abs(primaryFace.yawAngle) > 18) challengePassed = true;
//     }

//     if (!challengePassed) {
//       return { isMatch: false, livenessConfirmed: false, confidence: 0, livenessStep: currentChallenge };
//     }

//     // 🎯 STEP 3: BOUNDS EXTRACTION & CROPPING RESIZE FOR MINIFASNET ANTI-SPOOFING (80x80)
//     const bounding = primaryFace.bounds; 
//     if (!bounding) {
//       return { isMatch: false, livenessConfirmed: false, confidence: 0, error: "Invalid face bounds" };
//     }

//     // Explicit coordinate scaling 
//     const x = bounding.x;
//     const y = bounding.y;
//     const width = bounding.width;
//     const height = bounding.height;
        
//     const croppedFasBuffer = resizePlugin(frame, {
//       scale: { width: 80, height: 80 }, // 🎯 FIXED: Correct model specifications
//       crop: { x, y, width, height },
//       pixelFormat: 'rgb',
//       dataType: 'uint8'
//     });

//     const fasOutput = miniFasNetInterpreter.runSync([croppedFasBuffer.buffer]);
//     const realFaceProbability = new Float32Array(fasOutput[0])[1]; 

//     if (realFaceProbability < 0.85) {
//       return { isMatch: false, livenessConfirmed: true, confidence: 0, error: "Spoof attack detected (FAS failure)" };
//     }

//     // 🎯 STEP 4: FEATURE EXTRACTION VIA MOBILEFACENET (112x112)
//     const croppedFaceNetBuffer = resizePlugin(frame, {
//       scale: { width: 112, height: 112 },
//       crop: { x, y, width, height },
//       pixelFormat: 'rgb',
//       dataType: 'uint8'
//     });

//     const embeddingOutput = mobileFaceNetInterpreter.runSync([croppedFaceNetBuffer.buffer]);
//     const currentFaceDescriptor = Array.from(new Float32Array(embeddingOutput[0])) as number[]; 

//     // 🎯 STEP 5: COSINE SIMILARITY EVALUATION
//     const similarityScore = calculateCosineSimilarity(currentFaceDescriptor, enrolledFaceDescriptor);
//     const IS_MATCH_THRESHOLD = 0.78;

//     return {
//       isMatch: similarityScore >= IS_MATCH_THRESHOLD,
//       livenessConfirmed: true,
//       confidence: similarityScore,
//       livenessStep: currentChallenge
//     };

//   } catch (err: any) {
//     return { isMatch: false, livenessConfirmed: false, confidence: 0, error: err.message || "Inference error" };
//   }
// }

// export function enrollFaceFrame(input: EnrollmentInput): EnrollmentResult {
//   "worklet";

//   if (!mobileFaceNetInterpreter) {
//     return { faceDescriptor: [], error: "MobileFaceNet engine offline" };
//   }

//   try {
//     const { frame, resizePlugin, faceDetectorPlugin } = input;
    
//     const faces = faceDetectorPlugin(frame);
//     if (!faces || faces.length === 0) {
//       return { faceDescriptor: [], error: "No target face found for enrollment" };
//     }

//     const bounding = faces[0].bounds;
//     const croppedFaceNetBuffer = resizePlugin(frame, {
//       scale: { width: 112, height: 112 },
//       crop: { x: bounding.x, y: bounding.y, width: bounding.width, height: bounding.height },
//       pixelFormat: 'rgb',
//       dataType: 'uint8'
//     });

//     const embeddingOutput = mobileFaceNetInterpreter.runSync([croppedFaceNetBuffer.buffer]);
//     const generatedDescriptor = Array.from(new Float32Array(embeddingOutput[0])) as number[];

//     return {
//       faceDescriptor: generatedDescriptor
//     };

//   } catch (err: any) {
//     return { faceDescriptor: [], error: err.message || "Enrollment processing failed" };
//   }
// }

// // ─── MOCKS REMAIN UNCHANGED FOR CLEAN BACKWARDS COMPATIBILITY ──────────────
// export async function mockVerifyFace(): Promise<FaceVerificationResult> {
//   return { isMatch: true, livenessConfirmed: true, confidence: 0.97, livenessStep: "blink" };
// }

// export async function mockEnrollFace(): Promise<EnrollmentResult> {
//   return { faceDescriptor: Array.from({ length: 128 }, () => 0) };
// }

import type { TensorflowModel } from "react-native-fast-tflite";
import type { Frame } from "react-native-vision-camera";

// =============================================================================
// 🧠 GLOBAL NATIVE AI INTERPRETERS
// =============================================================================

// 🎯 Extend the TypeScript global interface so it doesn't throw a compilation warning
let miniFasNetInterpreter: TensorflowModel | null = null;
let mobileFaceNetInterpreter: TensorflowModel | null = null;


export function initializeBridgeModels(fasModel: TensorflowModel, faceNetModel: TensorflowModel) {
  // 🛰️ Bind directly to the global engine context
  miniFasNetInterpreter = fasModel;
  mobileFaceNetInterpreter = faceNetModel;
  
  console.log("🧠 [JSI Bridge Memory Bind] Interpreters successfully mapped and stable!");
}

// =============================================================================
// 🗺️ EXPORTED TYPE DEFINITIONS
// =============================================================================

export type FaceVerificationInput = {
  frame: Frame;
  enrolledFaceDescriptor: number[];
  currentChallenge: "blink" | "smile" | "turn";
  resizePlugin: any;
  faceDetectorPlugin: any;
  boxedAntiSpoofInterpreter: any;
  boxedMobileFaceInterpreter: any;
};

export type FaceVerificationResult = {
  isMatch: boolean;
  livenessConfirmed: boolean;
  confidence: number;
  livenessStep?: "blink" | "smile" | "turn";
  error?: string;
  diagonise?: any;
};

export type EnrollmentInput = {
  frame: Frame;
  resizePlugin: any;
  faceDetectorPlugin: any;
  boxedMobileFaceInterpreter: any;
};

export type EnrollmentResult = {
  faceDescriptor: number[];
  error?: string;
};

function convertFloatArrayToBmpUri(floatArray: Float32Array, width: number, height: number): string {
  "worklet"; // 🔥 Enforces that this entire function runs on the C++ thread
  
  const padding = (4 - ((width * 3) % 4)) % 4;
  const pixelDataSize = (width * 3 + padding) * height;
  const fileSize = 54 + pixelDataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // --- WRITE BMP HEADER ---
  view.setUint8(0, 0x42); view.setUint8(1, 0x4D); // 'BM'
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setUint32(18, width, true);
  view.setUint32(22, -height, true); 
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true); 
  view.setUint32(34, pixelDataSize, true);

  const bmpBytes = new Uint8Array(buffer, 54);
  let srcIdx = 0;
  let dstIdx = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = Math.max(0, Math.min(255, Math.floor(floatArray[srcIdx] * 128.0 + 127.5)));
      let g = Math.max(0, Math.min(255, Math.floor(floatArray[srcIdx + 1] * 128.0 + 127.5)));
      let b = Math.max(0, Math.min(255, Math.floor(floatArray[srcIdx + 2] * 128.0 + 127.5)));

      bmpBytes[dstIdx]     = b; 
      bmpBytes[dstIdx + 1] = g; 
      bmpBytes[dstIdx + 2] = r; 
      
      srcIdx += 3;
      dstIdx += 3;
    }
    dstIdx += padding;
  }

  // 🎯 THE WORKLET FIX: Pure JavaScript Base64 lookup engine (No global btoa required!)
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const totalBytes = new Uint8Array(buffer);
  let base64String = "";
  let i = 0;

  while (i < totalBytes.length) {
    const byte1 = totalBytes[i++];
    const byte2 = i < totalBytes.length ? totalBytes[i++] : NaN;
    const byte3 = i < totalBytes.length ? totalBytes[i++] : NaN;

    const enc1 = byte1 >> 2;
    const enc2 = ((byte1 & 3) << 4) | (isNaN(byte2) ? 0 : byte2 >> 4);
    const enc3 = isNaN(byte2) ? 64 : ((byte2 & 15) << 2) | (isNaN(byte3) ? 0 : byte3 >> 6);
    const enc4 = isNaN(byte3) ? 64 : byte3 & 63;

    base64String += chars.charAt(enc1) + chars.charAt(enc2) +
                    (enc3 === 64 ? "=" : chars.charAt(enc3)) +
                    (enc4 === 64 ? "=" : chars.charAt(enc4));
  }

  return `data:image/bmp;base64,${base64String}`;
}
// =============================================================================
// ⚡ INTERNAL NATIVE MATH HEURISTICS (Worklet Validated)
// =============================================================================

function calculateEAR(p1: any, p2: any, p3: any, p4: any, p5: any, p6: any): number {
  "worklet";
  const v1 = Math.sqrt(Math.pow(p2.x - p6.x, 2) + Math.pow(p2.y - p6.y, 2));
  const v2 = Math.sqrt(Math.pow(p3.x - p5.x, 2) + Math.pow(p3.y - p5.y, 2));
  const h = Math.sqrt(Math.pow(p1.x - p4.x, 2) + Math.pow(p1.y - p4.y, 2));
  return (v1 + v2) / (2.0 * h);
}

  function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
    "worklet";
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// =============================================================================
// 🚀 ACTIVE FRAME PROCESSING PIPELINE
// =============================================================================

export function verifyFaceFrame(input: FaceVerificationInput): FaceVerificationResult {
  "worklet";

  const { frame, enrolledFaceDescriptor, currentChallenge, resizePlugin, faceDetectorPlugin, boxedAntiSpoofInterpreter,boxedMobileFaceInterpreter } = input;
  console.log("🔍 [verifyFaceFrame] 1. Function entered successfully.");

  if (!boxedAntiSpoofInterpreter || !boxedMobileFaceInterpreter) {
    return { isMatch: false, livenessConfirmed: false, confidence: 0, error: "AI Interpreters not initialized" };
  }

  try {

    // 📸 TRACE 1: Stream Entry Point (Runs at 30-60 FPS for MediaPipe tracking)
    // Uncomment the line below if you want to see the raw stream fire
    // console.log("📷 [Stream Entry] Passing raw frame ID:", frame.toString(), "to MediaPipe Face Detector.");

    // 🎯 STEP 1: INVOKE THE FACE DETECTOR WORKLET
    const faces = faceDetectorPlugin.detectFaces(frame); 
    console.log("🔍 [verifyFaceFrame] 2. Face Detector complete. Faces found:", faces?.length);

    if (!faces || faces.length === 0 || faces[0] == null) {
      console.log("🔍 [verifyFaceFrame] 🛑 No faces in this frame. Exiting early.");
      return { isMatch: false, livenessConfirmed: false, confidence: 0, error: "No face detected" };
    }
    
    const primaryFace = faces[0];

// 🎯 DEFENSIVE PRODUCTION GUARD
    if (!primaryFace.landmarks || typeof primaryFace.landmarks !== 'object' || Object.keys(primaryFace.landmarks).length === 0) {
      console.log("🔍 [verifyFaceFrame] 🚧 Frame skipped: Bounding box tracked, but waiting for facial vector landmarks to resolve...");
      return { 
        isMatch: false, 
        livenessConfirmed: false, 
        confidence: 0, 
        error: "WAITING_FOR_LANDMARKS" // Returning a specific error allows the frame processor to loop cleanly without breaking layout states
      };
    }
    
    const landmarks = primaryFace.landmarks; 
    console.log("🔍 [verifyFaceFrame] 3. Primary face landmark check passing... MLKit Mapped.");

    // 🎯 STEP 2: RUN HEURISTIC MATH CONTROLLER FOR LIVENESS CHALLENGES
    let challengePassed = false;

    if (currentChallenge === "blink") {
      // 🔏 MLKit Extraction Rule: Pull the probabilities from the primary face object body, NOT landmarks!
      const leftOpenProb = primaryFace.leftEyeOpenProbability;
      const rightOpenProb = primaryFace.rightEyeOpenProbability;
      
      console.log(`👁️ [Blink Tracking Scan] Left Open: ${leftOpenProb?.toFixed(2)}, Right Open: ${rightOpenProb?.toFixed(2)}`);

      if (leftOpenProb != null && rightOpenProb != null) {
        const averageOpenProbability = (leftOpenProb + rightOpenProb) / 2.0;
        
        // If the average open probability drops below 0.25, the user has closed their eyes!
        if (averageOpenProbability < 0.25) {
          challengePassed = true;
          console.log("🎉 [Liveness Match] Blink registered successfully!");
        }
      } else {
        console.log("⚠️ [Config Error] leftEyeOpenProbability is missing. Ensure classificationMode: 'all' is set in your hook config.");
      }
    } 
    
    else if (currentChallenge === "smile") {
      // 🔏 MLKit Extraction Rule: Use the exact discovered capitalized keys!
      const leftCorner = landmarks.MOUTH_LEFT;
      const rightCorner = landmarks.MOUTH_RIGHT;
      const topLip = landmarks.NOSE_BASE; 
      const bottomLip = landmarks.MOUTH_BOTTOM;
      
      if (leftCorner && rightCorner && topLip && bottomLip) {
        const lipWidth = Math.sqrt(Math.pow(rightCorner.x - leftCorner.x, 2) + Math.pow(rightCorner.y - leftCorner.y, 2));
        const lipHeight = Math.sqrt(Math.pow(bottomLip.y - topLip.y, 2) + Math.pow(bottomLip.x - topLip.x, 2));
        
        const smileRatio = lipWidth / lipHeight;
        console.log(`👄 [Smile Ratio Scan]: ${smileRatio.toFixed(2)}`);

        if (smileRatio > 1.05) { // Adjusted for MLKit flat anchors
          challengePassed = true;
          console.log("🎉 [Liveness Match] Smile registered successfully!");
        }
      } else {
        console.log("⚠️ [Config Error] Missing mouth keys for smile evaluation.");
      }
    } 
    
    else if (currentChallenge === "turn") {
      // MLKit tracks face orientation using pitch, roll, and yaw angles natively
      console.log(`📐 [Head Yaw Scan]: ${primaryFace.yawAngle?.toFixed(2)}°`);
      if (primaryFace.yawAngle != null && Math.abs(primaryFace.yawAngle) > 10) {
        challengePassed = true;
        console.log("🎉 [Liveness Match] Head turn registered successfully!");
      }
    }

    // 🚧 TOLL BOOTH GATE: If the user hasn't completed the liveness challenge yet, 
    // we stop execution right here. TFLite models are never called!
    if (!challengePassed) {
      console.log("🔍 [verifyFaceFrame] 3. Failed to pass the challenge...");
      return { isMatch: false, livenessConfirmed: false, confidence: 0, livenessStep: currentChallenge };
    }

    // 🛑 🏁 CRITICAL JUNCTION: The challenge just passed!
    // Out of hundreds of continuous streaming video frames, THIS specific single frame 
    // is selected to pass through the heavy TFLite models.
    console.log("🚦 [GATE PASSED] -> Liveness confirmed via MediaPipe! Isolate this single frame for TFLite inference.");

    const bounding = primaryFace.bounds; 
    if (!bounding) {
      return { isMatch: false, livenessConfirmed: false, confidence: 0, error: "Invalid face bounds" };
    }

    // 🎯 NEW: COORDINATE MAPPING LOGIC (UI/Oriented -> Buffer Space)
    // Most Android front cameras are landscape-native (e.g. 1280x720).
    // If the phone is held in portrait, MLKit returns bounds in oriented space (720x1280).
    // We must map these back to the raw 1280x720 buffer for the resizePlugin.
    let cropX = bounding.x;
    let cropY = bounding.y;
    let cropW = bounding.width;
    let cropH = bounding.height;

    if (frame.orientation === 'landscape-left') {
      // 90° CW Rotation
      cropX = frame.width - bounding.y - bounding.height;
      cropY = bounding.x;
      cropW = bounding.height;
      cropH = bounding.width;
    } else if (frame.orientation === 'landscape-right') {
      // 270° CW Rotation
      cropX = bounding.y;
      cropY = frame.height - bounding.x - bounding.width;
      cropW = bounding.height;
      cropH = bounding.width;
    } else if (frame.orientation === 'portrait-upside-down') {
      cropX = frame.width - bounding.x - bounding.width;
      cropY = frame.height - bounding.y - bounding.height;
    }

    console.log(`📸 [Frame Metadata] Size: ${frame.width}x${frame.height}, Orientation: ${frame.orientation}`);
    console.log(`🎯 [Oriented Bounds] x: ${bounding.x}, y: ${bounding.y}, w: ${bounding.width}, h: ${bounding.height}`);
    console.log(`✂️ [Buffer Crop] x: ${cropX.toFixed(0)}, y: ${cropY.toFixed(0)}, w: ${cropW.toFixed(0)}, h: ${cropH.toFixed(0)}`);

    console.log("✂️ [Crop 2/2] Resizing target frame region to 112x112 for Vector Generation...");
    const croppedFaceNetBuffer = resizePlugin(frame, {
      scale: { width: 112, height: 112 },
      crop: { x: cropX, y: cropY, width: cropW, height: cropH },
      rotation: frame.orientation, // 🔥 CRITICAL: Rotate the crop to be upright for the model
      pixelFormat: 'rgb',
      dataType: 'float32'
    });
    console.log("   └─ Allocated Buffer Bytes:", croppedFaceNetBuffer.buffer.byteLength); // Verify sequence space (37632 bytes)


    console.log("🧠 [Inference 2/2] Extracting Face Vector via Synchronous MobileFaceNet...");
    const mobileFaceModel = boxedMobileFaceInterpreter.unbox() as TensorflowModel;
    
    // 🔥 FIX: Explicitly deep-copy the buffer to the JS heap to allow mutation
    const faceNetFloatArray = Float32Array.from(new Float32Array(croppedFaceNetBuffer.buffer));
    
    // Check if mutation works
    const firstValBefore = faceNetFloatArray[0];
    for (let i = 0; i < faceNetFloatArray.length; i++) {
      faceNetFloatArray[i] = (faceNetFloatArray[i] - 127.5) / 128.0;    
    }
    const firstValAfter = faceNetFloatArray[0];
    console.log(`🧪 [Mutation Check] Before: ${firstValBefore.toFixed(2)}, After: ${firstValAfter.toFixed(6)}`);

    const visualCropUri = convertFloatArrayToBmpUri(faceNetFloatArray, 112, 112);
    const embeddingOutput = mobileFaceModel.runSync([faceNetFloatArray.buffer]);


    const currentFaceDescriptor = Array.from(new Float32Array(embeddingOutput[0])) as number[]; 
    console.log("   └─ Vector Generation Complete! Created matrix array length:", currentFaceDescriptor.length); // 128 elements

    // 🎯 STEP 5: COSINE SIMILARITY EVALUATION
    const similarityScore = calculateCosineSimilarity(currentFaceDescriptor, enrolledFaceDescriptor);
    console.log("Enrolled vector", enrolledFaceDescriptor);
    console.log("Current vector", currentFaceDescriptor);
    console.log("📊 [Match Calculation] Computed Cosine Similarity against Enrolled User:", similarityScore.toFixed(8));

    const IS_MATCH_THRESHOLD = 0.78;
    const isMatch = similarityScore >= IS_MATCH_THRESHOLD;
    console.log(isMatch ? "🎉 [SUCCESS] Biometric Match Confirmed!" : "🔒 [REJECTED] Biometric Face Mismatch.");

    return {
      isMatch,
      livenessConfirmed: true,
      confidence: similarityScore,
      livenessStep: currentChallenge,
      diagonise: visualCropUri,
    };

  } catch (err: any) {
    console.error("💥 [CRITICAL CRASH] Pipeline failed unexpectedly:", err.message);
    return { isMatch: false, livenessConfirmed: false, confidence: 0, error: err.message || "Inference error" };
  }
}





// Update the internal calls in verifyFaceFrame and enrollFaceFrame:
export function enrollFaceFrame(input: EnrollmentInput) {
  "worklet";

  const { frame, resizePlugin, faceDetectorPlugin, boxedMobileFaceInterpreter } = input;

  console.log("🔘 [Bridge Entry] Inside enrollFaceFrame function scope.");

  if (!boxedMobileFaceInterpreter) {
    console.log("❌ [Bridge Error] MobileFaceNet interpreter is null!");
    return { faceDescriptor: [], error: "MobileFaceNet isntance is undefined in worklet thread" };
  }

  try {
    
    console.log("🚀 [Bridge Executing] Invoking faceDetectorPlugin.detectFaces...");
    
    // 🎯 Calling the direct JSI scanning engine method on the passed object
    const faces = faceDetectorPlugin.detectFaces(frame);
    
    console.log("🛰️ [Detector Output] Faces scanned array count:", faces ? faces.length : 0);

    if (!faces || faces.length === 0) {
      console.log("❌ [Detector Halt] No target face identified in this frame buffer snapshot.");
      return { faceDescriptor: [], error: "No target face found for enrollment" };
    }

    const bounding = faces[0].bounds;
    
    // 🎯 NEW: COORDINATE MAPPING LOGIC (UI/Oriented -> Buffer Space)
    let cropX = bounding.x;
    let cropY = bounding.y;
    let cropW = bounding.width;
    let cropH = bounding.height;

    if (frame.orientation === 'landscape-left') {
      cropX = frame.width - bounding.y - bounding.height;
      cropY = bounding.x;
      cropW = bounding.height;
      cropH = bounding.width;
    } else if (frame.orientation === 'landscape-right') {
      cropX = bounding.y;
      cropY = frame.height - bounding.x - bounding.width;
      cropW = bounding.height;
      cropH = bounding.width;
    } else if (frame.orientation === 'portrait-upside-down') {
      cropX = frame.width - bounding.x - bounding.width;
      cropY = frame.height - bounding.y - bounding.height;
    }

    console.log("✂️ [Crop Pass] Found face bounds. Commencing 112x112 image downsampling matrix extraction...");

    const croppedFaceNetBuffer = resizePlugin(frame, {
      scale: { width: 112, height: 112 },
      crop: { x: cropX, y: cropY, width: cropW, height: cropH },
      rotation: frame.orientation,
      pixelFormat: 'rgb',
      dataType: 'float32'
    });

    console.log("🧠 [Inference Pass] Feeding raw buffer elements into MobileFaceNet sync matrix execution...");
    const activeModel = boxedMobileFaceInterpreter.unbox() as TensorflowModel;
    
    // 🔥 FIX: Explicitly deep-copy the buffer to the JS heap to allow mutation
    const faceNetFloatArray = Float32Array.from(new Float32Array(croppedFaceNetBuffer.buffer));
    
    for (let i = 0; i < faceNetFloatArray.length; i++) {
      faceNetFloatArray[i] = (faceNetFloatArray[i] - 127.5) / 128.0;    
    }
    const embeddingOutput = activeModel.runSync([faceNetFloatArray.buffer]);
    
    
    const generatedDescriptor = Array.from(new Float32Array(embeddingOutput[0])) as number[];
    console.log("🎉 [Inference Complete] Array successfully populated. Elements generated:", generatedDescriptor.length);

    return {
      faceDescriptor: generatedDescriptor
    };

  } catch (err: any) {
    console.log("💥 [Bridge Exception] Execution threw a hard native error:", err.message || err);
    return { faceDescriptor: [], error: err.message || "Enrollment processing failed" };
  }
}