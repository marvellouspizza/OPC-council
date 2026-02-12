/**
 * Silent Council - A2A (Agent-to-Agent) 通讯引擎
 */

import type { A2AMessage, A2AMethod, A2AParams, AgentId } from './types';

export function createA2AMessage(
  method: A2AMethod,
  params: A2AParams,
): A2AMessage {
  return {
    jsonrpc: '2.0',
    method,
    id: `a2a_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    params,
  };
}

export function parseA2AMessage(raw: string): A2AMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.jsonrpc === '2.0' && parsed.method && parsed.id) {
      return parsed as A2AMessage;
    }
    return null;
  } catch {
    return null;
  }
}

export function extractAgentIdFromMessage(msg: A2AMessage): AgentId | null {
  const params = msg.params as Record<string, unknown>;
  const id = params.agent_id || params.source_agent;
  if (typeof id === 'string' && ['ENTJ', 'ISFJ', 'INFJ', 'ESTP'].includes(id)) {
    return id as AgentId;
  }
  return null;
}

export function isValidA2AMethod(method: string): method is A2AMethod {
  const validMethods: A2AMethod[] = [
    'council.propose', 'council.counter', 'council.vote',
    'council.veto', 'council.consensus', 'council.speak',
    'council.elect_chair', 'council.whisper',
  ];
  return validMethods.includes(method as A2AMethod);
}
