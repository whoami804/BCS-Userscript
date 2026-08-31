from pathlib import Path
import sys
if len(sys.argv)!=3:
    raise SystemExit('usage: build-rc17.py <src> <dst>')
src=Path(sys.argv[1]); out=Path(sys.argv[2]); s=src.read_text()

s=s.replace("// @version      0.8.1-rc16", "// @version      0.8.1-rc17")
s=s.replace("// @description  Immersive v2 native-first: Boosteroid-owned mouse capture + BCS fullscreen/keyboard orchestration and lifecycle/input-state guardian; preserves RC15 H-014C fix.",
            "// @description  Image Lab Feature Layer 0.1: export-only derived quality features with zero extra getStats/pixel analysis; Immersive v2 + integrated H-014C fix preserved.")
s=s.replace("const VERSION = '0.8.1-rc16';", "const VERSION = '0.8.1-rc17';")
s=s.replace("const BUILD = 'Immersive v2 Native-First + Input State Guardian + RC15 Chord Fix - RC16';",
            "const BUILD = 'Image Lab Feature Layer 0.1 + Immersive v2 Native-First + Integrated H-014C Fix - RC17';")

# WebRTC corruption stats: read from same existing getStats report; no extra getStats.
s=s.replace("        qpSum:n(inbound.qpSum),\n        nackCount:n(inbound.nackCount),",
            "        qpSum:n(inbound.qpSum),\n        totalCorruptionProbability:n(inbound.totalCorruptionProbability),\n        totalSquaredCorruptionProbability:n(inbound.totalSquaredCorruptionProbability),\n        corruptionMeasurements:n(inbound.corruptionMeasurements),\n        nackCount:n(inbound.nackCount),")

s=s.replace("    qpSum: r.qpSum ?? null,\n    nackCount: r.nackCount ?? null,",
            "    qpSum: r.qpSum ?? null,\n    totalCorruptionProbability: r.totalCorruptionProbability ?? null,\n    totalSquaredCorruptionProbability: r.totalSquaredCorruptionProbability ?? null,\n    corruptionMeasurements: r.corruptionMeasurements ?? null,\n    nackCount: r.nackCount ?? null,")

s=s.replace("    framesReceivedRaw: cur.framesReceived,\n    framesDecodedRaw: cur.framesDecoded,",
            "    framesReceivedRaw: cur.framesReceived,\n    framesReceivedDelta: null,\n    framesDecodedRaw: cur.framesDecoded,\n    framesDecodedDelta: null,")

s=s.replace("    qpSumRaw: cur.qpSum,\n    qpSumDelta: null,\n    qpPerDecodedFrame: null,",
            "    qpSumRaw: cur.qpSum,\n    qpSumDelta: null,\n    qpPerDecodedFrame: null,\n    corruptionMeasurementsRaw: cur.corruptionMeasurements,\n    corruptionMeasurementsDelta: null,\n    corruptionProbabilityMean: null,\n    corruptionProbabilityStdDev: null,")

s=s.replace("    freezeCount: cur.freezeCount,\n    freezeDelta: null,\n    totalFreezesDuration: cur.totalFreezesDuration,",
            "    freezeCount: cur.freezeCount,\n    freezeDelta: null,\n    totalFreezesDurationRaw: cur.totalFreezesDuration,\n    freezeDurationDeltaMs: null,")

s=s.replace("      if (recvFramesDelta >= 0) out.receivedFPS = recvFramesDelta / dt;\n      if (decFramesDelta >= 0) out.decodedFPS = decFramesDelta / dt;",
            "      if (recvFramesDelta >= 0) { out.receivedFPS = recvFramesDelta / dt; out.framesReceivedDelta = recvFramesDelta; }\n      if (decFramesDelta >= 0) { out.decodedFPS = decFramesDelta / dt; out.framesDecodedDelta = decFramesDelta; }")

