import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { reviewPersonaService } from '../services/review-personas.js';
import { logger } from '../lib/logger.js';
import { NotFoundError, BadRequestError } from '../lib/errors.js';

interface PersonaParams {
  personaId: string;
}

interface CreatePersonaBody {
  repositoryId: string;
  name: string;
  description: string;
  icon?: string;
  focusAreas: string[];
  strictnessLevel: 'lenient' | 'moderate' | 'strict';
  promptTemplate?: string;
}

interface UpdatePersonaBody extends Partial<Omit<CreatePersonaBody, 'repositoryId'>> {
  enabled?: boolean;
}

interface GeneratePromptBody {
  personaIds: string[];
  codeContext: string;
}

export default async function reviewPersonasRoutes(fastify: FastifyInstance): Promise<void> {
  // Get all personas (built-in + custom for optional repository)
  fastify.get<{ Querystring: { repositoryId?: string } }>(
    '/api/personas',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            repositoryId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: { repositoryId?: string } }>, reply: FastifyReply) => {
      const { repositoryId } = request.query;

      logger.info({ repositoryId }, 'Getting all review personas');

      const personas = await reviewPersonaService.getAllPersonas(repositoryId);

      return reply.code(200).send({
        success: true,
        data: personas,
      });
    }
  );

  // Get a specific persona
  fastify.get<{ Params: PersonaParams }>(
    '/api/personas/:personaId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['personaId'],
          properties: {
            personaId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: PersonaParams }>, reply: FastifyReply) => {
      const { personaId } = request.params;

      logger.info({ personaId }, 'Getting persona');

      const persona = await reviewPersonaService.getPersona(personaId);

      if (!persona) {
        throw new NotFoundError('Persona not found');
      }

      return reply.code(200).send({
        success: true,
        data: persona,
      });
    }
  );

  // Create a custom persona
  fastify.post<{ Body: CreatePersonaBody }>(
    '/api/personas',
    {
      schema: {
        body: {
          type: 'object',
          required: ['repositoryId', 'name', 'description', 'focusAreas', 'strictnessLevel'],
          properties: {
            repositoryId: { type: 'string' },
            name: { type: 'string', minLength: 1, maxLength: 100 },
            description: { type: 'string', maxLength: 500 },
            icon: { type: 'string', maxLength: 10 },
            focusAreas: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
            },
            strictnessLevel: { type: 'string', enum: ['lenient', 'moderate', 'strict'] },
            promptTemplate: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: CreatePersonaBody }>, reply: FastifyReply) => {
      const { repositoryId, ...data } = request.body;

      logger.info({ name: data.name, repositoryId }, 'Creating custom persona');

      const persona = await reviewPersonaService.createPersona(repositoryId, data);

      return reply.code(201).send({
        success: true,
        data: persona,
      });
    }
  );

  // Update a custom persona
  fastify.patch<{ Params: PersonaParams; Body: UpdatePersonaBody }>(
    '/api/personas/:personaId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['personaId'],
          properties: {
            personaId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            description: { type: 'string', maxLength: 500 },
            icon: { type: 'string', maxLength: 10 },
            focusAreas: {
              type: 'array',
              items: { type: 'string' },
            },
            strictnessLevel: { type: 'string', enum: ['lenient', 'moderate', 'strict'] },
            promptTemplate: { type: 'string' },
            enabled: { type: 'boolean' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: PersonaParams; Body: UpdatePersonaBody }>, reply: FastifyReply) => {
      const { personaId } = request.params;
      const updates = request.body;

      logger.info({ personaId }, 'Updating persona');

      // Check if persona exists and is not built-in
      const existing = await reviewPersonaService.getPersona(personaId);
      if (!existing) {
        throw new NotFoundError('Persona not found');
      }
      if (existing.isBuiltIn) {
        throw new BadRequestError('Cannot modify built-in personas');
      }

      const persona = await reviewPersonaService.updatePersona(personaId, updates);

      return reply.code(200).send({
        success: true,
        data: persona,
      });
    }
  );

  // Delete a custom persona
  fastify.delete<{ Params: PersonaParams }>(
    '/api/personas/:personaId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['personaId'],
          properties: {
            personaId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: PersonaParams }>, reply: FastifyReply) => {
      const { personaId } = request.params;

      logger.info({ personaId }, 'Deleting persona');

      // Check if persona exists and is not built-in
      const existing = await reviewPersonaService.getPersona(personaId);
      if (!existing) {
        throw new NotFoundError('Persona not found');
      }
      if (existing.isBuiltIn) {
        throw new BadRequestError('Cannot delete built-in personas');
      }

      await reviewPersonaService.deletePersona(personaId);

      return reply.code(204).send();
    }
  );

  // Get available focus areas
  fastify.get(
    '/api/personas/focus-areas',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const focusAreas = reviewPersonaService.getAvailableFocusAreas();

      return reply.code(200).send({
        success: true,
        data: focusAreas,
      });
    }
  );

  // Generate a review prompt for multiple personas
  fastify.post<{ Body: GeneratePromptBody }>(
    '/api/personas/generate-prompt',
    {
      schema: {
        body: {
          type: 'object',
          required: ['personaIds', 'codeContext'],
          properties: {
            personaIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
            codeContext: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: GeneratePromptBody }>, reply: FastifyReply) => {
      const { personaIds, codeContext } = request.body;

      logger.info({ personaIds }, 'Generating review prompt');

      const prompt = await reviewPersonaService.generateReviewPrompt(personaIds, codeContext);

      return reply.code(200).send({
        success: true,
        data: { prompt },
      });
    }
  );
}
