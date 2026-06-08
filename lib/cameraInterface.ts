import type { TensorflowModel } from "react-native-fast-tflite";
import type { Frame } from "react-native-vision-camera";

export type FaceVerificationInput = {
  frame: Frame;
  enrolledFaceDescriptor: number[];
  currentChallenge: "blink" | "smile" | "turn";
  resizePlugin: any;
  faceDetectorPlugin: any;
  boxedMobileFaceInterpreter: any;
  user: any;
  cameraPosition: "front" | "back";
  isFlashOn: boolean;
};

export type FaceVerificationResult = {
  isMatch: boolean;
  livenessConfirmed: boolean;
  confidence: number;
  livenessStep?: "blink" | "smile" | "turn";
  error?: string;
  diagonise?: string;
};

export type EnrollmentInput = {
  frame: Frame;
  resizePlugin: any;
  faceDetectorPlugin: any;
  boxedMobileFaceInterpreter: any;
  cameraPosition: "front" | "back";
  isFlashOn: boolean;
};

export type EnrollmentResult = {
  faceDescriptor: number[];
  error?: string;
  diagnose?: string;
};

// =============================================================================
// ⚙️ REUSABLE SHARED FACE DETECTION UTILITY
// =============================================================================
function detectPrimaryFace(faceDetectorPlugin: any, frame: Frame): any {
  "worklet";
  const faces = faceDetectorPlugin.detectFaces(frame); 
  if (!faces || faces.length === 0 || faces[0] == null) {
    return null;
  }
  return faces[0];
}