s=s.replace("      const freezeDelta = cur.freezeCount - prev.freezeCount;\n      out.freezeDelta = freezeDelta >= 0 ? freezeDelta : null;",
            "      const freezeDelta = cur.freezeCount - prev.freezeCount;\n      out.freezeDelta = freezeDelta >= 0 ? freezeDelta : null;\n      if (Number.isFinite(cur.totalFreezesDuration) && Number.isFinite(prev.totalFreezesDuration) && cur.totalFreezesDuration >= prev.totalFreezesDuration) {\n        out.freezeDurationDeltaMs = (cur.totalFreezesDuration - prev.totalFreezesDuration) * 1000;\n      }")

needle="""      const counterDelta=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&a>=b ? a-b : null;\n      out.nackCountDelta=counterDelta(cur.nackCount,prev.nackCount);"""
repl="""      const counterDelta=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&a>=b ? a-b : null;\n      out.corruptionMeasurementsDelta=counterDelta(cur.corruptionMeasurements,prev.corruptionMeasurements);\n      if (out.corruptionMeasurementsDelta>0 && Number.isFinite(cur.totalCorruptionProbability) && Number.isFinite(prev.totalCorruptionProbability) && cur.totalCorruptionProbability>=prev.totalCorruptionProbability) {\n        const pDelta=cur.totalCorruptionProbability-prev.totalCorruptionProbability;\n        const meanP=pDelta/out.corruptionMeasurementsDelta;\n        out.corruptionProbabilityMean=meanP;\n        if (Number.isFinite(cur.totalSquaredCorruptionProbability) && Number.isFinite(prev.totalSquaredCorruptionProbability) && cur.totalSquaredCorruptionProbability>=prev.totalSquaredCorruptionProbability) {\n          const sqDelta=cur.totalSquaredCorruptionProbability-prev.totalSquaredCorruptionProbability;\n          out.corruptionProbabilityStdDev=Math.sqrt(Math.max(0,sqDelta/out.corruptionMeasurementsDelta-meanP*meanP));\n        }\n      }\n      out.nackCountDelta=counterDelta(cur.nackCount,prev.nackCount);"""
assert needle in s
s=s.replace(needle,repl)

# Sample fields.
s=s.replace("    framesReceivedRaw: rtc?.framesReceivedRaw ?? null,\n    framesDecodedRaw: rtc?.framesDecodedRaw ?? null,",
            "    framesReceivedRaw: rtc?.framesReceivedRaw ?? null,\n    framesReceivedDelta: rtc?.framesReceivedDelta ?? null,\n    framesDecodedRaw: rtc?.framesDecodedRaw ?? null,\n    framesDecodedDelta: rtc?.framesDecodedDelta ?? null,")
s=s.replace("    qpPerDecodedFrame: round(rtc?.qpPerDecodedFrame,4),\n    nackCountRaw:",
            "    qpPerDecodedFrame: round(rtc?.qpPerDecodedFrame,4),\n    corruptionMeasurementsRaw: rtc?.corruptionMeasurementsRaw ?? null,\n    corruptionMeasurementsDelta: rtc?.corruptionMeasurementsDelta ?? null,\n    corruptionProbabilityMean: round(rtc?.corruptionProbabilityMean,6),\n    corruptionProbabilityStdDev: round(rtc?.corruptionProbabilityStdDev,6),\n    nackCountRaw:")
s=s.replace("    freezeCount: rtc?.freezeCount ?? null,\n    freezeDelta: rtc?.freezeDelta ?? null,",
            "    freezeCount: rtc?.freezeCount ?? null,\n    freezeDelta: rtc?.freezeDelta ?? null,\n    totalFreezesDurationRaw: rtc?.totalFreezesDurationRaw ?? null,\n    freezeDurationDeltaMs: round(rtc?.freezeDurationDeltaMs,3),")

# Core export fields.
s=s.replace("    framesReceivedRaw:s.framesReceivedRaw,framesDecodedRaw:s.framesDecodedRaw,framesDroppedRaw:s.framesDroppedRaw,framesDroppedDelta:s.framesDroppedDelta,",
            "    framesReceivedRaw:s.framesReceivedRaw,framesReceivedDelta:s.framesReceivedDelta,framesDecodedRaw:s.framesDecodedRaw,framesDecodedDelta:s.framesDecodedDelta,framesDroppedRaw:s.framesDroppedRaw,framesDroppedDelta:s.framesDroppedDelta,")
