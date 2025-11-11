import { Detection } from './types';

/**
 * Track state enum
 */
enum TrackState {
  Tentative = 1,
  Confirmed = 2,
  Deleted = 3
}

/**
 * Kalman Filter for motion prediction
 * Simplified 8-state Kalman filter: [x, y, w, h, vx, vy, vw, vh]
 */
class KalmanFilter {
  private mean: Float32Array; // 8x1 state vector
  private covariance: Float32Array; // 8x8 covariance matrix
  private stdWeightPosition = 1.0 / 20;
  private stdWeightVelocity = 1.0 / 160;

  constructor(bbox: [number, number, number, number]) {
    // Initialize state: [x, y, w, h, vx, vy, vw, vh]
    this.mean = new Float32Array(8);
    this.mean[0] = bbox[0] + bbox[2] / 2; // center x
    this.mean[1] = bbox[1] + bbox[3] / 2; // center y
    this.mean[2] = bbox[2]; // width
    this.mean[3] = bbox[3]; // height
    this.mean[4] = 0; // velocity x
    this.mean[5] = 0; // velocity y
    this.mean[6] = 0; // velocity width
    this.mean[7] = 0; // velocity height

    // Initialize covariance matrix (8x8)
    this.covariance = new Float32Array(64);
    const std = [
      2 * this.stdWeightPosition * bbox[3], // x
      2 * this.stdWeightPosition * bbox[3], // y
      1e-2, // w
      1e-2, // h
      10 * this.stdWeightVelocity * bbox[3], // vx
      10 * this.stdWeightVelocity * bbox[3], // vy
      1e-5, // vw
      1e-5  // vh
    ];

    for (let i = 0; i < 8; i++) {
      this.covariance[i * 8 + i] = std[i] * std[i];
    }
  }

  /**
   * Predict next state
   */
  predict(): [number, number, number, number] {
    // Simple constant velocity model
    // x' = x + vx * dt (dt = 1)
    this.mean[0] += this.mean[4];
    this.mean[1] += this.mean[5];
    // Width and height don't change much, but we update them
    this.mean[2] += this.mean[6];
    this.mean[3] += this.mean[7];

    // Update covariance (simplified)
    const std = [
      this.stdWeightPosition * this.mean[3],
      this.stdWeightPosition * this.mean[3],
      1e-2,
      1e-2,
      this.stdWeightVelocity * this.mean[3],
      this.stdWeightVelocity * this.mean[3],
      1e-5,
      1e-5
    ];

    for (let i = 0; i < 8; i++) {
      this.covariance[i * 8 + i] += std[i] * std[i];
    }

    // Return predicted bbox [x, y, w, h]
    return [
      this.mean[0] - this.mean[2] / 2,
      this.mean[1] - this.mean[3] / 2,
      this.mean[2],
      this.mean[3]
    ];
  }

  /**
   * Update with measurement
   */
  update(bbox: [number, number, number, number]): void {
    const measuredCenterX = bbox[0] + bbox[2] / 2;
    const measuredCenterY = bbox[1] + bbox[3] / 2;
    const measuredW = bbox[2];
    const measuredH = bbox[3];

    // Measurement noise
    const std = [
      this.stdWeightPosition * this.mean[3],
      this.stdWeightPosition * this.mean[3],
      1e-1,
      1e-1
    ];

    // Simplified update (Kalman gain = 0.5 for simplicity)
    const gain = 0.5;
    this.mean[0] = this.mean[0] * (1 - gain) + measuredCenterX * gain;
    this.mean[1] = this.mean[1] * (1 - gain) + measuredCenterY * gain;
    this.mean[2] = this.mean[2] * (1 - gain) + measuredW * gain;
    this.mean[3] = this.mean[3] * (1 - gain) + measuredH * gain;

    // Update velocity
    this.mean[4] = measuredCenterX - (this.mean[0] - this.mean[4]);
    this.mean[5] = measuredCenterY - (this.mean[1] - this.mean[5]);
    this.mean[6] = measuredW - (this.mean[2] - this.mean[6]);
    this.mean[7] = measuredH - (this.mean[3] - this.mean[7]);
  }

