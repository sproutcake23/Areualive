import re

with open("app/verify.tsx", "r") as f:
    content = f.read()

# 1. Imports
content = re.sub(
    r'import \{ verifyFaceFrame \} from "@/lib/cameraInterface";',
    'import { verifyFaceFrame, checkChallenge } from "@/lib/cameraInterface";',
    content
)
content = re.sub(
    r'import type \{ LivenessStep \} from "@/types";',
    'import type { LivenessStep, VerificationPhase } from "@/types";',
    content
)

# 2. Phase type and message
content = re.sub(
    r'export type VerificationPhase = .*?;//NOTE : changed\n\nconst PHASE_MESSAGE: Record<VerificationPhase, string> = \{\n.*?\n\};\n',
    '''const PROMPT_LABELS: Record<string, string> = {
  blink: "Blink your eyes",
  smile: "Smile",
  turn: "Turn your head",
};

const getPhaseMessage = (phase: VerificationPhase): string => {
  switch(phase) {
    case "idle": return "Position your face, then tap Verify.";
    case "challenge_1": return "Please perform the challenge above.";
    case "challenge_2": return "Please perform the challenge above.";
    case "awaiting_frontal": return "✓ Challenges passed. Look straight ahead.";
    case "running_inference": return "Analyzing…";
    case "success": return "Attendance recorded.";
    case "failed": return "Verification failed.";
    default: return "";
  }
};
''',
    content,
    flags=re.DOTALL
)

# 3. Component state
content = re.sub(
    r'const \[outcome, setOutcome\] = useState<Outcome>\("idle"\);\n  const \[step, setStep\] = useState<LivenessStep>\(config\.LIVENESS_STEPS\[0\]\);',
    '''const [phase, setPhase] = useState<VerificationPhase>("idle");
  const [challengePairState, setChallengePairState] = useState<LivenessStep[]>([]);''',
    content
)

# 4. Brightness
content = re.sub(
    r'const initialBrightness = useRef<number>\(0\.5\);',
    '''const initialBrightness = useRef<number>(0.5);
  const isVerifying = phase !== "idle" && phase !== "success" && phase !== "failed";''',
    content
)

content = re.sub(r'outcome === "verifying"', 'isVerifying', content)
content = re.sub(r'outcome !== "verifying"', '!isVerifying', content)

# 5. Shared values
content = re.sub(
    r'const isCheckingFrame = useSharedValue\(false\);\n  const activeChallenge = useSharedValue<"blink" \| "smile" \| "turn">\("blink"\);',
    '''const isCheckingFrame = useSharedValue(false);
  const challengePair = useSharedValue<LivenessStep[]>([]);
  const currentPhase = useSharedValue<VerificationPhase>("idle");
  const challengeConfirmCount = useSharedValue(0);''',
    content
)

content = re.sub(r'useEffect\(\(\) => \{ activeChallenge\.value = step; \}, \[step\]\);\n', '', content)

# 6. Handlers
content = re.sub(
    r'setOutcome\("success"\);',
    'setPhase("success"); currentPhase.value = "success";',
    content
)
content = re.sub(
    r'setOutcome\("failed"\);',
    'setPhase("failed"); currentPhase.value = "failed";',
    content
)
content = re.sub(r'setOutcome\("idle"\)', 'setPhase("idle"); currentPhase.value = "idle"; setChallengePairState([]);', content)

# 7. onVerify
content = re.sub(
    r'const onVerify = \(\) => \{\n    if \(!faceDescriptor \|\| outcome === "verifying"\) return;\n    setOutcome\("verifying"\);\n    setErrorDetails\(null\);\n  \};',
    '''const onVerify = () => {
    if (!faceDescriptor || isVerifying) return;
    const pool: LivenessStep[] = ["blink", "smile", "turn"];
    const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 2);
    challengePair.value = shuffled;
    setChallengePairState(shuffled);
    setErrorDetails(null);
    setPhase("challenge_1");
    currentPhase.value = "challenge_1";
  };''',
    content
)

content = re.sub(
    r'const onVerify = \(\) => \{\n    if \(!faceDescriptor \|\| isVerifying\) return;\n    setOutcome\("verifying"\);\n    setErrorDetails\(null\);\n  \};',
    '''const onVerify = () => {
    if (!faceDescriptor || isVerifying) return;
    const pool: LivenessStep[] = ["blink", "smile", "turn"];
    const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 2);
    challengePair.value = shuffled;
    setChallengePairState(shuffled);
    setErrorDetails(null);
    setPhase("challenge_1");
    currentPhase.value = "challenge_1";
  };''',
    content
)