s=s.replace("    qpSumRaw:s.qpSumRaw,qpSumDelta:s.qpSumDelta,qpPerDecodedFrame:s.qpPerDecodedFrame,",
            "    qpSumRaw:s.qpSumRaw,qpSumDelta:s.qpSumDelta,qpPerDecodedFrame:s.qpPerDecodedFrame,corruptionMeasurementsRaw:s.corruptionMeasurementsRaw,corruptionMeasurementsDelta:s.corruptionMeasurementsDelta,corruptionProbabilityMean:s.corruptionProbabilityMean,corruptionProbabilityStdDev:s.corruptionProbabilityStdDev,")
s=s.replace("    freezeCount:s.freezeCount,freezeDelta:s.freezeDelta,",
            "    freezeCount:s.freezeCount,freezeDelta:s.freezeDelta,totalFreezesDurationRaw:s.totalFreezesDurationRaw,freezeDurationDeltaMs:s.freezeDurationDeltaMs,")

# Availability includes corruption.
s=s.replace("    'processingDelayPerFrameMs','retransmittedPacketsReceivedRaw','framesAssembledFromMultiplePacketsRaw'",
            "    'processingDelayPerFrameMs','retransmittedPacketsReceivedRaw','framesAssembledFromMultiplePacketsRaw','corruptionMeasurementsRaw','corruptionProbabilityMean'")