// =============================================================================
// 🎯 CRITICAL CRASH FIX: WORKLET-SAFE BASE64 IMAGE GENERATOR
// =============================================================================
export function convertFloatArrayToBmpUri(floatArray: Float32Array, width: number, height: number): string {
  "worklet";
  
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
  view.setUint32(22, height, true); 
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true); // 24-bit RGB Channel Layout
  view.setUint32(34, pixelDataSize, true);

  const bmpBytes = new Uint8Array(buffer, 54);
  let dstIdx = 0;

  // Invert the y-axis pointer reading order to guarantee upright previews
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      let srcIdx = (y * width + x) * 3;

      let r = Math.max(0, Math.min(255, Math.floor(floatArray[srcIdx] * 128.0 + 127.5)));
      let g = Math.max(0, Math.min(255, Math.floor(floatArray[srcIdx + 1] * 128.0 + 127.5)));
      let b = Math.max(0, Math.min(255, Math.floor(floatArray[srcIdx + 2] * 128.0 + 127.5)));

      bmpBytes[dstIdx]     = b; 
      bmpBytes[dstIdx + 1] = g; 
      bmpBytes[dstIdx + 2] = r;
      
      dstIdx += 3;
    }
    dstIdx += padding;
  }

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const totalBytes = new Uint8Array(buffer);
  let base64 = "";
  
  for (let i = 0; i < totalBytes.length; i += 3) {
    const b1 = totalBytes[i];
    const b2 = i + 1 < totalBytes.length ? totalBytes[i + 1] : 0;
    const b3 = i + 2 < totalBytes.length ? totalBytes[i + 2] : 0;
    
    const enc1 = b1 >> 2;
    const enc2 = ((b1 & 3) << 4) | (b2 >> 4);
    const enc3 = i + 1 < totalBytes.length ? ((b2 & 15) << 2) | (b3 >> 6) : 64;
    const enc4 = i + 2 < totalBytes.length ? b3 & 63 : 64;
    
    base64 += chars.charAt(enc1) + chars.charAt(enc2) + 
              (enc3 === 64 ? "=" : chars.charAt(enc3)) + 
              (enc4 === 64 ? "=" : chars.charAt(enc4));
  }

  return `data:image/bmp;base64,${base64}`;
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
// 🔓 1. LIVE VERIFICATION FUNCTION (ANTISPOOF REMOVED)
// =============================================================================
export function verifyFaceFrame(input: FaceVerificationInput): FaceVerificationResult {
  "worklet";

  const { frame, enrolledFaceDescriptor, currentChallenge, resizePlugin, faceDetectorPlugin, boxedMobileFaceInterpreter, cameraPosition, isFlashOn } = input;

  if (!boxedMobileFaceInterpreter) {
    return { isMatch: false, livenessConfirmed: false, confidence: 0, error: "AI Models uninitialized" };
  }

  try {
    // 🎯 Shared Face Detection Hook
    const primaryFace = detectPrimaryFace(faceDetectorPlugin, frame);
    if (!primaryFace) {
      return { isMatch: false, livenessConfirmed: false, confidence: 0, error: "No face detected" };
    }
    
    if (!primaryFace.landmarks || Object.keys(primaryFace.landmarks).length === 0) {
      return { isMatch: false, livenessConfirmed: false, confidence: 0, error: "WAITING_FOR_LANDMARKS" };
    }

    const leftOpenProb = primaryFace.leftEyeOpenProbability ?? -1;
    const rightOpenProb = primaryFace.rightEyeOpenProbability ?? -1;
    const smileProb = primaryFace.smilingProbability ?? -1; 
    const headYaw = primaryFace.yawAngle ?? 0;

    console.log(
      "📊 [Verify Telemetry]:",
      `Left Open: ${leftOpenProb.toFixed(2)} | Right Open: ${rightOpenProb.toFixed(2)} | Yaw: ${headYaw.toFixed(1)}° | SmileProb: ${smileProb.toFixed(1)}`
    );

    let challengePassed = false;
    if (currentChallenge === "blink") {
      if (leftOpenProb !== -1 && rightOpenProb !== -1 && (leftOpenProb + rightOpenProb) / 2.0 < 0.25) {
        challengePassed = true;
      }
    } else if (currentChallenge === "smile") {
      const lm = primaryFace.landmarks;
      if (lm.MOUTH_LEFT && lm.MOUTH_RIGHT && lm.NOSE_BASE && lm.MOUTH_BOTTOM) {
        const lipWidth = Math.sqrt(Math.pow(lm.MOUTH_RIGHT.x - lm.MOUTH_LEFT.x, 2) + Math.pow(lm.MOUTH_RIGHT.y - lm.MOUTH_LEFT.y, 2));
        const lipHeight = Math.sqrt(Math.pow(lm.MOUTH_BOTTOM.y - lm.NOSE_BASE.y, 2) + Math.pow(lm.MOUTH_BOTTOM.x - lm.NOSE_BASE.x, 2));
        if (lipWidth / lipHeight > 1.05 || smileProb > 0.70) challengePassed = true;
      }
    } else if (currentChallenge === "turn") {
      if (Math.abs(headYaw) > 10) challengePassed = true;
    }

    if (!challengePassed) {
      return { isMatch: false, livenessConfirmed: false, confidence: 0, livenessStep: currentChallenge };
    }

    // --- SEAMLESS COORDINATE TRANSLATION MATRIX ---
    const bounding = primaryFace.bounds;
    const frameWidth = frame.width;
    const frameHeight = frame.height;
    const isPortrait = frame.orientation === 'portrait' || frame.orientation === 'portrait-upside-down';
    
    const canvasW = isPortrait ? frameWidth : frameHeight;
    const canvasH = isPortrait ? frameHeight : frameWidth;

    const screenCenterX = bounding.x + bounding.width / 2;
    const screenCenterY = bounding.y + bounding.height / 2;

    let sensorCenterX = isPortrait ? Math.floor((screenCenterX / canvasW) * frameWidth) : Math.floor((1.0 - (screenCenterY / canvasH)) * frameWidth);
    let sensorCenterY = isPortrait ? Math.floor((screenCenterY / canvasH) * frameHeight) : Math.floor((screenCenterX / canvasW) * frameHeight);

    const targetAxis = isPortrait ? frameHeight : frameWidth;
    const sensorFaceSize = Math.floor((Math.max(bounding.width, bounding.height) / canvasH) * targetAxis);

    let sensorCropX = Math.max(0, Math.min(frameWidth - 20, Math.floor(sensorCenterX - sensorFaceSize / 2)));
    let sensorCropY = Math.max(0, Math.min(frameHeight - 20, Math.floor(sensorCenterY - sensorFaceSize / 2)));
    let strictSquare = Math.min(Math.max(20, frameWidth - sensorCropX), Math.max(20, frameHeight - sensorCropY), sensorFaceSize);

    let correctRotation = "0deg";
    if (cameraPosition === "front") {
      correctRotation = isPortrait ? "0deg" : "270deg";
    } else {
      correctRotation = isPortrait ? "0deg" : "90deg"; 
    }

    const croppedFaceNetBuffer = resizePlugin(frame, {
      scale: { width: 112, height: 112 },
      crop: { x: sensorCropX, y: sensorCropY, width: strictSquare, height: strictSquare },
      pixelFormat: 'rgb',
      dataType: 'float32',
      rotation: correctRotation, 
      mirror: cameraPosition === "front"
    });
    
    const faceNetFloatArray = new Float32Array(croppedFaceNetBuffer.buffer);
    const visualCropUri = convertFloatArrayToBmpUri(faceNetFloatArray, 112, 112);

    for (let i = 0; i < faceNetFloatArray.length; i++) {
      faceNetFloatArray[i] = (faceNetFloatArray[i] * 2) - 1;    
    }
    
    const mobileFaceModel = boxedMobileFaceInterpreter.unbox() as TensorflowModel;
    const embeddingOutput = mobileFaceModel.runSync([faceNetFloatArray.buffer]);
    const currentFaceDescriptor = Array.from(new Float32Array(embeddingOutput[0])) as number[]; 

    const similarityScore = calculateCosineSimilarity(currentFaceDescriptor, enrolledFaceDescriptor);
    console.log(`Similarity score: ${similarityScore}`)

    return {
      isMatch: similarityScore >= 0.30,
      livenessConfirmed: true,
      confidence: similarityScore,
      livenessStep: currentChallenge,
      diagonise: visualCropUri,
    };

  } catch (err: any) {
    return { isMatch: false, livenessConfirmed: false, confidence: 0, error: err.message || "Inference exception" };
  }
}

