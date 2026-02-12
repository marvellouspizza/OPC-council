/**
 * Silent Council - 模块统一导出
 */

// Core types
export * from './types';

// Agent definitions
export {
  AGENT_DEFINITIONS, ALL_AGENT_IDS, SECTORS,
  RESOURCE_DEFINITIONS, DEFAULT_RESOURCE_INVENTORY,
  createDefaultAgentState, createAllAgentStates,
  applyResourceDelta, calculateResourceImpact,
  computeMBTIAllocation,
} from './agents';

// Token allocation
export {
  DEFAULT_TOKEN_ALLOCATION, SYSTEM_TOKEN_FLOOR,
} from './types';

// Prompts
export {
  buildMetaPrompt, buildAgentPrompt, buildNarrationPrompt,
  buildWhisperPrompt,
  parseDualChannelOutput, parseBottomLineAlerts,
  sanitizeAgentOutput, buildArchitectPrompt,
} from './prompts';

// Negotiation engine
export {
  CouncilSession,
  calculateAgentVote, tallyVotes,
  checkVetoPower, executeVeto,
  checkBottomLines,
  detectWhisperTriggers, createWhisperMessage,
  forceConvergence,
  calculateControversyScores, getDynamicSpeakingOrder,
  detectAutoTradeOpportunity,
} from './negotiation-engine';
export type { AutoTradeSuggestion } from './negotiation-engine';

// Orchestrator
export {
  runCouncilSession, encodeSSE,
} from './orchestrator';
export type { OrchestratorConfig } from './orchestrator';

// Schedule engine
export {
  allocateTokens, selectCandidateTasks, generateSchedule, generateScheduleWithAI,
  detectTokenConflict, freezeEscrow, releaseEscrow,
  serializeScheduleAsBill, generateScheduleTrigger,
  rollTaskResult, releaseEscrowWithRNG,
} from './schedule-engine';

// A2A engine
export {
  createA2AMessage, parseA2AMessage,
  extractAgentIdFromMessage, isValidA2AMethod,
} from './a2a-engine';

// Collapse engine (设计文档 §5)
export {
  collapseAllTasks, collapseFromAgentStates,
  raiseGrade, formatTradeLog, validateCollapseResults,
} from './collapse-engine';

// Settlement engine (设计文档 §6)
export {
  rollEnhanced, generateEventCard,
  buildSettlementReport, settlementToResultCard,
  serializeSettlementReport,
  calculateDailyReset, adjustAgentGrowth,
  generateTaskResultDescription,
} from './settlement-engine';
export type { SettlementInput } from './settlement-engine';

// Theater engine (设计文档 §4)
export {
  TheaterClock, DEFAULT_THEATER_CONFIG,
  PHASE1_LOADING_MESSAGES, PHASE3_COLLAPSE_MESSAGES,
  buildPhaseTransitionMessage, selectSpeakerForTick, getTickPacing,
  buildUrgencyMessage, renderProgressBar, renderPhaseIndicator,
} from './theater-engine';
export type { TheaterPhase, TheaterConfig, TheaterState } from './theater-engine';
