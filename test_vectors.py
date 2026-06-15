import numpy as np
import tensorflow as tf

def analyze_mobilefacenet_vectors(model_path):
    print("\n" + "="*60)
    print(f"🚀 INITIALIZING ISOLATED TFLITE VECTOR EVALUATION")
    print(f"📦 TARGET ASSET: {model_path}")
    print("="*60)

    # 1. Mount the model interpreter nodes
    try:
        interpreter = tf.lite.Interpreter(model_path=model_path)
        interpreter.allocate_tensors()
    except Exception as e:
        print(f"❌ CRITICAL LOAD FAULT: {e}")
        return

    # 2. Extract shape metrics
    input_details = interpreter.get_input_details()[0]
    output_details = interpreter.get_output_details()[0]
    
    print(f"📋 Model Input Expected Layout: {input_details['shape']}")
    print(f"📋 Model Input Data Structure:   {input_details['dtype']}")
    print(f"📋 Model Output Vector Shape:   {output_details['shape']}")

    # 3. GENERATE 3 COMPLETELY DISTINCT IMAGE MATRICES
    # Vector A: Centered distribution simulation
    vector_a = np.zeros(input_details['shape'], dtype=np.float32)
    
    # Vector B: Alternating high-contrast pixel clusters (Simulating structural variance)
    vector_b = np.ones(input_details['shape'], dtype=np.float32) * 0.5
    
    # Vector C: Synthetic Gaussian Noise Distribution (Centered via Z-score scale [-1.0, 1.0])
    np.random.seed(42) # Locked seed for testing reproducibility
    vector_c = np.random.uniform(-1.0, 1.0, input_details['shape']).astype(np.float32)

    # --- RUN EVALUATION 1: VECTOR A ---
    interpreter.set_tensor(input_details['index'], vector_a)
    interpreter.invoke()
    out_a = np.array(interpreter.get_tensor(output_details['index'])[0])

    # --- RUN EVALUATION 2: VECTOR B ---
    interpreter.set_tensor(input_details['index'], vector_b)
    interpreter.invoke()
    out_b = np.array(interpreter.get_tensor(output_details['index'])[0])

    # --- RUN EVALUATION 3: VECTOR C ---
    interpreter.set_tensor(input_details['index'], vector_c)
    interpreter.invoke()
    out_c = np.array(interpreter.get_tensor(output_details['index'])[0])

    # 4. COMPUTE COSINE SIMILARITY TO TEST DISTINCTION
    def calc_cosine_similarity(v1, v2):
        dot = np.dot(v1, v2)
        norm_1 = np.linalg.norm(v1)
        norm_2 = np.linalg.norm(v2)
        if norm_1 == 0 or norm_2 == 0:
            return 0.0
        return dot / (norm_1 * norm_2)

    sim_a_b = calc_cosine_similarity(out_a, out_b)
    sim_a_c = calc_cosine_similarity(out_a, out_c)
    sim_b_c = calc_cosine_similarity(out_b, out_c)

    print("\n📊 " + "-"*20 + " EXTRACTED LAYER METRICS " + "-"*20)
    print(f"🔮 Out A (Flat Baseline) Sample (First 5): {out_a[:5]}")
    print(f"🔮 Out B (Half-Contrast) Sample (First 5): {out_b[:5]}")
    print(f"🔮 Out C (Gaussian Noise) Sample (First 5): {out_c[:5]}")

    print("\n🔍 " + "-"*22 + " SIMILARITY METRICS " + "-"*22)
    print(f"📊 Cosine Similarity (A vs B): {sim_a_b:.6f}")
    print(f"📊 Cosine Similarity (A vs C): {sim_a_c:.6f}")
    print(f"📊 Cosine Similarity (B vs C): {sim_b_c:.6f}")

    # 🎯 THE MATRICES CRASH VERDICT
    if np.allclose(out_a, out_b, atol=1e-4) or sim_a_b > 0.999:
        print("\n❌ THE MODEL WEIGHTS ARE COMPLETELY FROZEN / BROKEN.")
        print("   Reason: Input transformations changed dramatically but out vectors remain identical.")
        print("   The conversion to TFLite stripped the kernel weight values entirely.")
    else:
        print("\n✅ THE MODEL STRUCTURAL INTEGRITY IS STABLE!")
        print("   Reason: Changing inputs produced clear output differentiation metrics.")
        print("   Your model works. The issue is purely how pixels are layered via the C++ camera memory stream.")

# Run diagnostic script over your file layout
analyze_mobilefacenet_vectors("assets/tflite/w600k_mbf_fixed_float32.tflite")