// =============================================================================
// 📝 2. PROFILE ENROLLMENT FUNCTION
// =============================================================================
export function enrollFaceFrame(input: EnrollmentInput): EnrollmentResult {
  "worklet";

  const { frame, resizePlugin, faceDetectorPlugin, boxedMobileFaceInterpreter, cameraPosition, isFlashOn } = input;

  if (!boxedMobileFaceInterpreter) {
    return { faceDescriptor: [], error: "MobileFaceNet model offline." };
  }

  try {
    // 🎯 Shared Face Detection Hook applied to enrollment
    const primaryFace = detectPrimaryFace(faceDetectorPlugin, frame);
    if (!primaryFace) {
      return { faceDescriptor: [], error: "No target face found for enrollment" };
    }

    const bounding = primaryFace.bounds;
    const frameWidth = frame.width;
    const frameHeight = frame.height;
    const isPortrait = frame.orientation === 'portrait' || frame.orientation === 'portrait-upside-down';
    
    const canvasW = isPortrait ? frameWidth : frameHeight;
    const canvasH = isPortrait ? frameHeight : frameWidth;

    const screenCenterX = bounding.x + bounding.width / 2;
    const screenCenterY = bounding.y + bounding.height / 2;

    let sensorCenterX = isPortrait ? Math.floor((screenCenterX / canvasW) * frameWidth) : Math.floor((1.0 - (screenCenterY / canvasH)) * frameWidth);
    let sensorCenterY = isPortrait ? Math.floor((screenCenterY / canvasH) * frameHeight) : Math.floor((screenCenterX / canvasW) * frameHeight);

    const targetAxis = isPortrait ? frameHeight : frameWidth;
    const sensorFaceSize = Math.floor((Math.max(bounding.width, bounding.height) / canvasH) * targetAxis);

    let sensorCropX = Math.max(0, Math.min(frameWidth - 20, Math.floor(sensorCenterX - sensorFaceSize / 2)));
    let sensorCropY = Math.max(0, Math.min(frameHeight - 20, Math.floor(sensorCenterY - sensorFaceSize / 2)));
    let strictSquare = Math.min(Math.max(20, frameWidth - sensorCropX), Math.max(20, frameHeight - sensorCropY), sensorFaceSize);

    let correctRotation = "0deg";
    if (cameraPosition === "front") {
      correctRotation = isPortrait ? "0deg" : "270deg";
    } else {
      correctRotation = isPortrait ? "0deg" : "90deg"; 
    }

    const croppedFaceNetBuffer = resizePlugin(frame, {
      scale: { width: 112, height: 112 },
      crop: { x: sensorCropX, y: sensorCropY, width: strictSquare, height: strictSquare },
      pixelFormat: 'rgb',
      dataType: 'float32',
      rotation: correctRotation, 
      mirror: cameraPosition === "front"
    });

    const faceNetFloatArray = new Float32Array(croppedFaceNetBuffer.buffer);
    const enrollmentPreviewUri = convertFloatArrayToBmpUri(faceNetFloatArray, 112, 112);

    for (let i = 0; i < faceNetFloatArray.length; i++) {
      faceNetFloatArray[i] = (faceNetFloatArray[i] * 2) - 1;    
    }

    const activeModel = boxedMobileFaceInterpreter.unbox() as TensorflowModel;
    const embeddingOutput = activeModel.runSync([faceNetFloatArray.buffer]);
    const generatedDescriptor = Array.from(new Float32Array(embeddingOutput[0])) as number[];

    return {
      faceDescriptor: generatedDescriptor,
      diagnose: enrollmentPreviewUri
    };

  } catch (err: any) {
    return { faceDescriptor: [], error: err.message || "Enrollment failure" };
  }
}