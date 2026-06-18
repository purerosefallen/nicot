export interface SwaggerDecorators {
  API_OPERATION: string;
  API_RESPONSE: string;
  API_PRODUCES: string;
  API_CONSUMES: string;
  API_TAGS: string;
  API_WEBHOOK: string;
  API_CALLBACKS: string;
  API_PARAMETERS: string;
  API_HEADERS: string;
  API_MODEL_PROPERTIES: string;
  API_MODEL_PROPERTIES_ARRAY: string;
  API_SECURITY: string;
  API_EXCLUDE_ENDPOINT: string;
  API_INCLUDE_ENDPOINT: string;
  API_EXCLUDE_CONTROLLER: string;
  API_EXTRA_MODELS: string;
  API_EXTENSION: string;
  API_SCHEMA: string;
  API_DEFAULT_GETTER: string;
  API_LINK: string;
}

const DECORATORS_PREFIX = 'swagger';

const FALLBACK_DECORATORS: SwaggerDecorators = {
  API_OPERATION: `${DECORATORS_PREFIX}/apiOperation`,
  API_RESPONSE: `${DECORATORS_PREFIX}/apiResponse`,
  API_PRODUCES: `${DECORATORS_PREFIX}/apiProduces`,
  API_CONSUMES: `${DECORATORS_PREFIX}/apiConsumes`,
  API_TAGS: `${DECORATORS_PREFIX}/apiUseTags`,
  API_WEBHOOK: `${DECORATORS_PREFIX}/apiWebhook`,
  API_CALLBACKS: `${DECORATORS_PREFIX}/apiCallbacks`,
  API_PARAMETERS: `${DECORATORS_PREFIX}/apiParameters`,
  API_HEADERS: `${DECORATORS_PREFIX}/apiHeaders`,
  API_MODEL_PROPERTIES: `${DECORATORS_PREFIX}/apiModelProperties`,
  API_MODEL_PROPERTIES_ARRAY: `${DECORATORS_PREFIX}/apiModelPropertiesArray`,
  API_SECURITY: `${DECORATORS_PREFIX}/apiSecurity`,
  API_EXCLUDE_ENDPOINT: `${DECORATORS_PREFIX}/apiExcludeEndpoint`,
  API_INCLUDE_ENDPOINT: `${DECORATORS_PREFIX}/apiIncludeEndpoint`,
  API_EXCLUDE_CONTROLLER: `${DECORATORS_PREFIX}/apiExcludeController`,
  API_EXTRA_MODELS: `${DECORATORS_PREFIX}/apiExtraModels`,
  API_EXTENSION: `${DECORATORS_PREFIX}/apiExtension`,
  API_SCHEMA: `${DECORATORS_PREFIX}/apiSchema`,
  API_DEFAULT_GETTER: `${DECORATORS_PREFIX}/apiDefaultGetter`,
  API_LINK: `${DECORATORS_PREFIX}/apiLink`,
};

function loadSwaggerDecorators(): SwaggerDecorators {
  try {
    const req = typeof require === 'function' ? require : undefined;
    const decorators = req?.('@nestjs/swagger/dist/constants')?.DECORATORS;

    if (decorators) {
      return {
        ...FALLBACK_DECORATORS,
        ...decorators,
      };
    }
  } catch {
    // Newer @nestjs/swagger versions hide dist/constants behind package exports.
  }

  return FALLBACK_DECORATORS;
}

export const DECORATORS = loadSwaggerDecorators();
