import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AppError,
  badRequest,
  describeError,
  imageNotFound,
  isAppError,
  parseOrBadRequest,
  toErrorResponse,
  themeNotFound,
} from '../src/errors';

describe('AppError', () => {
  it('mappa i codici del contratto sugli status HTTP', () => {
    expect(new AppError('BAD_REQUEST', 'x').statusCode).toBe(400);
    expect(themeNotFound('travel', 'it-IT').statusCode).toBe(404);
    expect(imageNotFound('travel', 99).statusCode).toBe(404);
    expect(new AppError('RATE_LIMITED', 'x').statusCode).toBe(429);
    expect(new AppError('UPSTREAM_ERROR', 'x').statusCode).toBe(502);
    expect(new AppError('UPSTREAM_TIMEOUT', 'x').statusCode).toBe(504);
    expect(new AppError('UPSTREAM_UNAVAILABLE', 'x').statusCode).toBe(503);
    expect(new AppError('NOT_FOUND', 'x').statusCode).toBe(404);
    expect(new AppError('INTERNAL_ERROR', 'x').statusCode).toBe(500);
  });

  it('serializza la forma di errore del contratto e riconosce i retryable', () => {
    const error = badRequest('query non valida');
    expect(error.toJSON()).toEqual({ error: { code: 'BAD_REQUEST', message: 'query non valida' } });
    expect(error.retryable).toBe(false);
    expect(isAppError(error)).toBe(true);
    expect(isAppError(new Error('x'))).toBe(false);
    expect(themeNotFound('travel', 'it-IT').message).toContain('travel');
    expect(imageNotFound('travel', 7).message).toContain('#7');
  });

  it('toErrorResponse nasconde i dettagli degli errori non applicativi', () => {
    expect(toErrorResponse(badRequest('x'))).toEqual({
      statusCode: 400,
      payload: { error: { code: 'BAD_REQUEST', message: 'x' } },
    });
    expect(toErrorResponse(new Error('segreti interni'))).toEqual({
      statusCode: 500,
      payload: { error: { code: 'INTERNAL_ERROR', message: 'Errore interno del server' } },
    });
    expect(describeError(new Error('boom'))).toBe('boom');
    expect(describeError('stringa')).toBe('stringa');
  });
});

describe('parseOrBadRequest', () => {
  const schema = z.object({ mkt: z.string().optional(), w: z.coerce.number().int().min(16).optional() });

  it('ritorna i dati validati', () => {
    expect(parseOrBadRequest(schema, { w: '800' })).toEqual({ w: 800 });
  });

  it('lancia BAD_REQUEST indicando il parametro non valido', () => {
    expect(() => parseOrBadRequest(schema, { w: '10' }, 'query')).toThrowError(AppError);
    try {
      parseOrBadRequest(schema, { w: '10' }, 'query');
    } catch (error) {
      expect(isAppError(error) && error.code).toBe('BAD_REQUEST');
      expect(describeError(error)).toContain('w');
    }
  });
});
