/**
 * GET /api/council/agents - 获取4大阵营代理的定义
 */

import { NextRequest } from 'next/server';
import {
  AGENT_DEFINITIONS,
  ALL_AGENT_IDS,
  SECTORS,
  RESOURCE_DEFINITIONS,
} from '@/lib/council/agents';

export async function GET(_request: NextRequest) {
  const agents = ALL_AGENT_IDS.map((id) => {
    const def = AGENT_DEFINITIONS[id];
    return {
      id: def.id,
      role: def.role,
      roleCn: def.roleCn,
      sector: def.sector,
      title: def.title,
      titleCn: def.titleCn,
      primaryResource: def.primaryResource,
      hasVetoPower: def.hasVetoPower,
      vetoScope: def.vetoScope,
      color: def.color,
      icon: def.icon,
      description: def.description,
      guardsBottomLine: def.guardsBottomLine ? {
        resource: def.guardsBottomLine.resource,
        sblAction: def.guardsBottomLine.sblAction,
        ublAction: def.guardsBottomLine.ublAction,
      } : null,
    };
  });

  const sectors = Object.entries(SECTORS).map(([key, sector]) => ({
    id: key,
    label: sector.label,
    agents: sector.agents,
  }));

  return Response.json({
    code: 0,
    data: {
      agents,
      sectors,
      resources: RESOURCE_DEFINITIONS,
    },
  });
}
