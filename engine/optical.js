class OpticalFlow {
  constructor() {
    this.width = 160;
    this.height = 120;
    
    // Create hidden canvas and context
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    
    this.prevPixels = null;
    
    // Calibration parameters
    this.isCalibrating = false;
    this.calibrationStartTime = 0;
    this.calibrationDuration = 2000; // 2 seconds
    this.calibrationSamples = [];
    
    // Thresholds
    this.walkThreshold = 10.0; // Dynamic default, calibrated baseline * 1.5
    this.leanThreshold = 0.25; // Normalized ratio (motionDiff / totalMotion) - lowered to 0.25 for better sensitivity
    this.baselineNoise = 2.0;
    
    // Current state
    this.walking = false;
    this.lean = 'center'; // 'left' | 'right' | 'center'
    this.lastLeanTime = 0;
    
    // Debug info
    this.debug = {
      walkMotion: 0,
      leftMotion: 0,
      rightMotion: 0,
      leanIndex: 0,
      walkThreshold: this.walkThreshold,
      isCalibrating: false
    };
  }

  startCalibration() {
    this.isCalibrating = true;
    this.calibrationStartTime = Date.now();
    this.calibrationSamples = [];
    console.log('[OpticalFlow] Starting calibration...');
  }

  processFrame(videoElement, handBox = null) {
    if (!videoElement || videoElement.paused || videoElement.ended) {
      return;
    }

    // Draw video to hidden canvas
    this.ctx.drawImage(videoElement, 0, 0, this.width, this.height);
    
    // Get image pixel data
    const imgData = this.ctx.getImageData(0, 0, this.width, this.height);
    const data = imgData.data;
    
    // Convert to grayscale
    const currentPixels = new Uint8Array(this.width * this.height);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      // Grayscale conversion using luminance formula
      currentPixels[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    // If first frame, save pixels and return
    if (!this.prevPixels) {
      this.prevPixels = currentPixels;
      return;
    }

    // Calculate motion in bottom 1/3 of the frame (Walking: y = 80 to 120)
    let walkMotion = 0;
    let walkPixels = 0;
    
    for (let y = 80; y < 120; y++) {
      for (let x = 0; x < this.width; x++) {
        // Skip pixels that are inside the active hand bounding box to avoid false walk triggers
        if (handBox && x >= handBox.minX && x <= handBox.maxX && y >= handBox.minY && y <= handBox.maxY) {
          continue;
        }

        const idx = y * this.width + x;
        const diff = Math.abs(currentPixels[idx] - this.prevPixels[idx]);
        if (diff > 10) { // filter out minor noise
          walkMotion += diff;
        }
        walkPixels++;
      }
    }
    const avgWalkMotion = walkPixels > 0 ? (walkMotion / walkPixels) : 0;

    // Calculate motion in top 2/3 (Leaning: y = 0 to 80), left vs right
    let leftMotion = 0;
    let rightMotion = 0;
    let leftPixels = 0;
    let rightPixels = 0;

    for (let y = 0; y < 80; y++) {
      // Left side: x = 0 to 80
      for (let x = 0; x < 80; x++) {
        // Skip pixels that are inside the active hand bounding box
        if (handBox && x >= handBox.minX && x <= handBox.maxX && y >= handBox.minY && y <= handBox.maxY) {
          continue;
        }

        const idx = y * this.width + x;
        const diff = Math.abs(currentPixels[idx] - this.prevPixels[idx]);
        if (diff > 10) {
          leftMotion += diff;
        }
        leftPixels++;
      }
      // Right side: x = 80 to 160
      for (let x = 80; x < 160; x++) {
        // Skip pixels that are inside the active hand bounding box
        if (handBox && x >= handBox.minX && x <= handBox.maxX && y >= handBox.minY && y <= handBox.maxY) {
          continue;
        }

        const idx = y * this.width + x;
        const diff = Math.abs(currentPixels[idx] - this.prevPixels[idx]);
        if (diff > 10) {
          rightMotion += diff;
        }
        rightPixels++;
      }
    }
    const avgLeftMotion = leftPixels > 0 ? (leftMotion / leftPixels) : 0;
    const avgRightMotion = rightPixels > 0 ? (rightMotion / rightPixels) : 0;

    // Save current frame as previous for next loop
    this.prevPixels = currentPixels;

    // Calculate 8x6 downsampled motion intensity grid for UI visualization
    const gridCols = 8;
    const gridRows = 6;
    const cellW = this.width / gridCols; // 20px
    const cellH = this.height / gridRows; // 20px
    this.motionGrid = new Float32Array(gridCols * gridRows);
    
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        let cellMotion = 0;
        let cellCount = 0;
        
        const startX = c * cellW;
        const endX = startX + cellW;
        const startY = r * cellH;
        const endY = startY + cellH;
        
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const idx = y * this.width + x;
            const diff = Math.abs(currentPixels[idx] - this.prevPixels[idx]);
            if (diff > 8) { // Noise filter
              cellMotion += diff;
            }
            cellCount++;
          }
        }
        this.motionGrid[r * gridCols + c] = cellMotion / cellCount;
      }
    }

    // Handle calibration phase
    if (this.isCalibrating) {
      const elapsed = Date.now() - this.calibrationStartTime;
      if (elapsed < this.calibrationDuration) {
        this.calibrationSamples.push(avgWalkMotion);
      } else {
        this.isCalibrating = false;
        // Calculate average baseline noise
        const sum = this.calibrationSamples.reduce((a, b) => a + b, 0);
        this.baselineNoise = sum / (this.calibrationSamples.length || 1);
        
        // Walk threshold is baseline * 1.5 (or at least 3.0 to prevent micro-fluctuations)
        this.walkThreshold = Math.max(this.baselineNoise * 1.5, 3.0);
        console.log(`[OpticalFlow] Calibration complete! Baseline noise: ${this.baselineNoise.toFixed(2)}, Walk Threshold: ${this.walkThreshold.toFixed(2)}`);
      }
    }

    // Determine walking state
    this.walking = !this.isCalibrating && (avgWalkMotion > this.walkThreshold);

    // Determine lean state using motion ratio
    const totalUpperMotion = avgLeftMotion + avgRightMotion;
    let leanIndex = 0;
    
    if (totalUpperMotion > 3.0) { // Ensure there is actual upper body movement
      // leanIndex ranges from -1.0 to 1.0
      leanIndex = (avgRightMotion - avgLeftMotion) / totalUpperMotion;
    }

    // Determine lean direction
    let rawLean = 'center';
    if (leanIndex > this.leanThreshold) {
      // More motion on the right side of the camera (player's left in mirror)
      rawLean = 'left';
    } else if (leanIndex < -this.leanThreshold) {
      // More motion on the left side of the camera (player's right in mirror)
      rawLean = 'right';
    }

    const now = Date.now();
    if (rawLean !== 'center') {
      this.lean = rawLean;
      this.lastLeanTime = now;
    } else if (now - this.lastLeanTime > 800) { // Keep the lean state sustained for 800ms to allow dodge window
      this.lean = 'center';
    }

    // Store debug info
    this.debug = {
      walkMotion: avgWalkMotion,
      leftMotion: avgLeftMotion,
      rightMotion: avgRightMotion,
      leanIndex: leanIndex,
      walkThreshold: this.walkThreshold,
      isCalibrating: this.isCalibrating
    };
  }
}

// Export class if running in a module context, otherwise attach to window
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OpticalFlow };
} else {
  window.OpticalFlow = OpticalFlow;
}