# Feature Layer: export-only so gameplay sampler does not compute derived diagnostics.
insert_before="function buildLongSessionStatistics() {"
assert insert_before in s
feature_code=r'''// -----------------------------------------------------------------------------
// IMAGE LAB FEATURE LAYER 0.1 - EXPORT-ONLY DERIVATION (RC17)
// Derived quality features are computed only when the user exports the log.
// The 1 Hz gameplay sampler performs no feature-model pass, no pixel capture,
// no canvas readback, no ML and no additional RTC getStats() call.
// -----------------------------------------------------------------------------
function buildImageFeatureLayer(samples) {
  const started=now();
  const eligible=samples.filter(s=>s.measurementEligible!==false && (s.streamActive || Number.isFinite(s.bitrateMbps)));
  const finite=(v)=>Number.isFinite(v)?v:null;
  const ratio=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&a>=0&&b>0?a/b:null;
  const rows=[];

  for (const s of eligible) {
    const res=s.inboundResolution || s.inboundFramePx || null;
    const width=Number(res?.width),height=Number(res?.height);
    const pixels=width>0&&height>0 ? width*height : null;
    const fps=Number.isFinite(s.decodedFPS)&&s.decodedFPS>0 ? s.decodedFPS : (Number.isFinite(s.rtcFPS)&&s.rtcFPS>0?s.rtcFPS:null);
    const frameBudgetMs=Number.isFinite(fps)&&fps>0 ? 1000/fps : null;
    const bitrateBps=Number.isFinite(s.bitrateMbps)&&s.bitrateMbps>=0 ? s.bitrateMbps*1e6 : null;
    const bitsPerPixelFrame=Number.isFinite(bitrateBps)&&pixels>0&&fps>0 ? bitrateBps/(pixels*fps) : null;
    const directVideoDensity=s.bitrateScope==='VIDEO' && s.bitrateConfidence==='DIRECT_COUNTER' ? bitsPerPixelFrame : null;
    const retransPacketRatio=ratio(s.retransmittedPacketsReceivedDelta,s.packetsReceivedDelta);
    const frameDropRatio=ratio(s.framesDroppedDelta,s.framesReceivedDelta);
    const nackPerK=Number.isFinite(s.nackCountDelta)&&Number.isFinite(s.framesDecodedDelta)&&s.framesDecodedDelta>0 ? s.nackCountDelta/s.framesDecodedDelta*1000 : null;
    const pliPerK=Number.isFinite(s.pliCountDelta)&&Number.isFinite(s.framesDecodedDelta)&&s.framesDecodedDelta>0 ? s.pliCountDelta/s.framesDecodedDelta*1000 : null;
    const firPerK=Number.isFinite(s.firCountDelta)&&Number.isFinite(s.framesDecodedDelta)&&s.framesDecodedDelta>0 ? s.firCountDelta/s.framesDecodedDelta*1000 : null;
    const decodeBudgetRatio=ratio(s.decodeTimePerFrameMs,frameBudgetMs);
    const processingBudgetRatio=ratio(s.processingDelayPerFrameMs,frameBudgetMs);
    const jitterExcess=Number.isFinite(s.jitterBufferMs)&&Number.isFinite(s.jitterBufferMinimumMs) ? Math.max(0,s.jitterBufferMs-s.jitterBufferMinimumMs) : null;
    const jitterTargetExcess=Number.isFinite(s.jitterBufferTargetMs)&&Number.isFinite(s.jitterBufferMinimumMs) ? Math.max(0,s.jitterBufferTargetMs-s.jitterBufferMinimumMs) : null;
    const box=s.elementBoxCssPx || s.renderedResolution || null;
    const boxArea=Number(box?.width)>0&&Number(box?.height)>0 ? Number(box.width)*Number(box.height) : null;
    const surfaceAreaRatio=Number.isFinite(boxArea)&&pixels>0 ? boxArea/pixels : null;

    rows.push({
      t:s.t,phase:s.phase,codec:s.codec||null,inboundResolution:res,
      decodedFPS:finite(s.decodedFPS),frameBudgetMs:round(frameBudgetMs,4),
      bitrateMbps:finite(s.bitrateMbps),bitrateScope:s.bitrateScope||null,bitrateConfidence:s.bitrateConfidence||null,
      observedBitsPerPixelFrame:round(bitsPerPixelFrame,8),directVideoBitsPerPixelFrame:round(directVideoDensity,8),
      retransmittedPacketRatio:round(retransPacketRatio,6),frameDropRatio:round(frameDropRatio,6),
      nackPerThousandDecodedFrames:round(nackPerK,4),pliPerThousandDecodedFrames:round(pliPerK,4),firPerThousandDecodedFrames:round(firPerK,4),
      decodeBudgetRatio:round(decodeBudgetRatio,6),processingBudgetRatio:round(processingBudgetRatio,6),
      jitterBufferExcessMs:round(jitterExcess,4),jitterBufferTargetExcessMs:round(jitterTargetExcess,4),
      surfaceScaleX:finite(s.elementBoxToIntrinsicScaleX),surfaceScaleY:finite(s.elementBoxToIntrinsicScaleY),surfaceAreaRatio:round(surfaceAreaRatio,6),
      freezeDelta:finite(s.freezeDelta),freezeDurationDeltaMs:finite(s.freezeDurationDeltaMs),
      corruptionMeasurementsDelta:finite(s.corruptionMeasurementsDelta),corruptionProbabilityMean:finite(s.corruptionProbabilityMean),corruptionProbabilityStdDev:finite(s.corruptionProbabilityStdDev)
    });
  }

  const col=key=>rows.map(r=>r[key]).filter(Number.isFinite);
  return {
    schemaVersion:1,
    stage:'FEATURE_LAYER_0.1',
    computation:'EXPORT_ONLY',
    runtimeFeaturePass:false,
    runtimePixelAnalysis:false,
    runtimeMachineLearning:false,
    extraGetStatsCallsPerSample:0,
    sampleCount:rows.length,
    buildWallMs:round(now()-started,3),
    principles:{
      metricIsNotDiagnosis:true,
      bitrateIsContextual:true,
      requestedNotEqualAchieved:true,
      sameLabBrowserCodecBaselineRequiredForFutureThresholds:true
    },
    semantics:{
      observedBitsPerPixelFrame:'Observed bitrate divided by decoded/RTC frame rate and inbound pixels; scope/confidence must be read with the value.',
      directVideoBitsPerPixelFrame:'Same density only when bitrate source is a direct VIDEO counter; preferred coding-density feature.',
      retransmittedPacketRatio:'delta retransmittedPacketsReceived / delta packetsReceived; repair-load signal, not a standalone network diagnosis.',
      frameDropRatio:'delta framesDropped / delta framesReceived.',
      decodeBudgetRatio:'decode ms per frame / frame budget at observed FPS.',
      processingBudgetRatio:'receiver totalProcessingDelay per decoded frame / frame budget at observed FPS.',
      jitterBufferExcessMs:'observed jitter-buffer delay per emitted frame minus minimum delay.',
      corruptionProbabilityMean:'delta totalCorruptionProbability / delta corruptionMeasurements when exposed by the negotiated WebRTC path.'
    },
    statistics:{
      observedBitsPerPixelFrame:stats(col('observedBitsPerPixelFrame')),
      directVideoBitsPerPixelFrame:stats(col('directVideoBitsPerPixelFrame')),
      retransmittedPacketRatio:stats(col('retransmittedPacketRatio')),
      frameDropRatio:stats(col('frameDropRatio')),
      nackPerThousandDecodedFrames:stats(col('nackPerThousandDecodedFrames')),
      decodeBudgetRatio:stats(col('decodeBudgetRatio')),
      processingBudgetRatio:stats(col('processingBudgetRatio')),
      jitterBufferExcessMs:stats(col('jitterBufferExcessMs')),
      surfaceAreaRatio:stats(col('surfaceAreaRatio')),
      corruptionProbabilityMean:stats(col('corruptionProbabilityMean'))
    },
    samples:rows
  };
}

'''
s=s.replace(insert_before,feature_code+insert_before)