  /**
   * Get current state as bbox
   */
  toBbox(): [number, number, number, number] {
    return [
      this.mean[0] - this.mean[2] / 2,
      this.mean[1] - this.mean[3] / 2,
      this.mean[2],
      this.mean[3]
    ];
  }
}

/**
 * Track object
 */
class Track {
  public trackId: number;
  public kalmanFilter: KalmanFilter;
  public state: TrackState;
  public hits: number;
  public age: number;
  public timeSinceUpdate: number;
  public detection: Detection;
  public isConfirmed: boolean;

  constructor(trackId: number, detection: Detection) {
    this.trackId = trackId;
    this.detection = { ...detection };
    this.kalmanFilter = new KalmanFilter([
      detection.x,
      detection.y,
      detection.width,
      detection.height
    ]);
    this.state = TrackState.Tentative;
    this.hits = 1;
    this.age = 1;
    this.timeSinceUpdate = 0;
    this.isConfirmed = false;
  }

  /**
   * Predict next position
   */
  predict(): [number, number, number, number] {
    this.age += 1;
    if (this.state === TrackState.Tentative) {
      this.state = TrackState.Confirmed;
      this.isConfirmed = true;
    }
    return this.kalmanFilter.predict();
  }

  /**
   * Update track with detection
   */
  update(detection: Detection): void {
    this.detection = { ...detection, trackId: this.trackId };
    this.kalmanFilter.update([
      detection.x,
      detection.y,
      detection.width,
      detection.height
    ]);
    this.hits += 1;
    this.timeSinceUpdate = 0;
    if (this.state === TrackState.Tentative && this.hits >= 3) {
      this.state = TrackState.Confirmed;
      this.isConfirmed = true;
    }
  }

  /**
   * Mark track as missed
   */
  markMissed(): void {
    this.timeSinceUpdate += 1;
  }
}

/**
 * DeepSORT Tracker
 * Simplified implementation for web-based real-time tracking
 */
export class DeepSortTracker {
  private tracks: Track[] = [];
  private nextTrackId = 1;
  private maxAge = 30; // Maximum frames to keep a track without update
  private minHits = 3; // Minimum hits to confirm a track
  private iouThreshold = 0.3; // IoU threshold for association
  private maxIouDistance = 0.7; // Maximum IoU distance for association

  /**
   * Update tracker with new detections
   */
  update(detections: Detection[]): Detection[] {
    // Predict tracks and maintain mapping to actual track indices
    const predictedBoxes: Array<[number, number, number, number]> = [];
    const trackIndices: number[] = [];
    
    for (let i = 0; i < this.tracks.length; i++) {
      const track = this.tracks[i];
      if (track.state !== TrackState.Deleted) {
        predictedBoxes.push(track.predict());
        trackIndices.push(i);
      }
    }

    // Associate detections with tracks
    const [matches, unmatchedDetections, unmatchedTracks] = this.associate(
      detections,
      predictedBoxes
    );

    // Update matched tracks using the correct track indices
    for (const [detectionIdx, predictedBoxIdx] of matches) {
      const actualTrackIdx = trackIndices[predictedBoxIdx];
      this.tracks[actualTrackIdx].update(detections[detectionIdx]);
    }

    // Create new tracks for unmatched detections
    for (const detectionIdx of unmatchedDetections) {
      const track = new Track(this.nextTrackId++, detections[detectionIdx]);
      this.tracks.push(track);
    }

    // Mark unmatched tracks as missed using the correct track indices
    for (const predictedBoxIdx of unmatchedTracks) {
      const actualTrackIdx = trackIndices[predictedBoxIdx];
      this.tracks[actualTrackIdx].markMissed();
    }

    // Remove old tracks
    this.tracks = this.tracks.filter(track => {
      if (track.state === TrackState.Deleted) {
        return false;
      }
      if (track.timeSinceUpdate > this.maxAge) {
        track.state = TrackState.Deleted;
        return false;
      }
      return true;
    });

    // Return confirmed tracks with track IDs
    const confirmedDetections: Detection[] = [];
    for (const track of this.tracks) {
      if (track.isConfirmed || track.hits >= this.minHits) {
        const bbox = track.kalmanFilter.toBbox();
        confirmedDetections.push({
          ...track.detection,
          x: bbox[0],
          y: bbox[1],
          width: bbox[2],
          height: bbox[3],
          trackId: track.trackId
        });
      }
    }

    return confirmedDetections;
  }

