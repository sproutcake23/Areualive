import cv2
import numpy as np
import tensorflow as tf

# =============================================================================
# 🎯 CONFIGURATION
# =============================================================================
MODEL_PATH = "assets/tflite/w600k_mbf_fixed_float32.tflite"
IMG_ME_BASELINE = "assets/my_images/mrunal_thakur1.jpeg"
IMG_ME_VERIFY = "assets/my_images/mrunal_thakur2.jpeg"
IMG_DIFFERENT = "assets/my_images/hrithik1.jpeg"

# =============================================================================
# 🖼️ IMAGE PROCESSING & NORMALIZATION FUNCTION
# =============================================================================
def preprocess_image(image_path):
    # 1. Load image using OpenCV
    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(f"Could not load image at: {image_path}")
        
    # 2. Convert from BGR (OpenCV default) to RGB (TFLite Model default)
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    
    # 3. Downsample directly to 112x112 layout dimensions
    img_resized = cv2.resize(img_rgb, (112, 112))
    
    # 4. Cast matrix elements to Float32
    img_float = img_resized.astype(np.float32)
    
    # 5. Apply your exact React Native C++ Bridge normalization pass: (X - 127.5) / 128.0
    normalized_img = (img_float - 127.5) / 128.0
    
    # 6. Add batch dimension (1, 112, 112, 3) expected by TFLite interpreters
    input_tensor = np.expand_dims(normalized_img, axis=0)
    return input_tensor

# =============================================================================
# 🧠 MATRIC SIMILARITY CALCULATION
# =============================================================================
def calculate_cosine_similarity(vecA, vecB):
    dot_product = np.dot(vecA, vecB)
    norm_a = np.linalg.norm(vecA)
    norm_b = np.linalg.norm(vecB)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot_product / (norm_a * norm_b)

# =============================================================================
# 🚀 CORE RUNTIME INFERENCE RUN
# =============================================================================
def main():
    print("🧠 Loading MobileFaceNet TFLite Interpreter...")
    interpreter = tf.lite.Interpreter(model_path=MODEL_PATH)
    interpreter.allocate_tensors()
    
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()
    
    # Setup utility to grab embeddings from model output tensor channels
    def get_embedding(img_path):
        tensor_input = preprocess_image(img_path)
        interpreter.set_tensor(input_details[0]['index'], tensor_input)
        interpreter.invoke()
        # Flatten vector payload output down to single dimension array (128 features)
        return interpreter.get_tensor(output_details[0]['index']).flatten()

    print("✂️ Extacting visual embedding characteristics maps...")
    vec_me_base = get_embedding(IMG_ME_BASELINE)
    vec_me_verify = get_embedding(IMG_ME_VERIFY)
    vec_diff_person = get_embedding(IMG_DIFFERENT)

    # Slice the first 5 elements for a direct cross-comparison print out
    print("\n🧬 [Raw Tensor Weights - First 5 Dimensions]:")
    print(f"  ├─ Me Baseline:      {vec_me_base[:5]}")
    print(f"  ├─ Me Verify:        {vec_me_verify[:5]}")
    print(f"  └─ Different Person: {vec_diff_person[:5]}")

    # Compute Final Decisions
    sim_match = calculate_cosine_similarity(vec_me_base, vec_me_verify)
    sim_spoof = calculate_cosine_similarity(vec_me_base, vec_diff_person)

    print("\n📊 [Python Evaluation Results]:")
    print(f"  ├─ Cosine Similarity (SAME PERSON - Me vs Me):   {sim_match:.6f}")
    print(f"  └─ Cosine Similarity (DIFFERENT PERSON - Me vs Other): {sim_spoof:.6f}")
    
    threshold = 0.78
    print(f"\n🎯 [Threshold Verdict (>= {threshold})]:")
    print(f"  ├─ Same Person Pass?      {sim_match >= threshold} ({'🎉 SUCCESS' if sim_match >= threshold else '❌ FAIL'})")
    print(f"  └─ Different Person Block? {sim_spoof < threshold} ({'🎉 SUCCESS' if sim_spoof < threshold else '❌ SPOOF LEAKED'})")

if __name__ == "__main__":
    main()