# Build export computes feature layer only on export.
s=s.replace("  const imageAvailability=imageTelemetryAvailability(samples);\n  const guard=observerHealth(samples);",
            "  const imageAvailability=imageTelemetryAvailability(samples);\n  const imageFeatureLayer=buildImageFeatureLayer(samples);\n  const guard=observerHealth(samples);")

# Insert new top-level block right after imageTelemetry block, before longSessionTelemetry.
needle="""      statistics:imageStats
    },
    longSessionTelemetry:{"""
repl="""      statistics:imageStats
    },
    imageFeatureLayer,
    longSessionTelemetry:{"""
assert needle in s
s=s.replace(needle,repl)

# Update image telemetry semantics with corruption probe.
s=s.replace("        processingDelayPerFrameMs:'delta totalProcessingDelay / delta framesDecoded when exposed'",
            "        processingDelayPerFrameMs:'delta totalProcessingDelay / delta framesDecoded when exposed',\n        corruptionProbabilityMean:'delta totalCorruptionProbability / delta corruptionMeasurements when the negotiated Chromium/WebRTC path exposes corruption scoring'")

# Performance guard note explicitly says feature layer is export-only.
s=s.replace("      note:'CORE localWorkMs excludes asynchronous waits. DEEP callback cost is measured separately inside the on-demand rVFC callback.'",
            "      note:'CORE localWorkMs excludes asynchronous waits. DEEP callback cost is measured separately inside the on-demand rVFC callback. Image Feature Layer 0.1 derives features only during export and adds no gameplay-time feature pass.'")

# Automatic H-014C integration on validated LAB-B Chromium environment.
helper="""function shouldAutoEnableMouseChordFix(){
  return S.lab==='LAB-B' && ENV.engine==='Chromium';
}

"""
marker="function setMouseChordFixEnabled(enabled,reason='UI'){"
assert marker in s
s=s.replace(marker,helper+marker)

s=s.replace("return {schemaVersion:2,mode:'H014C_DIRECT_COMPATIBILITY_GUARD_BYPASS',enabled:F.enabled,manualGate:true,offByDefault:true,",
            "return {schemaVersion:3,mode:'H014C_DIRECT_COMPATIBILITY_GUARD_BYPASS',enabled:F.enabled,manualGate:false,offByDefault:false,autoIntegratedOnValidatedLabB:true,")