# 8. Add handlePhaseAdvance
content = re.sub(
    r'const frameProcessor = useFrameProcessor',
    '''const handlePhaseAdvance = useRunOnJS((nextPhase: VerificationPhase) => {
    setPhase(nextPhase);
  }, []);

  const frameProcessor = useFrameProcessor''',
    content
)

# 9. Replace frameProcessor
frame_processor_code = '''const frameProcessor = useFrameProcessor((frame) => {
    "worklet";
    if (isCheckingFrame.value || !faceDescriptor || boxedMobileFaceModel == null) return;
    
    const phase = currentPhase.value;

    if (phase === "challenge_1" || phase === "challenge_2") {
      const faces = detectFaces.detectFaces(frame);
      if (!faces || faces.length === 0) return;

      const challengeIndex = phase === "challenge_1" ? 0 : 1;
      if (!challengePair.value || challengePair.value.length < 2) return;
      
      const challenge = challengePair.value[challengeIndex];
      const passed = checkChallenge(faces[0], challenge);

      if (passed) {
        challengeConfirmCount.value += 1;
        if (challengeConfirmCount.value >= config.LIVENESS_CHALLENGE_CONFIRM_FRAMES) {
          challengeConfirmCount.value = 0;
          const nextPhase = phase === "challenge_1" ? "challenge_2" : "awaiting_frontal";
          currentPhase.value = nextPhase;
          handlePhaseAdvance(nextPhase);
        }
      } else {
        challengeConfirmCount.value = 0;
      }
      return;
    }

    if (phase === "awaiting_frontal") {
      const faces = detectFaces.detectFaces(frame);
      if (!faces || faces.length === 0) return;
      if (Math.abs(faces[0].yawAngle ?? 0) < config.FRONTAL_YAW_THRESHOLD_DEG) {
        currentPhase.value = "running_inference";
        handlePhaseAdvance("running_inference");
        // Fall through to running_inference
      } else {
        return;
      }
    }

    if (currentPhase.value === "running_inference") {
      isCheckingFrame.value = true;
      try {
        const result = verifyFaceFrame({
          frame,
          enrolledFaceDescriptor: faceDescriptor,
          currentChallenge: "blink", // Not used anymore
          resizePlugin: resize,
          faceDetectorPlugin: detectFaces,
          boxedMobileFaceInterpreter: boxedMobileFaceModel,
          user: user,
          cameraPosition: cameraPosition, 
          isFlashOn: isFlashOn,           
        });

        if (result.isMatch && result.livenessConfirmed) {
          handleVerificationSuccess(result);
        } else if (result.error) {
          if (result.diagonise) setLivePreviewOnUIThread(result.diagonise);
          isCheckingFrame.value = false;
          handleVerificationFailure(result.error);
        } else {
          if (result.diagonise) setLivePreviewOnUIThread(result.diagonise);
          isCheckingFrame.value = false; 
        }
      } catch (err: any) {
        isCheckingFrame.value = false;
        handleVerificationFailure(err.message || "Native runtime failure");
      }
    }
  }, [faceDescriptor, boxedMobileFaceModel, isCheckingFrame, challengePair, currentPhase, challengeConfirmCount, resize, detectFaces, cameraPosition, isFlashOn]);'''

content = re.sub(
    r'const frameProcessor = useFrameProcessor\(\(frame\) => \{.*?\n  \}, \[.*?\]\);',
    frame_processor_code,
    content,
    flags=re.DOTALL
)

# 10. Replace LivenessPrompts and challenge UI
content = re.sub(
    r'<LivenessPrompts step=\{step\} />\s*\{outcome === "idle" && \(\s*<View className="absolute top-44 left-6 right-6 z-50 flex-row justify-around bg-black/40 p-2 rounded-xl">\s*\{\(\["blink", "smile", "turn"\] as const\)\.map\(\(challenge\) => \(\s*<TouchableOpacity key=\{challenge\}.*?</TouchableOpacity>\s*\)\)\}\s*</View>\s*\)\}',
    '''{phase === "challenge_1" && <LivenessPrompts label={PROMPT_LABELS[challengePairState[0]]} />}
      {phase === "challenge_2" && <LivenessPrompts label={PROMPT_LABELS[challengePairState[1]]} />}''',
    content,
    flags=re.DOTALL
)

# 11. Remove bottom shared values
content = re.sub(
    r'const challengeConfirmCount = useSharedValue\(0\);\s*// debounce counter.*?\n  const currentPhase = useSharedValue<string>\("idle"\);\s*// drives worklet branching',
    '',
    content
)

# 12. Fix OUTCOME_MESSAGE logic
content = re.sub(r'OUTCOME_MESSAGE\[outcome\]', 'getPhaseMessage(phase)', content)
content = re.sub(r'OUTCOME_MESSAGE\[phase\]', 'getPhaseMessage(phase)', content)

with open("app/verify.tsx", "w") as f:
    f.write(content)
