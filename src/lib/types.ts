export interface Detection {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  class: string;
  trackId?: number; // Optional track ID for video tracking
  mask?: Uint8Array; // Optional segmentation mask (width x height, values 0-255)
  maskWidth?: number; // Mask dimensions
  maskHeight?: number;
}

export interface DetectionStats {
  totalDetections: number;
  averageConfidence: number;
  lastDetectionTime: number;
  classCounts: Record<string, number>;
}

export interface ModelMetadata {
  inputSize: [number, number];
  classes: string[];
  confidenceThreshold: number;
  nmsThreshold: number;
}
