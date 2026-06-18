describe('swagger decorators', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@nestjs/swagger/dist/constants');
  });

  test('uses swagger constants when the private subpath is available', () => {
    jest.isolateModules(() => {
      jest.doMock(
        '@nestjs/swagger/dist/constants',
        () => ({
          DECORATORS: {
            API_MODEL_PROPERTIES: 'custom/apiModelProperties',
          },
        }),
        { virtual: true },
      );

      const { DECORATORS } = require('../src/utility/swagger-decorators');

      expect(DECORATORS.API_MODEL_PROPERTIES).toBe('custom/apiModelProperties');
      expect(DECORATORS.API_HEADERS).toBe('swagger/apiHeaders');
    });
  });

  test('falls back to built-in constants when the private subpath is unavailable', () => {
    jest.isolateModules(() => {
      jest.doMock(
        '@nestjs/swagger/dist/constants',
        () => {
          throw new Error('Package subpath is not exported');
        },
        { virtual: true },
      );

      const { DECORATORS } = require('../src/utility/swagger-decorators');

      expect(DECORATORS.API_MODEL_PROPERTIES).toBe(
        'swagger/apiModelProperties',
      );
      expect(DECORATORS.API_HEADERS).toBe('swagger/apiHeaders');
      expect(DECORATORS.API_PARAMETERS).toBe('swagger/apiParameters');
    });
  });
});
