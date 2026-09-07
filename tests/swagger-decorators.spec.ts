import 'reflect-metadata';

import { Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ApiHeader,
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';
import { DECORATORS } from '../src/utility/swagger-decorators';

describe('swagger decorators', () => {
  test('uses stable Swagger metadata keys', () => {
    expect(DECORATORS.API_MODEL_PROPERTIES).toBe(
      'swagger/apiModelProperties',
    );
    expect(DECORATORS.API_HEADERS).toBe('swagger/apiHeaders');
    expect(DECORATORS.API_PARAMETERS).toBe('swagger/apiParameters');
  });

  test('produces headers through the public Swagger API', async () => {
    @Controller('docs')
    class DocsController {
      @Get()
      @ApiHeader({ name: 'x-doc-header', required: true })
      read() {
        return 'ok';
      }
    }

    const testingModule = await Test.createTestingModule({
      controllers: [DocsController],
    }).compile();
    const app = testingModule.createNestApplication();
    await app.init();

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(document.paths['/docs']?.get?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ in: 'header', name: 'x-doc-header' }),
      ]),
    );

    await app.close();
  });
});
