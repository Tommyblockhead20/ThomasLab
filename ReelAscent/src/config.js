export const PLAYER_CONFIG = Object.freeze({
  // Rapier capsule height = 2 * half-height + 2 * radius = 1.88 world meters.
  radius: 0.4,
  capsuleHalfHeight: 0.54,
  walkSpeed: 4.9,
  sprintSpeed: 8.1,
  groundAcceleration: 34,
  airAcceleration: 10,
  groundDeceleration: 42,
  airDeceleration: 3,
  gravity: 27,
  // Slightly stronger than V2.5: 6.65 m/s against 27 m/s² gives an ~0.82 m / 2.7 ft apex.
  jumpSpeed: 6.65,
  jumpStaminaCost: 5,
  staminaSupportProbeRadius: 0.27,
  staminaSupportProbeExtra: 0.38,
  staminaMinimumSupportFraction: 0.44,
  staminaMaximumSupportSlopeDegrees: 55,
  terminalVelocity: 32,
  coyoteTime: 0.12,
  jumpBufferTime: 0.14,
  maxSlopeDegrees: 44,
  slideSlopeDegrees: 48,
  slideExitSlopeDegrees: 43,
  slideAutoEnterDelay: 0.11,
  slideAutoExitDelay: 0.2,
  // Physics can enter a slide immediately, but the full feet-forward render pose waits
  // until the descent has clearly persisted. This prevents one-frame visual snap/flicker.
  slidePoseDelay: 0.25,
  // Sliding first tries to steer around a blockage. If meaningful downhill progress is
  // still absent for this long, a short scramble window releases forced slide control.
  slideJamSteerDelay: 0.14,
  slideJamRecoveryDelay: 0.5,
  slideJamBlockedRatio: 0.48,
  slideJamDownhillProgressRatio: 0.16,
  slideJamSteerStrength: 0.82,
  slideJamProbeDistance: 1.35,
  slideRecoveryDuration: 0.82,
  slideRecoveryControlSpeed: 4.4,
  slideRecoveryAcceleration: 28,
  slideRecoveryAutoSideIntent: 0.58,
  hardNoStandSlopeDegrees: 55,
  manualSlideMinimumSlopeDegrees: 6,
  manualSlideMinimumSpeed: 3.8,
  manualSlideMaximumSpeed: 11.2,
  forcedSteepSlideSpeed: 9.4,
  forcedSteepSlideMaximumSpeed: 15.2,
  slideAcceleration: 36,
  slideBrakeSpeedMultiplier: 0.44,
  slideBrakeDrainPerSecond: 5.5,
  slideControlStrength: 0.62,
  slidePushOffStaminaCost: 2,
  slidePushOffUpSpeed: 4.9,
  slidePushOffOutwardSpeed: 2.3,
  slidePushOffDirectionalSpeed: 4.1,
  slidePushOffMinimumOutwardSpeed: 1.35,
  stationaryContactRecoverySeconds: 5,
  stationaryContactMaximumSpeed: 0.12,
  stationaryContactProbeExtra: 0.16,
  stationaryContactMinimumSamples: 2,
  momentumDeflectMinimumSpeed: 5.6,
  momentumDeflectBlockedRatio: 0.5,
  momentumDeflectUpSpeed: 2.4,
  momentumDeflectRetention: 0.88,
  stepHeight: 0.42,
  respawnHeight: -14
});

export const STAMINA_CONFIG = Object.freeze({
  maximum: 100,
  sprintDrainPerSecond: 4.2,
  regenerationPerSecond: 19,
  regenerationDelay: 0.55,
  sprintResumeThreshold: 16
});

export const PLAYER_FOOT_OFFSET = PLAYER_CONFIG.capsuleHalfHeight + PLAYER_CONFIG.radius;
export const PLAYER_STANDING_HEIGHT = PLAYER_FOOT_OFFSET * 2;
export const NORMAL_JUMP_APEX_METERS = PLAYER_CONFIG.jumpSpeed ** 2 / (2 * PLAYER_CONFIG.gravity);