  /**
   * Associate detections with tracks using IoU
   */
  private associate(
    detections: Detection[],
    predictedBoxes: Array<[number, number, number, number]>
  ): [Array<[number, number]>, number[], number[]] {
    if (predictedBoxes.length === 0) {
      return [[], Array.from({ length: detections.length }, (_, i) => i), []];
    }

    if (detections.length === 0) {
      return [[], [], Array.from({ length: predictedBoxes.length }, (_, i) => i)];
    }

    // Calculate IoU cost matrix
    const costMatrix: number[][] = [];
    for (let i = 0; i < detections.length; i++) {
      costMatrix[i] = [];
      for (let j = 0; j < predictedBoxes.length; j++) {
        const iou = this.calculateIoU(
          detections[i],
          {
            x: predictedBoxes[j][0],
            y: predictedBoxes[j][1],
            width: predictedBoxes[j][2],
            height: predictedBoxes[j][3],
            confidence: 0,
            class: ''
          }
        );
        // Convert IoU to distance (1 - IoU)
        costMatrix[i][j] = 1 - iou;
      }
    }

    // Hungarian algorithm (simplified greedy version for web)
    const matches: Array<[number, number]> = [];
    const unmatchedDetections: number[] = [];
    const unmatchedTracks: number[] = [];
    const usedDetections = new Set<number>();
    const usedTracks = new Set<number>();

    // Greedy matching: match best pairs first
    const pairs: Array<[number, number, number]> = [];
    for (let i = 0; i < detections.length; i++) {
      for (let j = 0; j < predictedBoxes.length; j++) {
        const cost = costMatrix[i][j];
        if (cost <= this.maxIouDistance) {
          pairs.push([i, j, cost]);
        }
      }
    }

    // Sort by cost (lowest first)
    pairs.sort((a, b) => a[2] - b[2]);

    // Match greedily
    for (const [detIdx, trackIdx, cost] of pairs) {
      if (!usedDetections.has(detIdx) && !usedTracks.has(trackIdx)) {
        matches.push([detIdx, trackIdx]);
        usedDetections.add(detIdx);
        usedTracks.add(trackIdx);
      }
    }

    // Find unmatched detections
    for (let i = 0; i < detections.length; i++) {
      if (!usedDetections.has(i)) {
        unmatchedDetections.push(i);
      }
    }

    // Find unmatched tracks
    for (let j = 0; j < predictedBoxes.length; j++) {
      if (!usedTracks.has(j)) {
        unmatchedTracks.push(j);
      }
    }

    return [matches, unmatchedDetections, unmatchedTracks];
  }

  /**
   * Calculate Intersection over Union (IoU)
   */
  private calculateIoU(det1: Detection, det2: Detection): number {
    const x1 = Math.max(det1.x, det2.x);
    const y1 = Math.max(det1.y, det2.y);
    const x2 = Math.min(det1.x + det1.width, det2.x + det2.width);
    const y2 = Math.min(det1.y + det1.height, det2.y + det2.height);

    if (x2 <= x1 || y2 <= y1) return 0;

    const intersection = (x2 - x1) * (y2 - y1);
    const area1 = det1.width * det1.height;
    const area2 = det2.width * det2.height;
    const union = area1 + area2 - intersection;

    return union > 0 ? intersection / union : 0;
  }

  /**
   * Reset tracker
   */
  reset(): void {
    this.tracks = [];
    this.nextTrackId = 1;
  }

  /**
   * Get current track count
   */
  getTrackCount(): number {
    return this.tracks.filter(t => t.isConfirmed || t.hits >= this.minHits).length;
  }
}

