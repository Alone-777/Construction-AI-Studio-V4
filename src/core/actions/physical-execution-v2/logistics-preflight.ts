import type { EquipmentLogisticsPlan, LogisticsPreflight, LogisticsMovement } from './logistics-types';
import type { ValidationIssueV2, PhysicalNodeKind } from './types';
import { resolveHandling, VISUAL_HANDLING_POLICY } from './logistics';

export function failedLogisticsPreflight(code: string, message: string): LogisticsPreflight {
  return {
    mode: 'SHADOW', status: 'WOULD_BLOCK', wouldBlockGeneration: true, commitAvailable: false,
    issues: [{ severity: 'BLOCKER', code, message }], projection: null,
    preparation: { required: true, resourceKeys: [], workerCount: 1,
      strategy: 'VERIFY_CURRENT_SOURCE', instructions: ['Repair/verify the shadow input; do not change OFFICIAL.'] },
  };
}

/** Pure shadow preflight + symbolic handling projection; never a fiscal/commit gate. */
export function evaluateLogisticsPreflight(plan: EquipmentLogisticsPlan): LogisticsPreflight {
  const issues: ValidationIssueV2[] = structuredClone(plan.issues);
  const preparationKeys = new Set<string>();
  const add = (code: string, message: string, blocker = true) => issues.push({
    severity: blocker ? 'BLOCKER' : 'WARNING', code, message,
  });
  const resources = new Map(plan.resources.map(resource => [resource.key, resource]));
  const projection: NonNullable<LogisticsPreflight['projection']> = { resources: [], transitions: [] };
  const evidence = plan.sourceEvidence;
  const sourceBound = Boolean(evidence && plan.sourceFrameId && plan.sourceFrameHash
    && /^[a-f0-9]{64}$/i.test(plan.sourceFrameHash)
    && evidence.frameId === plan.sourceFrameId && evidence.frameHash === plan.sourceFrameHash
    && evidence.officialRevision === plan.officialRevision);
  if (plan.mode !== 'SHADOW' || plan.schemaVersion !== 'construction-equipment-logistics/1') {
    add('LOGISTICS_SCHEMA_INVALID', 'Only the shadow logistics contract is supported.');
  }
  if (resources.size !== plan.resources.length) add('LOGISTICS_DUPLICATE_RESOURCE', 'Resource keys must be unique.');
  if (!Number.isInteger(plan.configuredWorkers) || plan.configuredWorkers < 1) {
    add('LOGISTICS_WORKER_COUNT_INVALID', 'Configured worker count must be a positive integer.');
  }
  if (!sourceBound) add('LOGISTICS_SOURCE_EVIDENCE_UNVERIFIED', 'Bind observations to the current OFFICIAL source frame id, hash and revision.', false);
  if (evidence && new Set(evidence.observations.map(o => o.resourceKey)).size !== evidence.observations.length) {
    add('LOGISTICS_CONFLICTING_OBSERVATIONS', 'Source observations must be unique per resource.');
  }

  for (const resource of resources.values()) {
    if (!resource.registered || !resource.origin.trim() || !resource.sourceZoneId.trim()) {
      add('LOGISTICS_SOURCE_MISSING', `${resource.key} has no registered, located origin.`);
    }
    if (!resource.available) add('LOGISTICS_RESOURCE_UNAVAILABLE', `${resource.key} is not available.`);
    if (resource.kind === 'MATERIAL') {
      if (!Number.isFinite(resource.requiredQuantity) || resource.requiredQuantity! <= 0) {
        add('LOGISTICS_QUANTITY_UNKNOWN', `Declare a positive handling quantity for ${resource.key}.`);
      }
      if (!Number.isFinite(resource.quantity) || resource.quantity! < resource.requiredQuantity!) {
        add('LOGISTICS_INSUFFICIENT_STOCK', `Insufficient or unknown stock for ${resource.key}.`);
      }
    }
    const observation = sourceBound ? evidence!.observations.find(item => item.resourceKey === resource.key) : undefined;
    const observed = observation && observation.zoneId === resource.sourceZoneId && observation.evidenceId.trim();
    const movement = plan.movements.find(item => item.resourceKey === resource.key);
    const offscreenValid = observation?.visibility === 'OFFSCREEN_ACCESSIBLE'
      && observation.entryRoute?.length && movement?.routesVerified
      && JSON.stringify(observation.entryRoute) === JSON.stringify(movement.transportRoute);
    if (!observed || !(observation.visibility === 'VISIBLE' || offscreenValid)) {
      preparationKeys.add(resource.key);
      add('LOGISTICS_SOURCE_PREPARATION_REQUIRED', `Verify or visibly retrieve/deliver ${resource.key}; never paint it into an approved frame.`, false);
    }
  }

  const maxWorkers = Math.max(1, ...plan.movements.map(movement => Number.isInteger(movement.requiredWorkers) ? movement.requiredWorkers : 1));
  const observedWorkerIds = sourceBound
    ? new Set(evidence!.workers.filter(worker => worker.id.trim() && worker.zoneId.trim() && worker.evidenceId.trim()
      && plan.workerArrivalRoutes.some(route => route.workerId === worker.id && route.verified && route.route[0] === worker.zoneId)
    ).map(worker => worker.id)) : new Set<string>();
  const observedWorkers = observedWorkerIds.has(plan.primaryActorId) ? observedWorkerIds.size : 0;
  if (observedWorkers < maxWorkers) add('LOGISTICS_WORKERS_NOT_OBSERVED', `Verify ${maxWorkers} workers and their continuous arrival; configured count is not visual evidence.`, false);

  const moved = new Set<string>();
  for (const movement of plan.movements) {
    const resource = resources.get(movement.resourceKey);
    if (!resource) { add('LOGISTICS_UNKNOWN_RESOURCE', `Unknown movement resource ${movement.resourceKey}.`); continue; }
    if (moved.has(resource.key)) add('LOGISTICS_DUPLICATE_MOVEMENT', `Duplicate consumption/handling of ${resource.key}.`);
    moved.add(resource.key);
    if (!plan.authorizedWorkZoneId || movement.destinationZoneId !== plan.authorizedWorkZoneId) {
      add('LOGISTICS_UNAUTHORIZED_DESTINATION', `Handling ${resource.key} cannot change the authorized work zone.`);
    }
    if (!movement.routesVerified || !movement.transportRoute.length
      || movement.transportRoute[0] !== resource.sourceZoneId
      || movement.transportRoute[movement.transportRoute.length - 1] !== movement.destinationZoneId
      || movement.approachRoute[movement.approachRoute.length - 1] !== resource.sourceZoneId) {
      add('LOGISTICS_ROUTE_UNVERIFIED', `No verified approach and transport route for ${resource.key}.`);
    }
    const profile = movement.handling;
    const validClasses = {
      loadClass: ['LIGHT', 'TEAM', 'HEAVY', 'UNKNOWN'],
      sizeClass: ['COMPACT', 'LONG', 'OVERSIZE', 'UNKNOWN'],
      heightClass: ['GROUND', 'ELEVATED', 'UNKNOWN'],
      evidence: ['DECLARED', 'INFERRED'],
    };
    for (const field of Object.keys(validClasses) as Array<keyof typeof validClasses>) {
      if (profile[field] !== undefined && !validClasses[field].includes(profile[field]!)) {
        add('LOGISTICS_INVALID_HANDLING_VALUE', `Invalid ${field} for ${resource.key}.`);
      }
    }
    for (const [field, value] of Object.entries(profile)) {
      if (['massKg', 'lengthM', 'targetHeightM', 'minimumWorkers'].includes(field)
        && (typeof value !== 'number' || !Number.isFinite(value) || value < 0
          || (field !== 'targetHeightM' && value === 0))) {
        add('LOGISTICS_INVALID_HANDLING_VALUE', `Invalid ${field} for ${resource.key}.`);
      }
    }
    if (profile.minimumWorkers !== undefined && !Number.isInteger(profile.minimumWorkers)) {
      add('LOGISTICS_INVALID_HANDLING_VALUE', 'minimumWorkers must be an integer.');
    }
    if (resource.kind === 'MATERIAL') {
      if ((!profile.loadClass || profile.loadClass === 'UNKNOWN') && profile.massKg === undefined) {
        add('LOGISTICS_LOAD_UNKNOWN', `Declare per-piece/batch load for ${resource.key}; stock quantity is not weight.`);
      }
      if ((!profile.sizeClass || profile.sizeClass === 'UNKNOWN') && profile.lengthM === undefined) {
        add('LOGISTICS_SIZE_UNKNOWN', `Declare the size class of ${resource.key}.`);
      }
      if ((!profile.heightClass || profile.heightClass === 'UNKNOWN') && profile.targetHeightM === undefined) {
        add('LOGISTICS_HEIGHT_UNKNOWN', `Declare installation height/class for ${resource.key}.`);
      }
      if (profile.evidence === 'INFERRED') add('LOGISTICS_HANDLING_ASSUMPTION', `Confirm the inferred handling profile for ${resource.key}.`, false);
    }
    const required = resolveHandling(profile);
    if (!Number.isInteger(movement.requiredWorkers) || movement.requiredWorkers < required.workers
      || movement.requiredWorkers > plan.configuredWorkers) {
      add('LOGISTICS_INSUFFICIENT_WORKERS', `${resource.key} requires ${required.workers} or more workers; ${plan.configuredWorkers} configured.`);
    }
    if (movement.method !== 'ALREADY_HELD' && movement.method !== required.method) {
      add('LOGISTICS_HANDLING_METHOD_INVALID', `Implausible handling method for ${resource.key}; expected ${required.method}.`);
    }
    if (movement.transportMethod !== required.transportMethod) {
      add('LOGISTICS_TRANSPORT_METHOD_INVALID', `Wrong horizontal transport for ${resource.key}.`);
    }
    if (required.transportMethod === 'CART' && resource.sourceZoneId !== movement.destinationZoneId) {
      // Current contract models a fixed hoist, not its relocation or a self-loading vehicle.
      // Do not approve unloading/loading at stock using a hoist that is only at the target.
      add('LOGISTICS_HEAVY_LOADING_PLAN_REQUIRED', `${resource.key} needs a verified stock-side loading and destination unloading plan; propose delivery/staging before hoisting.`);
    }
    if (movement.method === 'ALREADY_HELD' && (resource.kind !== 'TOOL' || resource.heldBy !== plan.primaryActorId)) {
      add('LOGISTICS_UNPROVEN_HELD_RESOURCE', `${resource.key} cannot bypass pickup.`);
    }
    for (const kind of required.equipmentKinds) {
      const candidates = movement.equipmentKeys.map(key => resources.get(key)).filter(r => r?.equipment?.kind === kind);
      const equipment = candidates[0];
      if (!movement.equipmentKinds.includes(kind) || !equipment?.available || !equipment.registered) {
        add('LOGISTICS_EQUIPMENT_MISSING', `${resource.key} needs available ${kind}; more workers alone do not replace it.`);
        continue;
      }
      // Do not teleport setup gear. Non-ready gear must be staged through the normal workflow.
      if (!equipment.equipment!.ready || equipment.sourceZoneId !== movement.destinationZoneId) {
        add('LOGISTICS_EQUIPMENT_SETUP_REQUIRED', `Stage ${equipment.key} at the work point through a reviewed preparation action.`, false);
        preparationKeys.add(equipment.key);
      }
      if (['HOIST', 'RIGGING'].includes(kind) && equipment.equipment!.anchored !== true) {
        add('LOGISTICS_ANCHOR_MISSING', `${equipment.key} needs a verified stable anchor.`);
      }
      if (['HOIST', 'CART', 'RIGGING'].includes(kind) && (
        profile.massKg === undefined || !Number.isFinite(equipment.equipment!.capacityKg)
        || equipment.equipment!.capacityKg! < profile.massKg
      )) add('LOGISTICS_CAPACITY_UNVERIFIED', `Verify load/capacity of ${equipment.key} for this piece/batch.`);
      if (['HOIST', 'WORK_PLATFORM'].includes(kind) && required.method === 'HOIST' && (
        profile.targetHeightM === undefined || !Number.isFinite(equipment.equipment!.reachM)
        || equipment.equipment!.reachM! < profile.targetHeightM
      )) add('LOGISTICS_HEIGHT_ACCESS_UNVERIFIED', `Verify working height/reach of ${equipment.key}.`);
    }

    const expected: PhysicalNodeKind[] = resource.kind === 'TOOL'
      ? movement.method === 'ALREADY_HELD'
        ? plan.resources.some(r => r.kind === 'MATERIAL') || plan.resources.filter(r => r.kind === 'TOOL').length > 1
          ? ['APPROACH', 'PLACE', 'RELEASE'] : ['APPROACH', 'INSPECT']
        : ['APPROACH', 'ACQUIRE_TOOL', 'MOVE_MATERIAL', 'PLACE', 'RELEASE']
      : ['APPROACH', 'GRIP', 'LIFT', 'MOVE_MATERIAL', ...(required.method === 'HOIST' ? ['LIFT' as const] : []), 'POSITION', movement.placementKind, 'RELEASE'];
    if (JSON.stringify(movement.steps.map(step => step.kind)) !== JSON.stringify(expected)
      || new Set(movement.steps.map(step => step.id)).size !== movement.steps.length) {
      add('LOGISTICS_HANDLING_CHAIN_BROKEN', `${resource.key} needs pickup → lift → transport → position → secure/seat → release.`);
    }
    let state = movement.method === 'ALREADY_HELD' ? 'HELD' : 'STORED';
    let location = resource.sourceZoneId;
    for (const [stepIndex, step] of movement.steps.entries()) {
      if (step.resourceKey !== resource.key) add('LOGISTICS_STEP_RESOURCE_MISMATCH', 'Handling steps must refer to their own resource.');
      const finalHoist = step.kind === 'LIFT' && stepIndex > movement.steps.findIndex(s => s.kind === 'MOVE_MATERIAL');
      const expectedZone = (!finalHoist && ['GRIP', 'LIFT', 'ACQUIRE_TOOL'].includes(step.kind))
        || (step.kind === 'APPROACH' && movement.method !== 'ALREADY_HELD')
        ? resource.sourceZoneId : movement.destinationZoneId;
      if (step.zoneId !== expectedZone) add('LOGISTICS_STEP_LOCATION_MISMATCH', `${step.id} cannot move the resource implicitly.`);
      if (step.kind === 'GRIP' || step.kind === 'ACQUIRE_TOOL') state = 'HELD';
      if (step.kind === 'LIFT') state = finalHoist ? 'HOISTED' : 'LIFTED';
      if (step.kind === 'MOVE_MATERIAL' || (step.kind === 'APPROACH' && movement.method === 'ALREADY_HELD')) {
        location = movement.destinationZoneId;
        state = 'CARRIED';
      }
      if (step.kind === 'POSITION' || step.kind === 'PLACE') state = 'SUPPORTED';
      if (step.kind === 'FASTEN') state = 'ATTACHED';
      if (step.kind === 'RELEASE' && !['SUPPORTED', 'ATTACHED'].includes(state)) {
        add('LOGISTICS_RELEASE_UNSUPPORTED', `${resource.key} would float/fall after release.`);
      }
      projection.transitions.push({ stepId: step.id, resourceKey: resource.key, location, state });
    }
    projection.resources.push({
      resourceKey: resource.key, location,
      state: resource.kind === 'MATERIAL' ? 'INCORPORATED' : state === 'SUPPORTED' ? 'SUPPORTED' : 'HELD',
      ...(resource.kind === 'MATERIAL' ? { remainingAtSource: resource.quantity! - resource.requiredQuantity! } : {}),
    });
  }
  for (const resource of resources.values()) {
    if (resource.kind !== 'EQUIPMENT' && !moved.has(resource.key)) add('LOGISTICS_MOVEMENT_MISSING', `No physical path to work for ${resource.key}.`);
  }
  const stepCount = plan.movements.reduce((total, movement) => total + movement.steps.length, 0);
  if (!Number.isFinite(plan.durationSeconds) || plan.durationSeconds <= 0
    || stepCount * VISUAL_HANDLING_POLICY.minimumSecondsPerHandlingStep > plan.durationSeconds) {
    add('LOGISTICS_DURATION_REQUIRES_SPLIT', 'The minimum handling chain exceeds the clip duration. Propose a preparation segment; never hide movement/progress.');
  }
  const blocking = issues.some(issue => issue.severity === 'BLOCKER');
  const prep = issues.some(issue => issue.severity === 'WARNING');
  return {
    mode: 'SHADOW', status: blocking ? 'WOULD_BLOCK' : prep ? 'PREP_REQUIRED' : 'READY',
    wouldBlockGeneration: blocking || prep, commitAvailable: false, issues,
    preparation: {
      required: blocking || prep, resourceKeys: [...preparationKeys], workerCount: maxWorkers,
      strategy: preparationKeys.size ? 'RETRIEVAL_OR_DELIVERY_REQUIRED' : 'VERIFY_CURRENT_SOURCE',
      instructions: blocking || prep ? [
        'Verify the current source frame and registered inventory; unknown is not available/visible.',
        'Before JOB 1, a compact registered stock/tool point may be proposed for source-image review.',
        'After an approved frame, show retrieval/delivery/setup via the existing reviewed workflow; never edit items into OFFICIAL.',
        'Keep construction progress, camera, terrain and future-component absence unchanged during preparation.',
        'Missing workers/equipment require provisioning and review; do not create them or insert Jobs automatically.',
      ] : [],
    },
    projection: blocking ? null : projection,
  };
}