export const CLIMBING_CONFIG = Object.freeze({
  gripDistance: 1.05,
  gripProbeSideOffset: 0.27,
  gripFacingDotMaximum: -0.18,
  wallDistance: 0.52,
  trackingDistance: 1.3,
  maxSurfaceNormalY: 0.68,
  minSurfaceNormalY: -0.48,
  maxSurfaceTurnDegrees: 58,
  climbSpeed: 2.45,
  sidewaysSpeed: 2.3,
  wallCorrectionSpeed: 4.5,
  surfaceNormalSharpness: 16,
  surfaceTransitionSharpness: 8,
  surfacePointSharpness: 18,
  currentSurfaceBias: 0.34,
  compatibleSurfaceBias: 0.1,
  surfaceSwitchAdvantage: 0.16,
  lostSurfaceGrace: 0.22,
  holdingDrainPerSecond: 4,
  movingDrainPerSecond: 2.1,
  difficultSurfaceMultiplier: 1.65,
  overhangDrainScale: 2.2,
  gripResumeStamina: 18,
  releaseReattachDelay: 0.22,
  exhaustionReattachDelay: 0.65,
  transferCatchDelay: 0.08,
  sameSurfaceBlockDuration: 0.68,
  sameSurfaceMinimumSeparation: 0.72,
  sameSurfaceClearSeparation: 1.38,
  pushOffAwayStrength: 6.25,
  pushOffLateralStrength: 5.6,
  pushOffBaseUpStrength: 4.9,
  pushOffUpInputStrength: 4.7,
  // Any directional input trades away-from-wall speed for intentional travel.
  pushOffDirectionalAwayMultiplier: 0.34,
  // Holding Up/W biases that trade even further toward vertical lift.
  pushOffUpAwayMultiplier: 0.18,
  pushOffDownInputStrength: 2.15,
  maximumPushOffHorizontalSpeed: 8.2,
  pushOffStaminaCost: 10,
  catchMomentumRetention: 0.24,
  catchMomentumMaximum: 3.2,
  catchMomentumSharpness: 10,
  // v7.3 ledge acquisition is based on the upper torso reaching a lip, not on the
  // capsule center already being near the platform. It works from both climbing and jumps.
  mantleFaceReach: 1.75,
  mantleFaceProbeHeights: Object.freeze([0.02, 0.24, 0.46, 0.68]),
  mantleHeadProbeHeight: 0.82,
  mantleTopProbeUp: 1.82,
  mantleProbeInsets: Object.freeze([0.42, 0.62, 0.84, 1.08, 1.36, 1.68, 2.02, 2.38, 2.78]),
  mantleProbeSideOffsets: Object.freeze([0, -0.24, 0.24, -0.48, 0.48, -0.7, 0.7, -0.88, 0.88]),
  mantleProbeDown: 3.15,
  mantleFloorMinimumRelativeToCenter: -0.22,
  mantleFloorMaximumRelativeToCenter: 1.02,
  mantleAirMinimumVerticalSpeed: -9.5,
  mantleLedgeGrace: 0.52,
  mantleDuration: 0.46,
  mantleMinimumRise: 0.62,
  mantleMaximumRise: 2.08
});

export const CAMERA_CONFIG = Object.freeze({
  distance: 7.4,
  minDistance: 1.2,
  targetHeight: 0.72,
  climbingTargetHeight: 0.62,
  climbingTargetOutset: 0.12,
  startYaw: 0,
  startPitch: -18,
  minPitch: -72,
  maxPitch: 48,
  sensitivity: 0.105,
  touchSensitivity: 0.14,
  rotationSharpness: 28,
  targetSharpness: 22,
  climbingTargetSharpness: 27,
  positionSharpness: 30,
  obstructionInSharpness: 34,
  obstructionOutSharpness: 7,
  obstructionPadding: 0.32,
  obstructionProbeOffset: 0.2
});

export const FISHING_CONFIG = Object.freeze({
  interactionDistance: 3.2,
  chargeSeconds: 1.15,
  minimumCastDistance: 2.8,
  maximumCastDistance: 10.5,
  castSecondsPerMeter: 0.035,
  minimumCastSeconds: 0.5,
  biteDelayMinimum: 2,
  biteDelayMaximum: 8,
  hookWindow: 1.65,
  resultHoldSeconds: 1.35,
  pondSurfaceY: 0.09
});

export const SHINY_CONFIG = Object.freeze({
  chance: 0.006,
  debugForce: false
});

export const RHYTHM_CONFIG = Object.freeze({
  approachSeconds: 1.65,
  perfectWindow: 0.09,
  goodWindow: 0.21,
  pauseGapSeconds: 0.28,
  requiredScorePerNote: 0.72,
  perfectScore: 1.08,
  goodScore: 0.82,
  holdScore: 0.42,
  missedNoteScoreLoss: 0.24,
  wrongInputEscape: 0.32,
  holdReleaseEscape: 0.8,
  feedbackSeconds: 0.48,
  minimumCompletionFraction: 0.68,
  rarityMinimumEvents: Object.freeze({
    Common: 5,
    Uncommon: 7,
    Rare: 8,
    Legendary: 9
  })
});

export const CATCH_QUALITY_CONFIG = Object.freeze({
  perfectMinimumRatio: 0.72,
  greatCleanMinimumRatio: 0.35,
  greatOneMissMinimumRatio: 0.65
});

export const SPAWN_POINT = Object.freeze({ x: -14, y: 2.1, z: 12 });

export const COLORS = Object.freeze({
  sky: [0.49, 0.73, 0.78],
  fog: [0.62, 0.78, 0.75],
  grass: [0.39, 0.58, 0.31],
  grassLight: [0.52, 0.68, 0.37],
  earth: [0.49, 0.34, 0.23],
  rock: [0.44, 0.47, 0.43],
  rockLight: [0.55, 0.57, 0.51],
  wood: [0.46, 0.29, 0.16],
  water: [0.2, 0.62, 0.69],
  foliage: [0.2, 0.47, 0.27],
  foliageLight: [0.36, 0.61, 0.3],
  player: [0.95, 0.5, 0.22],
  playerAccent: [0.99, 0.82, 0.33]
});
