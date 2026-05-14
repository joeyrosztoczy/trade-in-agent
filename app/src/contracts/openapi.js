import { z } from 'zod';
import { API_TITLE, API_VERSION } from './enums.js';
import { ContractSchemas } from './schemas.js';
import { endpointContracts } from './routes.js';

const COMPONENT_SCHEMA_NAMES = [
  'ErrorResponse',
  'HealthResponse',
  'Machine',
  'MachineInput',
  'CreateTradeCaseRequest',
  'UpdateTradeCaseRequest',
  'TradeCaseResponse',
  'ListTradeCasesResponse',
  'EvidenceCreateRequest',
  'EvidenceUpdateRequest',
  'EvidenceResponse',
  'EvidenceBatchCreateRequest',
  'EvidenceBatchCreateResponse',
  'AnalyzeEvidenceRequest',
  'AnalyzeEvidenceResponse',
  'ChecklistResponse',
  'ProcessingStatusResponse',
  'GuidanceResponse',
  'RoutingResponse',
  'PacketResponse',
  'ReviewQueueCase',
  'ReviewQueueResponse',
  'ReviewCaseDetailResponse',
  'ReviewActionRequest',
  'ReviewActionResponse',
  'ArchiveResponse'
];

export function buildOpenApiDocument() {
  const components = {};
  for (const name of COMPONENT_SCHEMA_NAMES) {
    components[name] = toJsonSchema(ContractSchemas[name]);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: API_TITLE,
      version: API_VERSION,
      description: 'Versioned contract between OpenClaw tools and the Trade-In Agent sidecar.'
    },
    servers: [
      {
        url: 'http://127.0.0.1:8788',
        description: 'Local sidecar on the OpenClaw VM'
      }
    ],
    tags: [
      { name: 'health', description: 'Sidecar health and diagnostics.' },
      { name: 'trade-cases', description: 'Trade case workflow state.' },
      { name: 'evidence', description: 'Teams/OpenClaw media evidence registration and analysis.' },
      { name: 'review', description: 'Checklist, routing, guidance, and reviewer packets.' }
    ],
    paths: buildPaths(),
    components: {
      schemas: components
    },
    'x-api-version': API_VERSION,
    'x-stable-tool-names': endpointContracts
      .filter(endpoint => endpoint.stableToolName)
      .map(endpoint => endpoint.stableToolName)
  };
}

function buildPaths() {
  const paths = {};
  for (const endpoint of endpointContracts) {
    const path = endpoint.path;
    const method = endpoint.method.toLowerCase();
    paths[path] ||= {};
    paths[path][method] = {
      operationId: endpoint.operationId,
      summary: endpoint.summary,
      tags: [tagForPath(path)],
      parameters: [
        ...pathParameters(path),
        ...queryParameters(endpoint)
      ],
      responses: {
        [String(endpoint.successStatus)]: {
          description: 'Successful response',
          content: jsonContent(endpoint.responseSchema)
        },
        '400': {
          description: 'Contract validation error',
          content: jsonContent('ErrorResponse')
        },
        '404': {
          description: 'Resource not found',
          content: jsonContent('ErrorResponse')
        },
        '500': {
          description: 'Sidecar error',
          content: jsonContent('ErrorResponse')
        }
      },
      'x-api-version': API_VERSION,
      'x-stable-tool-name': endpoint.stableToolName,
      'x-legacy-tool-name': endpoint.legacyToolName || undefined
    };

    if (endpoint.requestSchema) {
      paths[path][method].requestBody = {
        required: true,
        content: jsonContent(endpoint.requestSchema)
      };
    }
  }
  return paths;
}

function toJsonSchema(schema) {
  const jsonSchema = z.toJSONSchema(schema);
  delete jsonSchema.$schema;
  return jsonSchema;
}

function jsonContent(schemaName) {
  return {
    'application/json': {
      schema: {
        $ref: `#/components/schemas/${schemaName}`
      },
      examples: examplesForSchema(schemaName)
    }
  };
}

function examplesForSchema(schemaName) {
  if (schemaName === 'CreateTradeCaseRequest') {
    return {
      combine: {
        summary: 'Start a combine trade case from Teams',
        value: {
          createdBy: 'teams:user-id',
          sourceConversationId: 'msteams:direct:user-id',
          machine: {
            unitType: 'combine',
            make: 'John Deere',
            model: 'S780',
            modelYear: 2021,
            engineHours: 1200,
            separatorHours: 850
          }
        }
      }
    };
  }
  if (schemaName === 'EvidenceBatchCreateRequest') {
    return {
      asyncTeamsUpload: {
        summary: 'Register Teams photo uploads and queue background analysis',
        value: {
          processingMode: 'async',
          items: [
            {
              uploadedBy: 'teams:user-id',
              mediaType: 'photo',
              storageUri: '/home/openclaw/.openclaw/media/inbound/example.jpg',
              contentType: 'image/jpeg',
              sourceMessageId: 'teams-message-id',
              sourceAttachmentId: 'teams-attachment-id',
              checklistSlot: 'front_45'
            }
          ]
        }
      }
    };
  }
  return undefined;
}

function pathParameters(path) {
  return [...path.matchAll(/\{([^}]+)\}/g)].map(match => ({
    name: match[1],
    in: 'path',
    required: true,
    schema: { type: 'string' }
  }));
}

function queryParameters(endpoint) {
  if (endpoint.path === '/trade-cases/active') {
    return [
      {
        name: 'sourceConversationId',
        in: 'query',
        required: true,
        schema: { type: 'string' }
      }
    ];
  }
  if (endpoint.path === '/trade-cases' && endpoint.method === 'GET') {
    return [
      {
        name: 'includeArchived',
        in: 'query',
        required: false,
        schema: { type: 'boolean' }
      }
    ];
  }
  if (endpoint.path === '/review/cases' && endpoint.method === 'GET') {
    return [
      {
        name: 'includeArchived',
        in: 'query',
        required: false,
        schema: { type: 'boolean' }
      },
      {
        name: 'limit',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 250 }
      }
    ];
  }
  return [];
}

function tagForPath(path) {
  if (path === '/health') return 'health';
  if (path.startsWith('/review/')) return 'review';
  if (path.includes('/evidence')) return 'evidence';
  if (path.includes('/checklist') || path.includes('/guidance') || path.includes('/routing') || path.includes('/packet')) {
    return 'review';
  }
  return 'trade-cases';
}
