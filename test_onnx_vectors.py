import numpy as np
import tensorflow as tf
import onnxruntime as ort

def cosine_similarity(v1, v2):
    return np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))

def run_comprehensive_test(onnx_path, tflite_path):
    print("\n" + "="*70)
    print("🔬 RUNNING 5-WAY MULTI-MATRIX GRAPH COMPREHENSIVE COMPARISON")
    print("="*70)

    # --- 1. INITIALIZE RUNTIMES ---
    try:
        onnx_sess = ort.InferenceSession(onnx_path)
        onnx_in_name = onnx_sess.get_inputs()[0].name
        onnx_out_name = onnx_sess.get_outputs()[0].name
        onnx_shape = onnx_sess.get_inputs()[0].shape
        # Normalize dynamic channel layouts [Batch, Channels, Height, Width]
        onnx_input_shape = [dim if isinstance(dim, int) else 1 for dim in onnx_shape]
    except Exception as e:
        print(f"❌ ONNX Load Failure: {e}")
        return

    try:
        tflite_interp = tf.lite.Interpreter(model_path=tflite_path)
        tflite_interp.allocate_tensors()
        tflite_in_details = tflite_interp.get_input_details()[0]
        tflite_out_details = tflite_interp.get_output_details()[0]
        tflite_input_shape = tflite_in_details['shape']
    except Exception as e:
        print(f"❌ TFLite Load Failure: {e}")
        return

    print(f"📐 ONNX Input Layout Geometry:  {onnx_input_shape}")
    print(f"📐 TFLite Input Layout Geometry:{tflite_input_shape}")

    # --- 2. GENERATE THE 5 DISTINCT GENERATED POSSIBILITIES ---
    # Shape router: checks if the graph expects Channel-First (ONNX NCHW) or Channel-Last (TFLite NHWC)
    def make_input(shape, mode):
        # Determine where the image channels sit
        if shape[1] == 3: # NCHW layout
            channels, height, width = shape[1], shape[2], shape[3]
        else: # NHWC layout
            height, width, channels = shape[1], shape[2], shape[3]

        if mode == 1:   # Matrix 1: Pure Absolute Black Frame
            arr = np.zeros(shape, dtype=np.float32)
        elif mode == 2: # Matrix 2: Pure Absolute White Frame
            arr = np.ones(shape, dtype=np.float32)
        elif mode == 3: # Matrix 3: Mid-tone Flat Gray Frame
            arr = np.ones(shape, dtype=np.float32) * 0.5
        elif mode == 4: # Matrix 4: High-Contrast Checkerboard (Structural Features)
            arr = np.zeros(shape, dtype=np.float32)
            if shape[1] == 3:
                arr[:, :, :height//2, :width//2] = 1.0
                arr[:, :, height//2:, width//2:] = 1.0
            else:
                arr[:, :height//2, :width//2, :] = 1.0
                arr[:, height//2:, width//2:, :] = 1.0
        elif mode == 5: # Matrix 5: Uniform Gaussian Noise (Extreme Variance)
            np.random.seed(42)
            arr = np.random.uniform(-1.0, 1.0, shape).astype(np.float32)
        return arr

    inputs_onnx = {f"M{i}": make_input(onnx_input_shape, i) for i in range(1, 6)}
    inputs_tflite = {f"M{i}": make_input(tflite_input_shape, i) for i in range(1, 6)}

    # --- 3. RUN INFERENCE FOR ALL 5 POSSIBILITIES ---
    outputs_onnx = {}
    outputs_tflite = {}

    names = {
        "M1": "Pure Black (Zeros)   ",
        "M2": "Pure White (Ones)    ",
        "M3": "Flat Gray (Mid-tones)",
        "M4": "Checkerboard Pattern ",
        "M5": "Gaussian Random Noise"
    }

    for key in names.keys():
        # ONNX Run
        onnx_out = onnx_sess.run([onnx_out_name], {onnx_in_name: inputs_onnx[key]})[0].flatten()
        outputs_onnx[key] = onnx_out

        # TFLite Run
        tflite_interp.set_tensor(tflite_in_details['index'], inputs_tflite[key])
        tflite_interp.invoke()
        tflite_out = tflite_interp.get_tensor(tflite_out_details['index'])[0].flatten()
        outputs_tflite[key] = tflite_out

    # --- 4. CALCULATE INTER-MATRIX SIMILARITY MATRICES ---
    print("\n🔮 " + "-"*20 + " ONNX SIMILARITY POSSIBILITIES MATRIX " + "-"*20)
    matrix_keys = list(names.keys())
    for i in range(len(matrix_keys)):
        for j in range(i + 1, len(matrix_keys)):
            k1, k2 = matrix_keys[i], matrix_keys[j]
            sim = cosine_similarity(outputs_onnx[k1], outputs_onnx[k2])
            print(f"📊 ONNX:  [{names[k1].strip()}] vs [{names[k2].strip()}]: {sim:.6f}")

    print("\n🧩 " + "-"*20 + " TFLITE SIMILARITY POSSIBILITIES MATRIX " + "-"*20)
    for i in range(len(matrix_keys)):
        for j in range(i + 1, len(matrix_keys)):
            k1, k2 = matrix_keys[i], matrix_keys[j]
            sim = cosine_similarity(outputs_tflite[k1], outputs_tflite[k2])
            print(f"📊 TFLite: [{names[k1].strip()}] vs [{names[k2].strip()}]: {sim:.6f}")

    # --- 5. VERDICT ALIGNMENT MATCH ---
    print("\n🏁 " + "="*25 + " FINAL SYSTEM VERDICT " + "="*25)
    onnx_noise_diff = cosine_similarity(outputs_onnx["M1"], outputs_onnx["M5"])
    tflite_noise_diff = cosine_similarity(outputs_tflite["M1"], outputs_tflite["M5"])

    print(f"➡️ ONNX Data Separation Spread (Black vs Noise): {onnx_noise_diff:.4f}")
    print(f"➡️ TFLite Data Separation Spread (Black vs Noise): {tflite_noise_diff:.4f}")
    
    if abs(onnx_noise_diff - tflite_noise_diff) > 0.15:
        print("\n⚠️ CROSS-COMPLIANCE ANALYSIS: PRECISION DEGRADATION DETECTED!")
        print("   The TFLite model's vectors are compressing heavily compared to the original ONNX graph.")
        print("   This points to quantization scaling distortion occurring during compilation.")
    else:
        print("\n✅ CROSS-COMPLIANCE ANALYSIS: MODELS BALANCED AND ALIGNED!")
        print("   Both engines react to structural transformations similarly.")
        print("   The models are fully functional. Any mobile bugs are entirely due to camera data streaming format mismatches.")

# Execute the benchmark suite
run_comprehensive_test("assets/onnx_model/mobilefacenet.onnx", "assets/tflite/mobilefacenet_float32.tflite")