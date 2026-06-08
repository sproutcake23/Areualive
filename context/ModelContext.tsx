import React, { createContext, useContext, useEffect, useState } from "react";
import { useTensorflowModel } from "react-native-fast-tflite";
import { NitroModules } from "react-native-nitro-modules";

type ModelContextType = {
  boxedMobileFaceModel: any;
  isModelLoaded: boolean;
};

const ModelContext = createContext<ModelContextType | null>(null);

export function ModelProvider({ children }: { children: React.ReactNode }) {
  const faceNetPlugin = useTensorflowModel(require("../assets/tflite/w600k_mbf_fixed_float16.tflite"), []);
  const [boxedMobileFaceModel, setBoxedMobileFaceModel] = useState<any>(null);

  useEffect(() => {
    if (faceNetPlugin.state === "loaded" && faceNetPlugin.model && !boxedMobileFaceModel) {
      // Box the model binary exactly ONCE for global use
      setBoxedMobileFaceModel(NitroModules.box(faceNetPlugin.model as any));
    }
  }, [faceNetPlugin.state, faceNetPlugin.model]);

  return (
    <ModelContext.Provider 
      value={{ 
        boxedMobileFaceModel, 
        isModelLoaded: boxedMobileFaceModel !== null 
      }}
    >
      {children}
    </ModelContext.Provider>
  );
}

export function useGlobalModels() {
  const context = useContext(ModelContext);
  if (!context) throw new Error("useGlobalModels must be used within a ModelProvider");
  return context;
}