# Boot auto-enables directly after page hook installation.
s=s.replace("function boot() {\n  installMouseChordFixPage();\n  installPageBridge();",
            "function boot() {\n  installMouseChordFixPage();\n  if (shouldAutoEnableMouseChordFix()) setMouseChordFixEnabled(true,'AUTO_INTEGRATED_LAB_B');\n  installPageBridge();")

s=s.replace("architecture:'LEAN_PAGE_BRIDGE__PERSISTENT_AUTO_PROFILE__FROZEN_STREAM_CONTROL__CORE_DEEP_TELEMETRY__RC15_CHORD_FIX__RC16_IMMERSIVE_V2_NATIVE_FIRST',",
            "architecture:'LEAN_PAGE_BRIDGE__PERSISTENT_AUTO_PROFILE__FROZEN_STREAM_CONTROL__CORE_DEEP_TELEMETRY__RC17_IMAGE_FEATURE_EXPORT_ONLY__RC15_CHORD_FIX_AUTO__RC16_IMMERSIVE_V2_NATIVE_FIRST',")
s=s.replace("mouseChordCompatibilityFix:{enabled:false,manualGate:true,offByDefault:true,exactChordCasesOnly:true,nativeHandlerReroute:true,payloadMutation:false,idCmdFabrication:false,additionalTransportSend:false,syntheticDomEventDispatch:false,dualTransportMetadataProof:true},",
            "mouseChordCompatibilityFix:{enabled:shouldAutoEnableMouseChordFix(),manualGate:false,offByDefault:false,autoIntegratedOnValidatedLabB:true,exactChordCasesOnly:true,nativeHandlerReroute:false,payloadMutation:false,idCmdFabrication:false,additionalTransportSend:false,syntheticDomEventDispatch:false,dualTransportMetadataProof:true},")

# Export status + instrumentation docs.
s=s.replace("status:'V0.8.1_RC15__DIRECT_COMPATIBILITY_GUARD_BYPASS__NOT_CANONICAL'",
            "status:'V0.8.1_RC17__IMAGE_LAB_FEATURE_LAYER_0_1__STATIC_CANDIDATE__NOT_CANONICAL'")
s=s.replace("telemetryIntegrityModel:'RC16_IMMERSIVE_V2_NATIVE_FIRST_PLUS_INPUT_STATE_GUARDIAN_PLUS_RC15_CHORD_FIX',",
            "telemetryIntegrityModel:'RC17_IMAGE_FEATURE_LAYER_EXPORT_ONLY_PLUS_RC16_IMMERSIVE_V2_PLUS_AUTO_INTEGRATED_RC15_CHORD_FIX',")
s=s.replace("      mouseChordCompatibilityFix:{\n        manualFixGate:true,offByDefault:true,pageContextHookInstalledAtDocumentStart:true,\n        listenerScope:'Boosteroid getMouseButtonEvent mousedown/up only',",
            "      mouseChordCompatibilityFix:{\n        manualFixGate:false,offByDefault:false,autoIntegratedOnValidatedLabB:true,killSwitchAvailable:true,pageContextHookInstalledAtDocumentStart:true,\n        listenerScope:'Direct EventHandler.shouldIgnoreMouseCompatibilityEvent guard patch; no event-listener reroute',")
s=s.replace("      immersiveGameMode:{\n        userTriggered:true,",
            "      imageFeatureLayer:{stage:'0.1',computation:'EXPORT_ONLY',extraGetStatsCallsPerSample:0,pixelCapture:false,canvasReadback:false,machineLearningRuntime:false},\n      immersiveGameMode:{\n        userTriggered:true,")

# UI wording: fix is integrated; toggle remains kill switch.
s=s.replace("'RC15 • FIX LMB + RMB'", "'FIX LMB + RMB • AUTO'")

out.write_text(s)
